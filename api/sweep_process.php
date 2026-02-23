<?php
declare(strict_types=1);

/**
 * sweep_process.php — Core Sweep Engine
 *
 * Called by trigger_sweep.php when admin clicks "Run Sweep" / "Run Sweep Now".
 *
 * Architecture:
 *   merchant → member basket_id → broker execution
 *
 * Broker routing by broker_master.broker_type:
 *
 *   'alpaca'  →  Alpaca Broker API (real trading)
 *                1. Journal cash (JNLC) from firm → member account
 *                2. Submit market orders per member via POST /v1/trading/accounts/{id}/orders
 *                3. Store Alpaca order_id → orders.broker_ref
 *                4. Mark order confirmed/failed based on API response
 *
 *   'webhook' →  Legacy webhook notification (existing flow)
 *                1. Mark orders → 'placed'
 *                2. POST payload to broker webhook_url
 *                3. Capture acknowledgement
 *
 * Tables read:   orders, merchant, broker_master, broker_credentials
 * Tables write:  orders (status, broker_ref), broker_notifications, sweep_log
 */

class SweepProcess
{
    private PDO    $conn;
    private string $logFile;
    private string $batchId;
    private array  $errors      = [];
    private array  $logMessages = [];

    public function __construct(PDO $conn)
    {
        $this->conn = $conn;

        $logDir = '/var/www/html/stockloyal-pwa/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0755, true);
        }
        $this->logFile = $logDir . '/sweep-process.log';
    }

    private function log(string $msg): void
    {
        $ts = gmdate('Y-m-d H:i:s');
        $line = "[{$ts}] {$msg}";
        $this->logMessages[] = $line;
        @file_put_contents($this->logFile, "{$line}\n", FILE_APPEND);
    }

    // ====================================================================
    // PUBLIC — run()
    // ====================================================================

    public function run(?string $merchantId = null): array
    {
        $this->batchId = 'SWP-' . date('Ymd-His') . '-' . substr(uniqid(), -6);
        $startTime     = microtime(true);
        $startedAt     = date('Y-m-d H:i:s');  // actual wall-clock start for sweep_log

        $this->log(str_repeat('=', 80));
        $this->log("SWEEP BATCH START: {$this->batchId}");
        $this->log($merchantId ? "Merchant: {$merchantId}" : "All merchants");

        // 1. Fetch pending orders
        $orders = $this->getPendingOrders($merchantId);

        if (empty($orders)) {
            $this->log("No pending orders — nothing to sweep.");
            return $this->buildResult(0, 0, 0, [], [], microtime(true) - $startTime);
        }

        // 1b. Pre-flight: check if any orders route to Alpaca
        $groups = $this->groupByMerchantBroker($orders);
        $hasAlpaca = false;
        foreach ($groups as $g) {
            $bi = $this->getBrokerInfo($g['broker']);
            if (($bi['broker_type'] ?? 'webhook') === 'alpaca') {
                $hasAlpaca = true;
                break;
            }
        }

        // 1c. If Alpaca orders exist, verify market is open
        if ($hasAlpaca) {
            $clockCheck = $this->checkMarketOpen();
            if (!$clockCheck['is_open']) {
                $nextOpen = $clockCheck['next_open'] ?? 'unknown';
                $msg = "Market is closed — sweep aborted. Next open: {$nextOpen}";
                $this->log("🚫 {$msg}");
                $this->errors[] = $msg;

                return [
                    'success'            => false,
                    'batch_id'           => $this->batchId,
                    'orders_placed'      => 0,
                    'orders_failed'      => 0,
                    'merchants_processed' => 0,
                    'baskets_processed'  => count(array_unique(array_column($orders, 'basket_id'))),
                    'brokers_notified'   => [],
                    'basket_results'     => [],
                    'duration_seconds'   => round(microtime(true) - $startTime, 2),
                    'errors'             => $this->errors,
                    'log'                => $this->logMessages,
                    'market_closed'      => true,
                    'next_market_open'   => $nextOpen,
                ];
            }
            $this->log("✅ Market is OPEN — proceeding with sweep");
        }

        $this->log("Found " . count($orders) . " order(s) across "
                    . count($groups) . " merchant-broker group(s)");

        $totalPlaced   = 0;
        $totalFailed   = 0;
        $merchantSet   = [];
        $groupResults  = [];

        // 3. Process each merchant-broker group
        foreach ($groups as $comboKey => $group) {
            $merchId    = $group['merchant_id'];
            $merchName  = $group['merchant_name'];
            $brokerName = $group['broker'];
            $allOrders  = $group['orders'];

            if ($merchId) $merchantSet[$merchId] = true;

            $basketCount  = count(array_unique(array_column($allOrders, 'basket_id')));
            $memberCount  = count(array_unique(array_column($allOrders, 'member_id')));

            $this->log("=== Group: {$merchName} / {$brokerName}  "
                        . "members={$memberCount}  baskets={$basketCount}  "
                        . "orders=" . count($allOrders) . " ===");

            try {
                $result = $this->processMerchantBrokerGroup($group);
                $totalPlaced += $result['orders_placed'];
                $totalFailed += $result['orders_failed'];
                $groupResults[] = $result;
            } catch (\Exception $e) {
                $this->log("❌ Group {$comboKey} EXCEPTION: " . $e->getMessage());
                $this->errors[] = "Group {$comboKey}: " . $e->getMessage();
                $totalFailed += count($allOrders);

                $groupResults[] = [
                    'merchant_id'   => $merchId,
                    'merchant_name' => $merchName,
                    'broker'        => $brokerName,
                    'orders_placed' => 0,
                    'orders_failed' => count($allOrders),
                    'member_count'  => $memberCount,
                    'member_ids'    => array_values(array_unique(array_column($allOrders, 'member_id'))),
                    'basket_count'  => $basketCount,
                    'acknowledged'  => false,
                    'error'         => $e->getMessage(),
                    'request'       => null,
                    'response'      => null,
                ];
            }
        }

        $duration = microtime(true) - $startTime;

        // 4. Collect unique broker names that acknowledged
        $brokersNotified = array_values(array_unique(array_filter(
            array_map(fn($r) => $r['acknowledged'] ? $r['broker'] : null, $groupResults)
        )));

        // 5. Log batch to sweep_log
        $this->logSweepBatch($totalPlaced, $totalFailed,
                             count($merchantSet), $brokersNotified, $duration, $startedAt);

        // 6. Clear picks for one-time election members
        $oneTimeCleared = $this->clearOneTimePicks($groupResults);
        if ($oneTimeCleared > 0) {
            $this->log("Cleared picks for {$oneTimeCleared} one-time election member(s)");
        }

        $this->log("SWEEP DONE: placed={$totalPlaced}  failed={$totalFailed}  "
                    . "groups=" . count($groups) . "  duration=" . round($duration, 2) . "s");
        $this->log(str_repeat('-', 80));

        return $this->buildResult(
            $totalPlaced, $totalFailed, count($merchantSet),
            $brokersNotified, $groupResults, $duration
        );
    }

    // ====================================================================
    // PRIVATE — query
    // ====================================================================

    private function getPendingOrders(?string $merchantId): array
    {
        $sql = "
            SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
                   o.symbol, o.shares, o.amount, o.points_used,
                   o.status, o.placed_at, o.broker, o.order_type,
                   m.merchant_name,
                   COALESCE(bc_direct.username, bc_alpaca.username) AS brokerage_id,
                   COALESCE(bc_direct.broker_account_id, bc_alpaca.broker_account_id) AS broker_account_id
            FROM   orders o
            LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
            LEFT JOIN broker_master bm
                   ON (bm.broker_name = o.broker OR bm.broker_id = o.broker)
            LEFT JOIN broker_credentials bc_direct
                   ON bc_direct.member_id = o.member_id AND LOWER(bc_direct.broker) = LOWER(o.broker)
            LEFT JOIN broker_credentials bc_alpaca
                   ON bc_alpaca.member_id = o.member_id AND LOWER(bc_alpaca.broker) = 'alpaca'
                   AND COALESCE(bm.broker_type, 'webhook') = 'alpaca'
            WHERE  LOWER(o.status) IN ('pending','queued')
        ";

        if ($merchantId) {
            $sql .= " AND o.merchant_id = ? ";
            $sql .= " ORDER BY o.basket_id, o.placed_at ASC";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([$merchantId]);
        } else {
            $sql .= " ORDER BY o.merchant_id, o.basket_id, o.placed_at ASC";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute();
        }

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function groupByMerchantBroker(array $orders): array
    {
        $groups = [];
        foreach ($orders as $o) {
            $key = ($o['merchant_id'] ?? 'unknown') . '::' . ($o['broker'] ?? 'unknown');
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'merchant_id'   => $o['merchant_id'] ?? null,
                    'merchant_name' => $o['merchant_name'] ?? null,
                    'broker'        => $o['broker'] ?? 'unknown',
                    'orders'        => [],
                ];
            }
            $groups[$key]['orders'][] = $o;
        }
        return $groups;
    }

    private function getBrokerInfo(string $brokerName): array
    {
        $stmt = $this->conn->prepare("
            SELECT broker_id, broker_name, webhook_url, api_key, broker_type
            FROM   broker_master
            WHERE  broker_name = ? OR broker_id = ?
            LIMIT  1
        ");
        $stmt->execute([$brokerName, $brokerName]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: ['broker_name' => $brokerName, 'broker_type' => 'webhook'];
    }

    // ====================================================================
    // PRIVATE — Alpaca pre-flight checks
    // ====================================================================

    /**
     * Check if US equity market is currently open via Alpaca clock API.
     * Returns: ['is_open' => bool, 'next_open' => string, 'next_close' => string]
     */
    private function checkMarketOpen(): array
    {
        require_once __DIR__ . '/AlpacaBrokerAPI.php';
        try {
            $alpaca = new AlpacaBrokerAPI();
            $result = $alpaca->getMarketClock();

            if (!$result['success']) {
                $this->log("⚠️ Clock API failed: " . ($result['error'] ?? 'unknown'));
                // If we can't check, default to open (don't block sweep on clock failure)
                return ['is_open' => true, 'next_open' => null, 'next_close' => null];
            }

            $data = $result['data'];
            $isOpen    = $data['is_open'] ?? false;
            $nextOpen  = $data['next_open'] ?? null;
            $nextClose = $data['next_close'] ?? null;

            $this->log("🕐 Market clock: is_open=" . ($isOpen ? 'YES' : 'NO')
                        . "  next_open={$nextOpen}  next_close={$nextClose}");

            return [
                'is_open'    => (bool) $isOpen,
                'next_open'  => $nextOpen,
                'next_close' => $nextClose,
            ];
        } catch (\Exception $e) {
            $this->log("⚠️ Clock API exception: " . $e->getMessage());
            return ['is_open' => true, 'next_open' => null, 'next_close' => null];
        }
    }

    /**
     * Validate a symbol against Alpaca's asset database.
     * Returns: ['valid' => bool, 'error_code' => string|null, 'error' => string|null, 'asset' => array|null]
     *
     * Error codes:
     *   ASSET_NOT_FOUND        — symbol doesn't exist
     *   ASSET_NOT_ACTIVE       — delisted or halted
     *   ASSET_NOT_TRADABLE     — exists but can't be traded
     *   ASSET_NOT_FRACTIONABLE — can't use notional (dollar) orders
     */
    private function validateAlpacaAsset(AlpacaBrokerAPI $alpaca, string $symbol, bool $needsFractional): array
    {
        $result = $alpaca->getAsset($symbol);

        if (!$result['success']) {
            $httpCode = $result['http_code'] ?? 0;
            if ($httpCode === 404) {
                return ['valid' => false, 'error_code' => 'ASSET_NOT_FOUND',
                        'error' => "Asset \"{$symbol}\" not found on Alpaca"];
            }
            return ['valid' => false, 'error_code' => 'ASSET_LOOKUP_FAILED',
                    'error' => "Asset lookup failed: " . ($result['error'] ?? 'unknown')];
        }

        $asset  = $result['data'];
        $status = $asset['status'] ?? '';
        $tradable     = $asset['tradable'] ?? false;
        $fractionable = $asset['fractionable'] ?? false;

        if ($status !== 'active') {
            return ['valid' => false, 'error_code' => 'ASSET_NOT_ACTIVE',
                    'error' => "Asset {$symbol} status is \"{$status}\" (not active)", 'asset' => $asset];
        }
        if (!$tradable) {
            return ['valid' => false, 'error_code' => 'ASSET_NOT_TRADABLE',
                    'error' => "Asset {$symbol} is not tradable", 'asset' => $asset];
        }
        if ($needsFractional && !$fractionable) {
            return ['valid' => false, 'error_code' => 'ASSET_NOT_FRACTIONABLE',
                    'error' => "Asset {$symbol} does not support fractional/notional orders", 'asset' => $asset];
        }

        return ['valid' => true, 'error_code' => null, 'error' => null, 'asset' => $asset];
    }

    /**
     * Normalize symbol for Alpaca's API format.
     * Yahoo uses BTC-USD, ETH-USD — Alpaca uses BTC/USD, ETH/USD for crypto.
     */
    private function normalizeSymbolForAlpaca(string $symbol): string
    {
        // Common crypto pairs: XXX-USD → XXX/USD
        if (preg_match('/^([A-Z]{2,6})-USD$/i', $symbol, $m)) {
            $base = strtoupper($m[1]);
            $cryptoBases = ['BTC','ETH','LTC','DOGE','SOL','AVAX','DOT','LINK',
                            'UNI','AAVE','MATIC','SHIB','ADA','XRP','ALGO','ATOM',
                            'FIL','NEAR','APE','BCH','CRV','MKR','SUSHI','USDT','USDC'];
            if (in_array($base, $cryptoBases)) {
                return "{$base}/USD";
            }
        }
        return strtoupper($symbol);
    }

    /**
     * Parse Alpaca order rejection error into a categorized fail code.
     * Alpaca returns error messages like:
     *   "insufficient buying power"
     *   "asset XYZ is not active"
     *   "asset "ABC-USD" not found"
     *   "asset "OLB" is not fractionable"
     *
     * Returns: ['code' => string, 'message' => string]
     */
    private function parseAlpacaOrderError(string $errorMsg, int $httpCode): array
    {
        $lower = strtolower($errorMsg);

        if (str_contains($lower, 'insufficient buying power') || str_contains($lower, 'insufficient qty')) {
            return ['code' => 'INSUFFICIENT_FUNDS', 'message' => $errorMsg];
        }
        if (str_contains($lower, 'not found')) {
            return ['code' => 'ASSET_NOT_FOUND', 'message' => $errorMsg];
        }
        if (str_contains($lower, 'not active')) {
            return ['code' => 'ASSET_NOT_ACTIVE', 'message' => $errorMsg];
        }
        if (str_contains($lower, 'not fractionable')) {
            return ['code' => 'ASSET_NOT_FRACTIONABLE', 'message' => $errorMsg];
        }
        if (str_contains($lower, 'not tradable')) {
            return ['code' => 'ASSET_NOT_TRADABLE', 'message' => $errorMsg];
        }
        if (str_contains($lower, 'market is not open') || str_contains($lower, 'market closed')) {
            return ['code' => 'MARKET_CLOSED', 'message' => $errorMsg];
        }
        if (str_contains($lower, 'order is too small') || str_contains($lower, 'notional is too small')) {
            return ['code' => 'ORDER_TOO_SMALL', 'message' => $errorMsg];
        }
        if (str_contains($lower, 'too large') || str_contains($lower, 'exceeds')) {
            return ['code' => 'ORDER_TOO_LARGE', 'message' => $errorMsg];
        }
        if ($httpCode === 403) {
            return ['code' => 'ACCOUNT_RESTRICTED', 'message' => $errorMsg];
        }
        if ($httpCode === 429) {
            return ['code' => 'RATE_LIMITED', 'message' => $errorMsg];
        }

        return ['code' => 'BROKER_REJECTED', 'message' => $errorMsg];
    }

    // ====================================================================
    // PRIVATE — per merchant-broker group processing (ROUTER)
    // ====================================================================

    private function processMerchantBrokerGroup(array $group): array
    {
        $brokerName = $group['broker'];
        $brokerInfo = $this->getBrokerInfo($brokerName);
        $brokerType = $brokerInfo['broker_type'] ?? 'webhook';

        $this->log("Broker '{$brokerName}' → type={$brokerType}");

        // ── Route by broker type ──
        if ($brokerType === 'alpaca') {
            return $this->processAlpacaGroup($group, $brokerInfo);
        }

        // Default: webhook flow
        return $this->processWebhookGroup($group, $brokerInfo);
    }

    // ====================================================================
    // ALPACA BROKER API — submit real orders via API
    // ====================================================================

    private function processAlpacaGroup(array $group, array $brokerInfo): array
    {
        require_once __DIR__ . '/AlpacaBrokerAPI.php';

        $merchId   = $group['merchant_id'];
        $merchName = $group['merchant_name'];
        $allOrders = $group['orders'];

        $alpaca = new AlpacaBrokerAPI();

        // Sub-group orders by member
        $byMember = [];
        foreach ($allOrders as $o) {
            $mid = $o['member_id'] ?? 'unknown';
            if (!isset($byMember[$mid])) {
                $byMember[$mid] = [
                    'member_id'         => $mid,
                    'broker_account_id' => $o['broker_account_id'] ?? null,
                    'brokerage_id'      => $o['brokerage_id'] ?? null,
                    'basket_id'         => $o['basket_id'] ?? null,
                    'orders'            => [],
                ];
            }
            $byMember[$mid]['orders'][] = $o;
        }

        $totalPlaced     = 0;
        $totalFailed     = 0;
        $alpacaOrderIds  = [];
        $alpacaErrors    = [];
        $journalResults  = [];
        $orderResults    = [];

        foreach ($byMember as $mid => $memberData) {
            $accountId = $memberData['broker_account_id'];

            if (empty($accountId)) {
                $this->log("❌ Member {$mid}: no broker_account_id — skipping all orders");
                $this->errors[] = "Member {$mid}: no Alpaca broker_account_id in broker_credentials";
                $totalFailed += count($memberData['orders']);
                $this->markOrdersFailed($memberData['orders'], 'No broker account linked', 'NO_BROKER_ACCOUNT');
                continue;
            }

            $this->log("── Member {$mid}  account={$accountId}  orders=" . count($memberData['orders']));

            // ── Step 1: Journal cash to member account (fund the account) ──
            $memberTotal = round(array_sum(array_column($memberData['orders'], 'amount')), 2);

            if ($memberTotal > 0) {
                $this->log("   💰 Journaling \${$memberTotal} → account {$accountId}");
                $journalResult = $alpaca->journalCashToAccount($accountId, (string) $memberTotal);

                if (!$journalResult['success']) {
                    $errMsg = $journalResult['error'] ?? 'Journal failed';
                    $this->log("   ❌ Journal FAILED: {$errMsg}");

                    // Journal failure is non-fatal for sandbox/paper — log warning but continue
                    // In production, you might want to skip orders if funding fails
                    $this->log("   ⚠️ Continuing with order submission (paper trading mode)");
                    $journalResults[$mid] = ['success' => false, 'error' => $errMsg];
                } else {
                    $journalId = $journalResult['data']['id'] ?? 'ok';
                    $this->log("   ✅ Journal OK: {$journalId}");
                    $journalResults[$mid] = ['success' => true, 'journal_id' => $journalId];
                }
            }

            // ── Step 2: Validate and submit each order via Alpaca API ──
            // Cache asset validation results to avoid re-checking same symbol
            static $assetCache = [];

            foreach ($memberData['orders'] as $o) {
                $orderId = $o['order_id'] ?? null;
                $symbol  = $o['symbol'] ?? '';
                $amount  = round((float)($o['amount'] ?? 0), 2);
                $shares  = round((float)($o['shares'] ?? 0), 6);

                if (!$orderId || !$symbol) {
                    $this->log("   ⚠️ Skipping order with missing id/symbol");
                    $totalFailed++;
                    continue;
                }

                // Normalize symbol (crypto: BTC-USD → BTC/USD)
                $alpacaSymbol = $this->normalizeSymbolForAlpaca($symbol);
                if ($alpacaSymbol !== $symbol) {
                    $this->log("   🔄 Symbol normalized: {$symbol} → {$alpacaSymbol}");
                }

                // Determine if we need fractional support (notional/dollar-based orders)
                $needsFractional = ($amount > 0);

                // Validate asset (cached per symbol)
                if (!isset($assetCache[$alpacaSymbol])) {
                    $assetCache[$alpacaSymbol] = $this->validateAlpacaAsset($alpaca, $alpacaSymbol, $needsFractional);
                }
                $assetCheck = $assetCache[$alpacaSymbol];

                // Re-check fractionable if the cached result didn't need it but this order does
                if ($assetCheck['valid'] && $needsFractional && isset($assetCheck['asset'])) {
                    $isFractionable = $assetCheck['asset']['fractionable'] ?? false;
                    if (!$isFractionable) {
                        $assetCheck = [
                            'valid'      => false,
                            'error_code' => 'ASSET_NOT_FRACTIONABLE',
                            'error'      => "Asset {$alpacaSymbol} does not support fractional/notional orders",
                            'asset'      => $assetCheck['asset'],
                        ];
                    }
                }

                if (!$assetCheck['valid']) {
                    $failCode = $assetCheck['error_code'] ?? 'ASSET_NOT_FOUND';
                    $failMsg  = $assetCheck['error'] ?? 'Asset validation failed';
                    $this->log("   ❌ Order {$orderId} ({$alpacaSymbol}): {$failMsg}");
                    $this->errors[] = "Order {$orderId} ({$alpacaSymbol}): {$failMsg}";
                    $this->markSingleOrderFailed($orderId, $failMsg, $failCode);
                    $totalFailed++;
                    $orderResults[] = [
                        'order_id'   => $orderId,
                        'symbol'     => $symbol,
                        'amount'     => $amount,
                        'error'      => $failMsg,
                        'fail_code'  => $failCode,
                        'success'    => false,
                    ];
                    continue;
                }

                // Build Alpaca order payload
                $alpacaOrder = [
                    'symbol'        => $alpacaSymbol,
                    'side'          => 'buy',
                    'type'          => 'market',
                    'time_in_force' => 'day',
                ];

                if ($amount > 0) {
                    $alpacaOrder['notional'] = (string) $amount;
                } elseif ($shares > 0) {
                    $alpacaOrder['qty'] = (string) $shares;
                } else {
                    $this->log("   ⚠️ Order {$orderId}: zero amount and shares — skipping");
                    $this->markSingleOrderFailed($orderId, 'Zero amount and shares', 'ORDER_TOO_SMALL');
                    $totalFailed++;
                    continue;
                }

                $this->log("   📈 Order {$orderId}: {$alpacaSymbol} \${$amount} (notional) → account {$accountId}");

                $apiResult = $alpaca->createOrder($accountId, $alpacaOrder);

                if ($apiResult['success']) {
                    $alpacaOrderId = $apiResult['data']['id'] ?? '';
                    $alpacaStatus  = $apiResult['data']['status'] ?? 'accepted';
                    $filledQty     = $apiResult['data']['filled_qty'] ?? null;
                    $filledAvg     = $apiResult['data']['filled_avg_price'] ?? null;

                    $this->log("   ✅ Order {$orderId} → Alpaca: {$alpacaOrderId} status={$alpacaStatus}");

                    $this->markOrderConfirmed($orderId, $alpacaOrderId, $alpacaStatus, $filledQty, $filledAvg);
                    $totalPlaced++;

                    $alpacaOrderIds[] = $alpacaOrderId;
                    $orderResults[] = [
                        'order_id'        => $orderId,
                        'symbol'          => $alpacaSymbol,
                        'original_symbol' => ($alpacaSymbol !== $symbol) ? $symbol : null,
                        'amount'          => $amount,
                        'alpaca_order_id' => $alpacaOrderId,
                        'alpaca_status'   => $alpacaStatus,
                        'success'         => true,
                    ];
                } else {
                    $errMsg   = $apiResult['error'] ?? 'Order submission failed';
                    $httpCode = $apiResult['http_code'] ?? 0;

                    // Parse error into categorized fail code
                    $parsed   = $this->parseAlpacaOrderError($errMsg, $httpCode);
                    $failCode = $parsed['code'];

                    $this->log("   ❌ Order {$orderId} FAILED: HTTP {$httpCode} — {$errMsg} [{$failCode}]");
                    $this->errors[] = "Order {$orderId} ({$alpacaSymbol}): {$errMsg}";

                    $this->markSingleOrderFailed($orderId, $errMsg, $failCode);
                    $totalFailed++;

                    $alpacaErrors[] = [
                        'order_id'   => $orderId,
                        'symbol'     => $alpacaSymbol,
                        'error'      => $errMsg,
                        'fail_code'  => $failCode,
                        'http_code'  => $httpCode,
                        'details'    => $apiResult['data'] ?? null,
                    ];
                    $orderResults[] = [
                        'order_id'   => $orderId,
                        'symbol'     => $alpacaSymbol,
                        'amount'     => $amount,
                        'error'      => $errMsg,
                        'fail_code'  => $failCode,
                        'success'    => false,
                    ];
                }
            }
        }

        $basketIds  = array_unique(array_column($allOrders, 'basket_id'));
        $memberIds  = array_unique(array_column($allOrders, 'member_id'));

        // Build a request/response summary for the admin UI
        $requestSummary = [
            'broker_type'     => 'alpaca',
            'event_type'      => 'order.placed',
            'batch_id'        => $this->batchId,
            'merchant_id'     => $merchId,
            'merchant_name'   => $merchName,
            'broker'          => $group['broker'],
            'members'         => count($byMember),
            'total_orders'    => count($allOrders),
            'total_amount'    => round((float) array_sum(array_column($allOrders, 'amount')), 2),
            'journal_results' => $journalResults,
            'orders'          => $orderResults,
        ];

        $responseSummary = [
            'acknowledged'     => ($totalPlaced > 0),
            'acknowledged_at'  => ($totalPlaced > 0) ? gmdate('c') : null,
            'alpaca_order_ids' => $alpacaOrderIds,
            'orders_placed'    => $totalPlaced,
            'orders_failed'    => $totalFailed,
            'errors'           => $alpacaErrors,
        ];

        // Log to broker_notifications
        $comboLabel = "{$merchId}::{$group['broker']}";
        $this->logNotification($brokerInfo, $comboLabel, $comboLabel, $requestSummary, [
            'acknowledged'    => ($totalPlaced > 0),
            'acknowledged_at' => ($totalPlaced > 0) ? gmdate('c') : null,
            'broker_ref'      => !empty($alpacaOrderIds) ? implode(',', array_slice($alpacaOrderIds, 0, 5)) : null,
            'http_status'     => ($totalPlaced > 0) ? 200 : 400,
            'body'            => $responseSummary,
        ]);

        return [
            'merchant_id'     => $merchId,
            'merchant_name'   => $merchName,
            'broker'          => $group['broker'],
            'broker_id'       => $brokerInfo['broker_id'] ?? null,
            'broker_type'     => 'alpaca',
            'member_count'    => count($memberIds),
            'member_ids'      => array_values($memberIds),
            'basket_count'    => count($basketIds),
            'orders_placed'   => $totalPlaced,
            'orders_failed'   => $totalFailed,
            'order_count'     => count($allOrders),
            'total_amount'    => round((float) array_sum(array_column($allOrders, 'amount')), 2),
            'symbols'         => implode(', ', array_unique(array_column($allOrders, 'symbol'))),
            'acknowledged'    => ($totalPlaced > 0),
            'acknowledged_at' => ($totalPlaced > 0) ? gmdate('c') : null,
            'broker_ref'      => !empty($alpacaOrderIds) ? $alpacaOrderIds[0] : null,
            'http_status'     => ($totalPlaced > 0) ? 200 : null,
            'request'         => $requestSummary,
            'response'        => $responseSummary,
        ];
    }

    // ====================================================================
    // WEBHOOK — legacy webhook notification (existing flow, unchanged)
    // ====================================================================

    private function processWebhookGroup(array $group, array $brokerInfo): array
    {
        $brokerName = $group['broker'];
        $merchId    = $group['merchant_id'];
        $merchName  = $group['merchant_name'];
        $allOrders  = $group['orders'];

        $webhookUrl = $brokerInfo['webhook_url'] ?? null;

        // 1. Mark all orders → 'placed'
        $placedCount = $this->markOrdersPlaced($allOrders);
        $this->log("✅ {$placedCount} / " . count($allOrders) . " → 'placed'");

        // 2. Build grouped payload (all members/baskets for this merchant-broker)
        $payload = $this->buildGroupPayload($group, $brokerInfo);

        // 3. Send single webhook for entire merchant-broker group
        $response = null;
        if (!empty($webhookUrl)) {
            $this->log("📡 POST → {$webhookUrl}  ({$merchId} / {$brokerName})");
            $response = $this->sendWebhook($webhookUrl, $payload, $brokerInfo);
        } else {
            $this->log("⚠️ No webhook_url for '{$brokerName}' — skipping notification");
        }

        // 4. Log to broker_notifications
        $comboLabel = "{$merchId}::{$brokerName}";
        $this->logNotification($brokerInfo, $comboLabel, $comboLabel, $payload, $response);

        $basketIds   = array_unique(array_column($allOrders, 'basket_id'));
        $memberIds   = array_unique(array_column($allOrders, 'member_id'));

        return [
            'merchant_id'     => $merchId,
            'merchant_name'   => $merchName,
            'broker'          => $brokerName,
            'broker_id'       => $brokerInfo['broker_id'] ?? null,
            'broker_type'     => 'webhook',
            'member_count'    => count($memberIds),
            'member_ids'      => array_values($memberIds),
            'basket_count'    => count($basketIds),
            'orders_placed'   => $placedCount,
            'orders_failed'   => count($allOrders) - $placedCount,
            'order_count'     => count($allOrders),
            'total_amount'    => round((float) array_sum(array_column($allOrders, 'amount')), 2),
            'symbols'         => implode(', ', array_unique(array_column($allOrders, 'symbol'))),
            'webhook_url'     => $webhookUrl,
            'acknowledged'    => $response['acknowledged'] ?? false,
            'acknowledged_at' => $response['acknowledged_at'] ?? null,
            'broker_ref'      => $response['broker_ref'] ?? null,
            'http_status'     => $response['http_status'] ?? null,
            'request'         => $payload,
            'response'        => $response,
        ];
    }

    // ====================================================================
    // PRIVATE — mark orders placed / confirmed / failed
    // ====================================================================

    private function markOrdersPlaced(array $orders): int
    {
        $count = 0;
        foreach ($orders as $o) {
            $oid = $o['order_id'] ?? null;
            if (!$oid) continue;

            $stmt = $this->conn->prepare("
                UPDATE orders
                SET    status = 'placed', placed_at = NOW()
                WHERE  order_id = ?
                  AND  LOWER(status) IN ('pending','queued')
            ");
            $stmt->execute([$oid]);
            $count += $stmt->rowCount();
        }
        return $count;
    }

    /**
     * Mark a single order as confirmed with Alpaca order details.
     */
    private function markOrderConfirmed(
        int     $orderId,
        string  $alpacaOrderId,
        string  $alpacaStatus,
        ?string $filledQty = null,
        ?string $filledAvgPrice = null
    ): void {
        // Map Alpaca status to our status
        // Alpaca statuses: new, partially_filled, filled, done_for_day, canceled, expired, replaced, accepted, pending_new
        $ourStatus = 'placed'; // default: order accepted by broker
        if (in_array($alpacaStatus, ['filled', 'done_for_day'])) {
            $ourStatus = 'confirmed';
        } elseif (in_array($alpacaStatus, ['canceled', 'expired', 'rejected'])) {
            $ourStatus = 'failed';
        }

        $stmt = $this->conn->prepare("
            UPDATE orders
            SET    status     = ?,
                   broker_ref = ?,
                   placed_at  = NOW()
            WHERE  order_id   = ?
        ");
        $stmt->execute([$ourStatus, $alpacaOrderId, $orderId]);
    }

    /**
     * Mark a single order as failed with an error reason and categorized code.
     * fail_reason codes: INSUFFICIENT_FUNDS, ASSET_NOT_FOUND, ASSET_NOT_ACTIVE,
     *   ASSET_NOT_FRACTIONABLE, ASSET_NOT_TRADABLE, MARKET_CLOSED,
     *   ORDER_TOO_SMALL, ORDER_TOO_LARGE, ACCOUNT_RESTRICTED, BROKER_REJECTED,
     *   NO_BROKER_ACCOUNT, ASSET_LOOKUP_FAILED, RATE_LIMITED
     */
    private function markSingleOrderFailed(int $orderId, string $reason, string $failCode = 'BROKER_REJECTED'): void
    {
        $stmt = $this->conn->prepare("
            UPDATE orders
            SET    status      = 'failed',
                   broker_ref  = ?,
                   fail_reason = ?
            WHERE  order_id    = ?
        ");
        $stmt->execute(["FAILED: {$reason}", $failCode, $orderId]);
    }

    /**
     * Mark multiple orders as failed.
     */
    private function markOrdersFailed(array $orders, string $reason, string $failCode = 'BROKER_REJECTED'): void
    {
        foreach ($orders as $o) {
            $oid = $o['order_id'] ?? null;
            if ($oid) {
                $this->markSingleOrderFailed((int) $oid, $reason, $failCode);
            }
        }
    }

    // ====================================================================
    // PRIVATE — build grouped payload (webhook flow only)
    // ====================================================================

    private function buildGroupPayload(array $group, array $brokerInfo): array
    {
        $allOrders  = $group['orders'];
        $merchId    = $group['merchant_id'];
        $merchName  = $group['merchant_name'];

        // Sub-group orders by member (basket)
        $byMember = [];
        foreach ($allOrders as $o) {
            $mid = $o['member_id'] ?? 'unknown';
            if (!isset($byMember[$mid])) {
                $byMember[$mid] = [
                    'member_id'    => $mid,
                    'brokerage_id' => $o['brokerage_id'] ?? null,
                    'basket_id'    => $o['basket_id'] ?? null,
                    'orders'       => [],
                ];
            }
            $byMember[$mid]['orders'][] = $o;
        }

        // Build per-member payload with nested orders
        $members     = [];
        $totalAmount = 0.0;
        $totalShares = 0.0;
        $totalPoints = 0;
        $allSymbols  = [];

        foreach ($byMember as $mid => $memberData) {
            $memberOrders = [];
            $mAmount = 0.0;
            $mShares = 0.0;
            $mPoints = 0;

            foreach ($memberData['orders'] as $o) {
                $amt = (float)  ($o['amount']     ?? 0);
                $shr = (float)  ($o['shares']      ?? 0);
                $pts = (int)    ($o['points_used'] ?? 0);
                $mAmount += $amt;
                $mShares += $shr;
                $mPoints += $pts;

                $memberOrders[] = [
                    'order_id'    => (int) $o['order_id'],
                    'symbol'      => $o['symbol'],
                    'shares'      => round($shr, 4),
                    'amount'      => round($amt, 2),
                    'points_used' => $pts,
                    'order_type'  => $o['order_type'] ?? 'market',
                ];

                $allSymbols[] = $o['symbol'];
            }

            $totalAmount += $mAmount;
            $totalShares += $mShares;
            $totalPoints += $mPoints;

            $members[] = [
                'member_id'    => $mid,
                'brokerage_id' => $memberData['brokerage_id'],
                'basket_id'    => $memberData['basket_id'],
                'orders'       => $memberOrders,
                'summary'      => [
                    'order_count'  => count($memberOrders),
                    'total_amount' => round($mAmount, 2),
                    'total_shares' => round($mShares, 6),
                    'total_points' => $mPoints,
                    'symbols'      => array_values(array_unique(array_column($memberOrders, 'symbol'))),
                ],
            ];
        }

        return [
            'event_type'    => 'order.placed',
            'batch_id'      => $this->batchId,
            'merchant_id'   => $merchId,
            'merchant_name' => $merchName,
            'broker_id'     => $brokerInfo['broker_id'] ?? null,
            'broker_name'   => $brokerInfo['broker_name'] ?? null,
            'members'       => $members,
            'summary'       => [
                'member_count' => count($members),
                'order_count'  => count($allOrders),
                'total_amount' => round($totalAmount, 2),
                'total_shares' => round($totalShares, 6),
                'total_points' => $totalPoints,
                'symbols'      => array_values(array_unique($allSymbols)),
            ],
            'placed_at'     => gmdate('c'),
            'request_id'    => uniqid('swp_', true),
        ];
    }

    // ====================================================================
    // PRIVATE — send webhook & capture full response
    // ====================================================================

    private function sendWebhook(string $url, array $payload, array $brokerInfo): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'X-Event-Type: order.placed',
            'X-Request-Id: ' . ($payload['request_id'] ?? ''),
            'X-Batch-Id: '   . $this->batchId,
        ];
        if (!empty($brokerInfo['api_key'])) {
            $headers[] = 'X-API-Key: ' . $brokerInfo['api_key'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $raw       = curl_exec($ch);
        $httpCode  = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        // cURL transport failure
        if ($curlError) {
            $this->log("❌ cURL: {$curlError}");
            $this->errors[] = "Webhook {$url}: {$curlError}";
            return [
                'acknowledged' => false,
                'http_status'  => 0,
                'error'        => $curlError,
                'body'         => null,
            ];
        }

        $this->log("HTTP {$httpCode} — " . strlen((string) $raw) . " bytes");

        // HTTP error
        if ($httpCode < 200 || $httpCode >= 300) {
            $this->log("❌ HTTP {$httpCode}: " . substr((string) $raw, 0, 500));
            $this->errors[] = "HTTP {$httpCode} from {$url}";
            return [
                'acknowledged' => false,
                'http_status'  => $httpCode,
                'error'        => "HTTP {$httpCode}",
                'body'         => $this->safeParse($raw),
            ];
        }

        // Parse response JSON
        $parsed = $this->safeParse($raw);

        $acked   = (bool) ($parsed['acknowledged'] ?? $parsed['success'] ?? false);
        $ackedAt = $parsed['acknowledged_at'] ?? $parsed['timestamp'] ?? gmdate('c');

        $this->log($acked
            ? "✅ ACK at {$ackedAt}"
            : "⚠️ 2xx but acknowledged=false");

        return [
            'acknowledged'    => $acked,
            'acknowledged_at' => $ackedAt,
            'broker_ref'      => $parsed['broker_batch_id']
                                 ?? $parsed['broker_order_id']
                                 ?? $parsed['request_id']
                                 ?? null,
            'http_status'     => $httpCode,
            'body'            => $parsed,
        ];
    }

    private function safeParse($raw): ?array
    {
        if (!$raw) return null;
        $decoded = json_decode((string) $raw, true);
        return (json_last_error() === JSON_ERROR_NONE) ? $decoded : ['raw' => substr((string) $raw, 0, 2000)];
    }

    // ====================================================================
    // PRIVATE — logging
    // ====================================================================

    private function logNotification(
        array   $brokerInfo,
        string  $basketId,
        string  $memberId,
        array   $payload,
        ?array  $response
    ): void {
        $acked = ($response && ($response['acknowledged'] ?? false));

        $status = $acked ? 'acknowledged' : ($response ? 'sent' : 'no_webhook');

        try {
            $stmt = $this->conn->prepare("
                INSERT INTO broker_notifications
                    (broker_id, broker_name, event_type, status,
                     member_id, basket_id, payload,
                     response_code, response_body, error_message, sent_at)
                VALUES (?, ?, 'order.placed', ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([
                $brokerInfo['broker_id']   ?? null,
                $brokerInfo['broker_name'] ?? null,
                $status,
                $memberId,
                $basketId,
                json_encode($payload, JSON_UNESCAPED_SLASHES),
                $response['http_status'] ?? null,
                $response['body'] ? json_encode($response['body'], JSON_UNESCAPED_SLASHES) : null,
                $response['error'] ?? null,
            ]);
            $this->log("📝 broker_notifications: basket={$basketId} status={$status}");
        } catch (\PDOException $e) {
            $this->log("⚠️ broker_notifications insert: " . $e->getMessage());
        }
    }

    private function logSweepBatch(
        int $placed, int $failed, int $merchants,
        array $brokers, float $duration, string $startedAt
    ): void {
        try {
            $stmt = $this->conn->prepare("
                INSERT INTO sweep_log
                    (batch_id, started_at, completed_at,
                     merchants_processed, orders_processed,
                     orders_confirmed, orders_failed,
                     brokers_notified, errors, log_data)
                VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $this->batchId,
                $startedAt,
                $merchants,
                $placed + $failed,
                $placed,
                $failed,
                json_encode($brokers),
                json_encode($this->errors),
                json_encode($this->logMessages),
            ]);
        } catch (\PDOException $e) {
            $this->log("⚠️ sweep_log insert: " . $e->getMessage());
        }
    }

    // ====================================================================
    // PRIVATE — clear picks for one-time election members
    // ====================================================================

    /**
     * After sweep completes, delete member_stock_picks for members
     * whose wallet.election_type = 'one-time'.
     *
     * @param  array $groupResults  Results from processMerchantBrokerGroup()
     * @return int   Number of members whose picks were cleared
     */
    private function clearOneTimePicks(array $groupResults): int
    {
        // Collect unique member_ids from successfully placed groups
        $memberIds = [];
        foreach ($groupResults as $r) {
            if (($r['orders_placed'] ?? 0) > 0 && !empty($r['member_ids'])) {
                foreach ($r['member_ids'] as $mid) {
                    $memberIds[$mid] = true;
                }
            }
        }

        if (empty($memberIds)) {
            return 0;
        }

        $memberList = array_keys($memberIds);
        $placeholders = implode(',', array_fill(0, count($memberList), '?'));

        // Find members with election_type = 'one-time'
        try {
            $stmt = $this->conn->prepare("
                SELECT member_id 
                FROM wallet 
                WHERE member_id IN ({$placeholders})
                  AND election_type = 'one-time'
            ");
            $stmt->execute($memberList);
            $oneTimeMembers = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        } catch (\PDOException $e) {
            $this->log("⚠️ Failed to query one-time members: " . $e->getMessage());
            return 0;
        }

        if (empty($oneTimeMembers)) {
            $this->log("No one-time election members to clear picks for.");
            return 0;
        }

        $this->log("Clearing picks for " . count($oneTimeMembers) 
                    . " one-time member(s): " . implode(', ', $oneTimeMembers));

        $deleteStmt = $this->conn->prepare(
            "DELETE FROM member_stock_picks WHERE member_id = ?"
        );

        $cleared = 0;
        foreach ($oneTimeMembers as $memberId) {
            try {
                $deleteStmt->execute([$memberId]);
                $count = $deleteStmt->rowCount();
                $this->log("  ✅ Cleared {$count} pick(s) for member {$memberId}");
                $cleared++;
            } catch (\PDOException $e) {
                $this->log("  ⚠️ Failed to clear picks for {$memberId}: " . $e->getMessage());
                $this->errors[] = "Clear picks for {$memberId}: " . $e->getMessage();
            }
        }

        return $cleared;
    }

    // ====================================================================
    // PRIVATE — result builder
    // ====================================================================

    private function buildResult(
        int $placed, int $failed, int $merchants,
        array $brokersNotified, array $basketResults, float $duration
    ): array {
        return [
            'batch_id'            => $this->batchId,
            'orders_placed'       => $placed,
            'orders_failed'       => $failed,
            'merchants_processed' => $merchants,
            'baskets_processed'   => count($basketResults),
            'brokers_notified'    => $brokersNotified,
            'basket_results'      => $basketResults,
            'duration_seconds'    => round($duration, 2),
            'errors'              => $this->errors,
        ];
    }
}
