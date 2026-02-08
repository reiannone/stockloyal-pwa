<?php
declare(strict_types=1);

/**
 * notify-merchant-redemption.php
 *
 * Outbound notification to merchant when a member redeems points (places an order).
 * Called by the order-placement flow after a basket is submitted.
 *
 * Flow:
 *   1. Receive member_id, points_used, order_id from the order flow
 *   2. Read wallet to capture points_before (balance before deduction)
 *   3. Look up the merchant → get webhook_url, conversion_rate
 *   4. POST a points_redeemed event to the merchant's webhook_url
 *   5. Merchant responds synchronously with the confirmed new balance
 *        → update wallet table (points, cash_balance)
 *   6. Return the confirmed balance to the caller
 *
 * Endpoint: https://api.stockloyal.com/api/notify-merchant-redemption.php
 */

// ============================================================================
// CORS + method guard
// ============================================================================

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

$logDir  = '/var/www/html/stockloyal-pwa/logs';
$logFile = $logDir . '/merchant-redemption.log';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}

function logRedemption(string $logFile, string $msg): void
{
    file_put_contents($logFile, "[" . gmdate('Y-m-d H:i:s') . "] {$msg}\n", FILE_APPEND);
}

function respond(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

try {
    $conn = new PDO(
        "mysql:host=stockloyal-db.ctms60ci403w.us-east-2.rds.amazonaws.com;dbname=stockloyal;charset=utf8mb4",
        'admin',
        'StockLoyal2025!',
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    error_log("notify-merchant-redemption.php: DB connect failed: " . $e->getMessage());
    respond(['success' => false, 'error' => 'Database connection failed'], 500);
}

// ============================================================================
// PARSE INPUT
// ============================================================================

$input      = json_decode(file_get_contents('php://input'), true);
$memberId   = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
$pointsUsed = isset($input['points_used'])     ? (int) $input['points_used']
            : (isset($input['points_redeemed']) ? (int) $input['points_redeemed'] : 0);
$orderId    = $input['order_id'] ?? $input['basket_id'] ?? null;

if (!$memberId) {
    respond(['success' => false, 'error' => 'Missing member_id'], 400);
}

if ($pointsUsed <= 0) {
    respond(['success' => false, 'error' => 'points_used must be a positive integer'], 400);
}

logRedemption($logFile, str_repeat('=', 70));
logRedemption($logFile, "Redemption notification: member={$memberId}, points_used={$pointsUsed}, order_id={$orderId}");

// ============================================================================
// MAIN LOGIC
// ============================================================================

try {
    // ------------------------------------------------------------------
    // 1.  Get the member's current wallet row (points_before)
    // ------------------------------------------------------------------
    $walletStmt = $conn->prepare("
        SELECT member_id, merchant_id, points, member_tier,
               cash_balance, member_timezone, updated_at
        FROM   wallet
        WHERE  member_id = ?
        LIMIT  1
    ");
    $walletStmt->execute([$memberId]);
    $wallet = $walletStmt->fetch();

    if (!$wallet) {
        logRedemption($logFile, "⚠️ Wallet not found for {$memberId}");
        respond(['success' => false, 'error' => 'Member wallet not found'], 404);
    }

    $pointsBefore = (int) $wallet['points'];
    $merchantId   = $wallet['merchant_id'] ?? null;

    // Sanity: member must have enough points
    if ($pointsUsed > $pointsBefore) {
        logRedemption($logFile, "⚠️ Insufficient points: has {$pointsBefore}, tried to use {$pointsUsed}");
        respond([
            'success' => false,
            'error'   => "Insufficient points: member has {$pointsBefore}, cannot redeem {$pointsUsed}",
        ], 400);
    }

    if (!$merchantId) {
        logRedemption($logFile, "No merchant linked — deducting locally only");

        // Deduct locally and return
        $newBalance = $pointsBefore - $pointsUsed;
        $conn->prepare("UPDATE wallet SET points = ?, updated_at = NOW() WHERE member_id = ?")
             ->execute([$newBalance, $memberId]);

        respond([
            'success'       => true,
            'synced'        => false,
            'reason'        => 'no_merchant',
            'points_before' => $pointsBefore,
            'points_used'   => $pointsUsed,
            'points'        => $newBalance,
        ]);
    }

    // ------------------------------------------------------------------
    // 2.  Look up the merchant
    // ------------------------------------------------------------------
    $merchantStmt = $conn->prepare("
        SELECT merchant_id, merchant_name, webhook_url, api_key, conversion_rate
        FROM   merchant
        WHERE  merchant_id = ?
        LIMIT  1
    ");
    $merchantStmt->execute([$merchantId]);
    $merchant = $merchantStmt->fetch();

    if (!$merchant || empty(trim($merchant['webhook_url'] ?? ''))) {
        logRedemption($logFile, "Merchant {$merchantId} has no webhook_url — deducting locally");

        $newBalance = $pointsBefore - $pointsUsed;
        $conn->prepare("UPDATE wallet SET points = ?, updated_at = NOW() WHERE member_id = ?")
             ->execute([$newBalance, $memberId]);

        respond([
            'success'       => true,
            'synced'        => false,
            'reason'        => 'no_webhook_url',
            'points_before' => $pointsBefore,
            'points_used'   => $pointsUsed,
            'points'        => $newBalance,
        ]);
    }

    // ------------------------------------------------------------------
    // 3.  POST points_redeemed to the merchant
    // ------------------------------------------------------------------
    $requestId       = 'redeem_' . uniqid('', true);
    $outboundPayload = json_encode([
        'event_type'    => 'points_redeemed',
        'request_id'    => $requestId,
        'member_id'     => $memberId,
        'merchant_id'   => $merchantId,
        'points_used'   => $pointsUsed,
        'points_before' => $pointsBefore,
        'order_id'      => $orderId,
        'timestamp'     => gmdate('c'),
    ]);

    logRedemption($logFile, "→ POST {$merchant['webhook_url']}  payload={$outboundPayload}");

    $ch = curl_init($merchant['webhook_url']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $outboundPayload,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Event-Type: points_redeemed',
            'X-Request-Id: ' . $requestId,
            'X-Source: StockLoyal',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response  = curl_exec($ch);
    $httpCode  = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        logRedemption($logFile, "⚠️ cURL error: {$curlError}");
    }

    // ------------------------------------------------------------------
    // 4.  Process the merchant's response
    // ------------------------------------------------------------------
    $synced          = false;
    $confirmedPoints = $pointsBefore - $pointsUsed;   // local fallback
    $confirmedTier   = $wallet['member_tier'];
    $conversionRate  = (float) ($merchant['conversion_rate'] ?? 0);

    if ($httpCode >= 200 && $httpCode < 300 && $response) {
        $merchantResponse = json_decode($response, true);
        logRedemption($logFile, "← Merchant HTTP {$httpCode}: {$response}");

        if (is_array($merchantResponse) && ($merchantResponse['success'] ?? false)) {

            // --- points from merchant (authoritative) ---
            $mPoints = $merchantResponse['points']
                    ?? $merchantResponse['available_points']
                    ?? $merchantResponse['point_balance']
                    ?? null;

            if ($mPoints !== null) {
                $confirmedPoints = (int) $mPoints;
            }

            // --- tier from merchant ---
            $mTier = $merchantResponse['tier']
                  ?? $merchantResponse['member_tier']
                  ?? $merchantResponse['loyalty_tier']
                  ?? null;

            if ($mTier !== null) {
                $confirmedTier = $mTier;
            }

            $synced = true;
            logRedemption($logFile, "✅ Merchant confirmed: points={$confirmedPoints}, tier={$confirmedTier}");
        } else {
            logRedemption($logFile, "⚠️ Merchant response invalid — using local calculation");
        }
    } else {
        logRedemption($logFile, "⚠️ Merchant unreachable (HTTP {$httpCode}) — using local calculation");
    }

    // ------------------------------------------------------------------
    // 5.  Update wallet with confirmed balance
    // ------------------------------------------------------------------
    $setClauses = ['points = ?', 'updated_at = NOW()'];
    $params     = [$confirmedPoints];

    // Recalculate cash_balance
    $newCashBalance = $wallet['cash_balance'];
    if ($conversionRate > 0) {
        $newCashBalance = number_format($confirmedPoints * $conversionRate, 2, '.', '');
        $setClauses[]   = 'cash_balance = ?';
        $params[]       = $newCashBalance;
    }

    // Update tier if merchant changed it
    $tierChanged = false;
    if ($confirmedTier !== $wallet['member_tier']) {
        $setClauses[] = 'member_tier = ?';
        $params[]     = $confirmedTier;
        $tierChanged  = true;
    }

    $params[] = $memberId;
    $sql = "UPDATE wallet SET " . implode(', ', $setClauses) . " WHERE member_id = ?";
    $conn->prepare($sql)->execute($params);

    logRedemption($logFile, "✅ Wallet updated: {$pointsBefore} → {$confirmedPoints} pts, cash={$newCashBalance}");

    // ------------------------------------------------------------------
    // 6.  Log the redemption to transactions_ledger
    // ------------------------------------------------------------------
    try {
        $conn->prepare("
            INSERT INTO transactions_ledger
              (member_id, merchant_id, client_tx_id, tx_type, direction,
               channel, status, amount_points, note, member_timezone)
            VALUES (?, ?, ?, 'points_redeemed', 'outbound',
                    'Order Placement', 'confirmed', ?, ?, ?)
        ")->execute([
            $memberId,
            $merchantId,
            $requestId,
            $pointsUsed,
            "Redeemed {$pointsUsed} pts for order {$orderId} — merchant confirmed balance: {$confirmedPoints}",
            $wallet['member_timezone'] ?? 'America/New_York',
        ]);
        logRedemption($logFile, "✅ Ledger entry: points_redeemed {$pointsUsed} pts");
    } catch (PDOException $e) {
        logRedemption($logFile, "⚠️ Ledger insert failed: " . $e->getMessage());
    }

    // ------------------------------------------------------------------
    // 7.  Return result
    // ------------------------------------------------------------------
    logRedemption($logFile, str_repeat('-', 70));

    respond([
        'success'         => true,
        'synced'          => $synced,
        'points_before'   => $pointsBefore,
        'points_used'     => $pointsUsed,
        'points'          => $confirmedPoints,
        'member_tier'     => $confirmedTier,
        'cash_balance'    => $newCashBalance,
        'tier_changed'    => $tierChanged,
        'order_id'        => $orderId,
        'request_id'      => $requestId,
    ]);

} catch (Exception $e) {
    logRedemption($logFile, "❌ ERROR: " . $e->getMessage());
    respond(['success' => false, 'error' => $e->getMessage()], 500);
}
