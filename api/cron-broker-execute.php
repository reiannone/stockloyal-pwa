<?php
/**
 * cron-broker-execute.php
 * ============================================================================
 * Automated broker execution cron job for StockLoyal.
 *
 * Runs on AWS EC2 via crontab. Picks up orders with status = "placed" and
 * submits them to Alpaca's Broker API for execution.
 *
 * PIPELINE POSITION:
 *   Prepare -> Settlement -> Journal -> Order Sweep -> [THIS CRON] -> Broker Fills
 *
 * CRONTAB (runs every 5 min during market hours, M-F):
 *   */5 9-16 * * 1-5 /usr/bin/php /var/www/api/cron-broker-execute.php >> /var/log/stockloyal/cron-broker-exec.log 2>&1
 *
 "C:\xampp\htdocs\stockloyal-pwa\api\alpaca-broker-config.php"

# 3. EC2 Host (rename variable so we avoid conflict with $Host)
$EC2 = "ec2-user@3.150.49.91"

# 4. Destination on remote server
$DEST = "/home/ec2-user/alpaca-broker-config.php"

# 5. Upload using scp — THIS WORKS IN POWERSHELL
scp -i $KEY "$SRC" "${EC2}:${DEST}" * ALTERNATE: trigger immediately after sweep via CLI:
 *   php cron-broker-execute.php --trigger=sweep
 *
 * CREDENTIALS:
 *   Per-merchant credentials loaded from SecretManager via merchant_broker_config.
 *   Falls back to ENV vars during migration:
 *     ALPACA_BROKER_API_KEY, ALPACA_BROKER_API_SECRET, ALPACA_ENV
 *   DB: DB_HOST, DB_NAME, DB_USER, DB_PASS
 *
 * TODO (Phase 3 - BrokerAdapter):
 *   - Group placed orders by merchant_id + broker_id
 *   - Load per-merchant credentials from merchant_broker_config + SecretManager
 *   - Use BrokerAdapterFactory::forMerchantBroker() instead of alpaca_api_call()
 * ============================================================================
 */

// -- Bootstrap ----------------------------------------------------------------

// Prevent web access
if (php_sapi_name() !== 'cli' && !defined('CRON_INTERNAL_TRIGGER')) {
    http_response_code(403);
    die("CLI or internal trigger only.\n");
}

require_once __DIR__ . '/db.php';        // PDO connection -> $pdo
require_once __DIR__ . '/env.php';       // loads .env vars

date_default_timezone_set('America/New_York');

// CLI args
$triggerType = 'cron';
foreach ($argv ?? [] as $arg) {
    if (strpos($arg, '--trigger=') === 0) {
        $triggerType = substr($arg, strlen('--trigger='));
    }
}

// -- Config -------------------------------------------------------------------
// During migration: try SecretManager, fall back to getenv().
// Once BrokerAdapter is built, this global config block goes away entirely --
// each merchant-broker pair gets its own credentials from the adapter factory.

$ALPACA_ENV = getenv('ALPACA_ENV') ?: 'paper';
$ALPACA_BASE_URL = $ALPACA_ENV === 'live'
    ? 'https://broker-api.alpaca.markets'
    : 'https://broker-api.sandbox.alpaca.markets';

// Try SecretManager with fallback to getenv()
$_smAvailable = file_exists(__DIR__ . '/SecretManager.php');
if ($_smAvailable) {
    require_once __DIR__ . '/SecretManager.php';
    $ALPACA_API_KEY    = SecretManager::getWithFallback('stockloyal/global/alpaca/broker_api_key', 'ALPACA_BROKER_API_KEY')
                         ?? getenv('ALPACA_BROKER_API_KEY');
    $ALPACA_API_SECRET = SecretManager::getWithFallback('stockloyal/global/alpaca/broker_api_secret', 'ALPACA_BROKER_API_SECRET')
                         ?? getenv('ALPACA_BROKER_API_SECRET');
} else {
    $ALPACA_API_KEY    = getenv('ALPACA_BROKER_API_KEY');
    $ALPACA_API_SECRET = getenv('ALPACA_BROKER_API_SECRET');
}

$RUN_ID   = gen_uuid();
$HOSTNAME = gethostname() ?: 'unknown';
$START_TS = microtime(true);

log_msg("=== CRON BROKER EXECUTE START === run_id={$RUN_ID} trigger={$triggerType} env={$ALPACA_ENV}");

// -- Step 0: Check Alpaca Market Calendar + Clock -----------------------------

$todayET = date('Y-m-d');
$nowET   = date('H:i');

$marketOpen  = '09:30';
$marketClose = '16:00';

// -- Step 0a: Alpaca Calendar -- check if today is a trading day --

$calendarData = get_market_calendar($todayET);

if ($calendarData === null) {
    log_msg("WARNING: Calendar API unavailable, falling back to Clock check");
    $marketStatus = 'calendar_error';
    $marketOpen   = '09:30';
    $marketClose  = '16:00';
    $isTradingDay = true;
} elseif (empty($calendarData)) {
    $marketStatus = 'holiday';
    log_msg("Today ({$todayET}) is not a trading day per Alpaca Calendar (holiday/weekend).");

    if ($triggerType === 'cron') {
        record_run($RUN_ID, $triggerType, 'no_orders', 0, 0, 0, 0, 0, 0, $marketStatus,
                   "Not a trading day ({$todayET})", $HOSTNAME);
        exit(0);
    }
    log_msg("Manual trigger -- proceeding despite non-trading day.");
    $isTradingDay = false;
    $marketOpen   = '09:30';
    $marketClose  = '16:00';
} else {
    $isTradingDay = true;
    $marketOpen   = $calendarData['open']  ?? '09:30';
    $marketClose  = $calendarData['close'] ?? '16:00';
    $marketStatus = 'trading_day';

    log_msg("Trading day confirmed: open={$marketOpen} close={$marketClose}");

    if ($nowET < $marketOpen) {
        $marketStatus = 'pre_market';
        log_msg("Market not yet open (now={$nowET}, open={$marketOpen})");

        if ($triggerType === 'cron') {
            record_run($RUN_ID, $triggerType, 'no_orders', 0, 0, 0, 0, 0, 0, $marketStatus,
                       "Pre-market: now={$nowET} open={$marketOpen}", $HOSTNAME);
            exit(0);
        }
    }

    if ($nowET > $marketClose) {
        $marketStatus = 'after_hours';
        log_msg("Market already closed (now={$nowET}, close={$marketClose})");

        if ($triggerType === 'cron') {
            record_run($RUN_ID, $triggerType, 'no_orders', 0, 0, 0, 0, 0, 0, $marketStatus,
                       "After hours: now={$nowET} close={$marketClose}", $HOSTNAME);
            exit(0);
        }
    }

    if ($marketClose !== '16:00') {
        $marketStatus = 'early_close';
        log_msg("*** EARLY CLOSE today -- market closes at {$marketClose} ET ***");
    }
}

// -- Step 0b: Alpaca Clock -- real-time confirmation --

$clockData = get_market_clock();
$clockIsOpen = $clockData['is_open'] ?? null;

if ($clockIsOpen === false && $triggerType === 'cron') {
    $marketStatus = 'closed_clock';
    log_msg("Clock API reports market closed. Skipping.");
    record_run($RUN_ID, $triggerType, 'no_orders', 0, 0, 0, 0, 0, 0, $marketStatus,
               'Market closed per Clock API', $HOSTNAME);
    exit(0);
}

if ($clockIsOpen === true) {
    $marketStatus = 'open';
    $nextClose = $clockData['next_close'] ?? null;
    log_msg("Clock confirms market OPEN. Next close: {$nextClose}");
}

log_msg("Market check passed: status={$marketStatus} today={$todayET} now={$nowET} " .
        "open={$marketOpen} close={$marketClose}");

// -- Step 1: Find placed orders -----------------------------------------------

$stmt = $pdo->prepare("
    SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id, o.broker,
           o.symbol, o.shares, o.amount, o.points_used, o.order_type,
           o.placed_at,
           m.alpaca_account_id
    FROM orders o
    LEFT JOIN members m ON m.member_id = o.member_id
    WHERE o.status = 'placed'
    ORDER BY o.placed_at ASC
");
$stmt->execute();
$placedOrders = $stmt->fetchAll(PDO::FETCH_ASSOC);

$orderCount = count($placedOrders);
log_msg("Found {$orderCount} placed order(s)");

if ($orderCount === 0) {
    record_run($RUN_ID, $triggerType, 'no_orders', 0, 0, 0, 0, 0, 0, $marketStatus,
               null, $HOSTNAME);
    log_msg("No placed orders. Exiting.");
    exit(0);
}

// -- Step 2: Record run start -------------------------------------------------

$pdo->prepare("
    INSERT INTO cron_exec_log
        (run_id, trigger_type, status, orders_found, started_at, market_status,
         market_open, market_close, alpaca_env, hostname)
    VALUES (?, ?, 'processing', ?, NOW(), ?, ?, ?, ?, ?)
")->execute([$RUN_ID, $triggerType, $orderCount, $marketStatus,
             $marketOpen ?? null, $marketClose ?? null, $ALPACA_ENV, $HOSTNAME]);

// -- Step 3: Group by member's Alpaca account & submit ------------------------

$submitted  = 0;
$failed     = 0;
$totalAmt   = 0;
$basketSet  = [];
$brokerSet  = [];

foreach ($placedOrders as $order) {
    $orderId        = $order['order_id'];
    $alpacaAcctId   = $order['alpaca_account_id'] ?? null;
    $symbol         = strtoupper($order['symbol']);
    $notional       = floatval($order['amount']);
    $basketId       = $order['basket_id'];
    $broker         = $order['broker'] ?? 'alpaca';

    $basketSet[$basketId] = true;
    $brokerSet[$broker]   = true;

    if (empty($alpacaAcctId)) {
        log_msg("  SKIP order #{$orderId}: member {$order['member_id']} has no alpaca_account_id");
        record_order_result($RUN_ID, $order, null, 'error',
                            'Member has no Alpaca account ID');
        mark_order_failed($orderId, 'No Alpaca account');
        $failed++;
        continue;
    }

    $alpacaPayload = [
        'symbol'      => $symbol,
        'notional'    => number_format($notional, 2, '.', ''),
        'side'        => 'buy',
        'type'        => 'market',
        'time_in_force' => 'day',
    ];

    log_msg("  Submitting order #{$orderId}: {$symbol} \${$notional} -> account {$alpacaAcctId}");

    $result = alpaca_api_call(
        "POST",
        "/v1/trading/accounts/{$alpacaAcctId}/orders",
        $alpacaPayload
    );

    if ($result['success']) {
        $alpacaOrderId = $result['data']['id'] ?? null;
        $alpacaStatus  = $result['data']['status'] ?? 'unknown';

        log_msg("    OK Alpaca order created: {$alpacaOrderId} status={$alpacaStatus}");

        $pdo->prepare("
            UPDATE orders
            SET status = 'submitted',
                broker_order_id = ?,
                broker_ref = ?,
                submitted_at = NOW()
            WHERE order_id = ?
        ")->execute([$alpacaOrderId, $alpacaStatus, $orderId]);

        record_order_result($RUN_ID, $order, $alpacaOrderId, 'submitted', null, $alpacaStatus);

        $submitted++;
        $totalAmt += $notional;
    } else {
        $errMsg = $result['error'] ?? 'Unknown Alpaca error';
        log_msg("    FAIL order #{$orderId}: {$errMsg}");

        record_order_result($RUN_ID, $order, null, 'rejected', $errMsg);
        mark_order_failed($orderId, $errMsg);
        $failed++;
    }

    usleep(100000); // 100ms rate limit delay
}

// -- Step 4: Finalize run -----------------------------------------------------

$durationMs = round((microtime(true) - $START_TS) * 1000);
$finalStatus = ($failed > 0 && $submitted === 0) ? 'failed' : 'completed';

$pdo->prepare("
    UPDATE cron_exec_log
    SET status = ?,
        orders_submitted = ?,
        orders_failed = ?,
        baskets_processed = ?,
        brokers_processed = ?,
        total_amount = ?,
        completed_at = NOW(),
        duration_ms = ?
    WHERE run_id = ?
")->execute([
    $finalStatus, $submitted, $failed,
    count($basketSet), count($brokerSet),
    $totalAmt, $durationMs, $RUN_ID
]);

log_msg("=== CRON COMPLETE === submitted={$submitted} failed={$failed} duration={$durationMs}ms status={$finalStatus}");


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Call Alpaca Broker API
 */
function alpaca_api_call(string $method, string $endpoint, array $body = []): array {
    global $ALPACA_BASE_URL, $ALPACA_API_KEY, $ALPACA_API_SECRET;

    $url = rtrim($ALPACA_BASE_URL, '/') . $endpoint;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Basic ' . base64_encode($ALPACA_API_KEY . ':' . $ALPACA_API_SECRET),
        ],
        CURLOPT_CUSTOMREQUEST  => $method,
    ]);

    if ($method === 'POST' && !empty($body)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        return ['success' => false, 'error' => "cURL error: {$curlErr}", 'http_code' => 0];
    }

    $data = json_decode($response, true);

    if ($httpCode >= 200 && $httpCode < 300) {
        return ['success' => true, 'data' => $data, 'http_code' => $httpCode];
    }

    $errMsg = $data['message'] ?? $data['error'] ?? $response;
    return ['success' => false, 'error' => $errMsg, 'http_code' => $httpCode, 'data' => $data];
}


/**
 * Get today's market calendar from Alpaca.
 */
function get_market_calendar(string $date): ?array {
    $result = alpaca_api_call('GET', "/v1/calendar?start={$date}&end={$date}");

    if (!$result['success']) {
        log_msg("Calendar API error: " . ($result['error'] ?? 'unknown'));
        return null;
    }

    $days = $result['data'] ?? [];

    if (is_array($days) && count($days) > 0) {
        return $days[0];
    }

    return [];
}


/**
 * Get real-time market clock from Alpaca.
 */
function get_market_clock(): array {
    $result = alpaca_api_call('GET', '/v1/clock');

    if ($result['success'] && isset($result['data'])) {
        return $result['data'];
    }

    log_msg("Clock API error: " . ($result['error'] ?? 'unknown'));
    return [];
}


/**
 * Record per-order result in cron_exec_orders
 */
function record_order_result(string $runId, array $order, ?string $alpacaOrderId,
                              string $submitStatus, ?string $error = null,
                              ?string $alpacaStatus = null): void {
    global $pdo;
    $pdo->prepare("
        INSERT INTO cron_exec_orders
            (run_id, order_id, basket_id, member_id, symbol, amount, shares,
             alpaca_order_id, alpaca_status, submit_status, submit_error, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ")->execute([
        $runId,
        $order['order_id'],
        $order['basket_id'] ?? null,
        $order['member_id'] ?? null,
        $order['symbol'],
        $order['amount'] ?? 0,
        $order['shares'] ?? 0,
        $alpacaOrderId,
        $alpacaStatus,
        $submitStatus,
        $error,
    ]);
}


/**
 * Mark an order as failed in the orders table
 */
function mark_order_failed(int $orderId, string $reason): void {
    global $pdo;
    $pdo->prepare("
        UPDATE orders
        SET status = 'failed',
            error_message = ?,
            fail_reason = 'alpaca_submit'
        WHERE order_id = ?
    ")->execute([$reason, $orderId]);
}


/**
 * Record a run (for early exits like no_orders or market closed)
 */
function record_run(string $runId, string $trigger, string $status,
                     int $found, int $submitted, int $failed,
                     int $baskets, int $brokers, float $amount,
                     ?string $market, ?string $error, string $host): void {
    global $pdo, $ALPACA_ENV, $START_TS, $marketOpen, $marketClose;
    $durationMs = round((microtime(true) - $START_TS) * 1000);
    $pdo->prepare("
        INSERT INTO cron_exec_log
            (run_id, trigger_type, status, orders_found, orders_submitted, orders_failed,
             baskets_processed, brokers_processed, total_amount,
             started_at, completed_at, duration_ms, market_status, market_open, market_close,
             alpaca_env, error_message, hostname)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $runId, $trigger, $status, $found, $submitted, $failed,
        $baskets, $brokers, $amount, $durationMs,
        $market, $marketOpen ?? null, $marketClose ?? null,
        $ALPACA_ENV, $error, $host
    ]);
}


/**
 * Generate a UUID v4
 */
function gen_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}


/**
 * Logging
 */
function log_msg(string $msg): void {
    $ts = date('Y-m-d H:i:s');
    echo "[{$ts}] {$msg}\n";
}
