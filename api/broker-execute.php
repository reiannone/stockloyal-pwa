<?php
/**
 * broker-execute.php — Broker Trade Execution API
 *
 * After sweep marks orders as 'placed', this page lets admin:
 *   1. View placed orders awaiting execution
 *   2. Execute trades — routes by broker_type:
 *      - broker_type='alpaca'  → polls Alpaca API for real fill data
 *      - broker_type='webhook' → simulates with ±2% market variance
 *   3. Mark orders as 'confirmed' with executed_price, executed_shares, executed_amount
 *   4. Log execution to broker_notifications
 *
 * Actions:
 *   preview          → Fetch all placed orders grouped by broker/basket
 *   execute          → Execute ALL placed orders
 *   execute_basket   → Execute a single basket
 *   execute_merchant → Execute all baskets for a merchant
 *   history          → Past execution batches
 *   exec_orders      → Orders from a specific execution batch
 *
 * Tables read:    orders, merchant, broker_master, broker_credentials
 * Tables write:   orders (status, executed_*), broker_notifications
 */

declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input    = json_decode(file_get_contents("php://input"), true);
$action   = $input['action']    ?? 'preview';
$brokerId = $input['broker_id'] ?? null;

$logFile  = '/var/www/html/stockloyal-pwa/logs/broker-execute.log';
$logDir   = dirname($logFile);
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);

function logMsg(string $file, string $msg): void {
    $ts = gmdate('Y-m-d H:i:s');
    @file_put_contents($file, "[{$ts}] {$msg}\n", FILE_APPEND);
}

try {
    switch ($action) {

        case 'preview':
            echo json_encode(getPlacedOrders($conn, $brokerId));
            break;

        case 'execute':
            echo json_encode(executeAll($conn, $brokerId, $logFile));
            break;

        case 'execute_basket':
            $basketId = $input['basket_id'] ?? '';
            if (empty($basketId)) throw new Exception('Missing basket_id');
            echo json_encode(executeBasket($conn, $basketId, $logFile));
            break;

        case 'execute_merchant':
            $merchantId = $input['merchant_id'] ?? '';
            if (empty($merchantId)) throw new Exception('Missing merchant_id');
            echo json_encode(executeMerchant($conn, $merchantId, $logFile));
            break;

        case 'history':
            $limit = (int) ($input['limit'] ?? 30);
            echo json_encode(getExecHistory($conn, $limit));
            break;

        case 'exec_orders':
            $eid = $input['exec_id'] ?? '';
            if (empty($eid)) throw new Exception('Missing exec_id');
            echo json_encode(getExecOrders($conn, $eid));
            break;

        default:
            throw new Exception("Unknown action: {$action}");
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}


// ==================================================================
// PREVIEW — placed orders awaiting execution
// ==================================================================

function getPlacedOrders(PDO $conn, ?string $brokerId): array
{
    $sql = "
        SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
               o.symbol, o.shares, o.amount, o.points_used,
               o.status, o.placed_at, o.broker, o.order_type,
               o.broker_ref,
               m.merchant_name,
               bc.broker_account_id,
               COALESCE(bm.broker_type, 'webhook') AS broker_type
        FROM   orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        LEFT JOIN broker_credentials bc
               ON bc.member_id = o.member_id AND LOWER(bc.broker) = LOWER(o.broker)
        LEFT JOIN broker_master bm
               ON (bm.broker_name = o.broker OR bm.broker_id = o.broker)
        WHERE  LOWER(o.status) = 'placed'
    ";

    $params = [];
    if ($brokerId) {
        $sql .= " AND (o.broker = ? OR o.broker = ?) ";
        $params[] = $brokerId;
        $params[] = $brokerId;
    }
    $sql .= " ORDER BY o.broker, o.basket_id, o.order_id ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Group by broker → basket
    $grouped = [];
    $totals  = ['orders' => 0, 'amount' => 0.0, 'brokers' => [], 'baskets' => []];

    foreach ($orders as $o) {
        $broker   = $o['broker'] ?? 'unknown';
        $basketId = $o['basket_id'] ?? 'no_basket';
        $brokerType = $o['broker_type'] ?? 'webhook';

        if (!isset($grouped[$broker])) {
            $grouped[$broker] = ['broker' => $broker, 'broker_type' => $brokerType, 'baskets' => [], 'order_count' => 0, 'total_amount' => 0];
        }
        if (!isset($grouped[$broker]['baskets'][$basketId])) {
            $grouped[$broker]['baskets'][$basketId] = [
                'basket_id'     => $basketId,
                'member_id'     => $o['member_id'],
                'merchant_id'   => $o['merchant_id'],
                'merchant_name' => $o['merchant_name'],
                'placed_at'     => $o['placed_at'],
                'orders'        => [],
                'total_amount'  => 0,
            ];
        }

        $amt = (float) $o['amount'];
        $grouped[$broker]['baskets'][$basketId]['orders'][] = $o;
        $grouped[$broker]['baskets'][$basketId]['total_amount'] += $amt;
        $grouped[$broker]['order_count']++;
        $grouped[$broker]['total_amount'] += $amt;

        $totals['orders']++;
        $totals['amount'] += $amt;
        $totals['brokers'][$broker] = true;
        $totals['baskets'][$basketId] = true;
    }

    // Flatten baskets from assoc to indexed arrays
    foreach ($grouped as &$brokerGroup) {
        $brokerGroup['baskets'] = array_values($brokerGroup['baskets']);
        $brokerGroup['total_amount'] = round($brokerGroup['total_amount'], 2);
    }
    unset($brokerGroup);

    return [
        'success'  => true,
        'brokers'  => array_values($grouped),
        'summary'  => [
            'total_orders'  => $totals['orders'],
            'total_amount'  => round($totals['amount'], 2),
            'broker_count'  => count($totals['brokers']),
            'basket_count'  => count($totals['baskets']),
        ],
    ];
}


// ==================================================================
// EXECUTE ALL — simulate market open for all placed orders
// ==================================================================

function executeAll(PDO $conn, ?string $brokerId, string $logFile): array
{
    $execId    = 'EXEC-' . date('Ymd-His') . '-' . substr(uniqid(), -5);
    $startTime = microtime(true);
    $executedAt = gmdate('c');

    logMsg($logFile, str_repeat('=', 70));
    logMsg($logFile, "BROKER EXECUTION START: {$execId}");

    // Fetch placed orders
    $sql = "
        SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
               o.symbol, o.shares, o.amount, o.broker, o.broker_ref,
               bc.broker_account_id,
               COALESCE(bm.broker_type, 'webhook') AS broker_type
        FROM   orders o
        LEFT JOIN broker_credentials bc
               ON bc.member_id = o.member_id AND LOWER(bc.broker) = LOWER(o.broker)
        LEFT JOIN broker_master bm
               ON (bm.broker_name = o.broker OR bm.broker_id = o.broker)
        WHERE  LOWER(o.status) = 'placed'
    ";
    $params = [];
    if ($brokerId) {
        $sql .= " AND (o.broker = ? OR o.broker = ?) ";
        $params[] = $brokerId;
        $params[] = $brokerId;
    }
    $sql .= " ORDER BY o.basket_id, o.order_id ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($orders)) {
        logMsg($logFile, "No placed orders to execute.");
        return [
            'success'         => true,
            'exec_id'         => $execId,
            'orders_executed' => 0,
            'orders_failed'   => 0,
            'baskets'         => [],
            'duration_seconds' => 0,
        ];
    }

    logMsg($logFile, "Found " . count($orders) . " placed order(s)");

    // Group by basket
    $baskets = [];
    foreach ($orders as $o) {
        $bid = $o['basket_id'] ?? 'no_basket';
        $baskets[$bid][] = $o;
    }

    $totalExecuted = 0;
    $totalFailed   = 0;
    $basketResults = [];

    foreach ($baskets as $basketId => $basketOrders) {
        $result = executeBasketOrders($conn, $basketId, $basketOrders, $execId, $executedAt, $logFile);
        $totalExecuted += $result['orders_executed'];
        $totalFailed   += $result['orders_failed'];
        $basketResults[] = $result;
    }

    $duration = round(microtime(true) - $startTime, 2);

    logMsg($logFile, "EXECUTION DONE: executed={$totalExecuted}, failed={$totalFailed}, "
                     . "baskets=" . count($baskets) . ", duration={$duration}s");

    return [
        'success'          => true,
        'exec_id'          => $execId,
        'executed_at'      => $executedAt,
        'orders_executed'  => $totalExecuted,
        'orders_failed'    => $totalFailed,
        'baskets_processed' => count($baskets),
        'basket_results'   => $basketResults,
        'duration_seconds' => $duration,
    ];
}


// ==================================================================
// EXECUTE SINGLE BASKET
// ==================================================================

function executeBasket(PDO $conn, string $basketId, string $logFile): array
{
    $execId    = 'EXEC-' . date('Ymd-His') . '-' . substr(uniqid(), -5);
    $executedAt = gmdate('c');

    $stmt = $conn->prepare("
        SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
               o.symbol, o.shares, o.amount, o.broker, o.broker_ref,
               bc.broker_account_id,
               COALESCE(bm.broker_type, 'webhook') AS broker_type
        FROM   orders o
        LEFT JOIN broker_credentials bc
               ON bc.member_id = o.member_id AND LOWER(bc.broker) = LOWER(o.broker)
        LEFT JOIN broker_master bm
               ON (bm.broker_name = o.broker OR bm.broker_id = o.broker)
        WHERE  o.basket_id = ?
          AND  LOWER(o.status) = 'placed'
        ORDER  BY o.order_id ASC
    ");
    $stmt->execute([$basketId]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($orders)) {
        return ['success' => false, 'error' => "No placed orders in basket {$basketId}"];
    }

    $result = executeBasketOrders($conn, $basketId, $orders, $execId, $executedAt, $logFile);

    return array_merge(['success' => true, 'exec_id' => $execId], $result);
}


// ==================================================================
// CORE — execute orders within a basket
// Routes by broker_type: 'alpaca' polls real API, others simulate
// ==================================================================

function executeBasketOrders(
    PDO $conn, string $basketId, array $orders,
    string $execId, string $executedAt, string $logFile
): array {
    $first      = $orders[0];
    $broker     = $first['broker'] ?? 'unknown';
    $brokerType = $first['broker_type'] ?? 'webhook';
    $memberId   = $first['member_id'];

    logMsg($logFile, "--- Basket {$basketId}: {$broker} (type={$brokerType}), member={$memberId}, "
                     . count($orders) . " order(s) ---");

    // Route by broker_type
    if (strtolower($brokerType) === 'alpaca') {
        $fillResult = executeAlpacaOrders($conn, $orders, $logFile);
    } else {
        $fillResult = executeSimulatedOrders($conn, $orders, $logFile);
    }

    $executed = $fillResult['executed'];
    $failed   = $fillResult['failed'];
    $pending  = $fillResult['pending'] ?? 0;
    $fills    = $fillResult['fills'];

    // Total executed amount
    $totalExecAmount = round(array_sum(array_column($fills, 'executed_amount')), 2);
    $symbols = array_values(array_unique(array_column($fills, 'symbol')));

    // Log to broker_notifications
    try {
        $stmt = $conn->prepare("
            INSERT INTO broker_notifications
                (broker_id, broker_name, event_type, status,
                 member_id, basket_id, payload, sent_at)
            VALUES (?, ?, 'order.confirmed', 'confirmed', ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $broker,
            $broker,
            $memberId,
            $basketId,
            json_encode([
                'exec_id'          => $execId,
                'executed_at'      => $executedAt,
                'broker_type'      => $brokerType,
                'orders_executed'  => $executed,
                'orders_pending'   => $pending,
                'total_amount'     => $totalExecAmount,
                'fills'            => $fills,
            ], JSON_UNESCAPED_SLASHES),
        ]);
    } catch (\PDOException $e) {
        logMsg($logFile, "⚠️ broker_notifications: " . $e->getMessage());
    }

    return [
        'basket_id'        => $basketId,
        'member_id'        => $memberId,
        'broker'           => $broker,
        'broker_type'      => $brokerType,
        'merchant_id'      => $first['merchant_id'] ?? null,
        'orders_executed'  => $executed,
        'orders_failed'    => $failed,
        'orders_pending'   => $pending,
        'total_amount'     => $totalExecAmount,
        'symbols'          => $symbols,
        'executed_at'      => $executedAt,
        'fills'            => $fills,
    ];
}


// ==================================================================
// ALPACA — poll Alpaca Broker API for real fill data
// Orders were already submitted during sweep (broker_ref = Alpaca UUID)
// ==================================================================

function executeAlpacaOrders(PDO $conn, array $orders, string $logFile): array
{
    try {
        $alpaca = new AlpacaBrokerAPI();
    } catch (\Exception $e) {
        logMsg($logFile, "❌ AlpacaBrokerAPI init failed: " . $e->getMessage());
        return ['executed' => 0, 'failed' => count($orders), 'pending' => 0, 'fills' => []];
    }

    $executed = 0;
    $failed   = 0;
    $pending  = 0;
    $fills    = [];

    foreach ($orders as $o) {
        $orderId        = (int) $o['order_id'];
        $symbol         = $o['symbol'];
        $shares         = (float) $o['shares'];
        $amount         = (float) $o['amount'];
        $alpacaOrderId  = $o['broker_ref'] ?? '';
        $accountId      = $o['broker_account_id'] ?? '';

        // No Alpaca order reference → can't poll, mark failed
        if (empty($alpacaOrderId) || str_starts_with($alpacaOrderId, 'FAILED:')) {
            $failed++;
            logMsg($logFile, "⚠️ #{$orderId} {$symbol}: no Alpaca order ID (broker_ref={$alpacaOrderId})");
            continue;
        }
        if (empty($accountId)) {
            $failed++;
            logMsg($logFile, "⚠️ #{$orderId} {$symbol}: no broker_account_id");
            continue;
        }

        // Poll Alpaca for this order's status
        $apiResult = $alpaca->getOrder($accountId, $alpacaOrderId);

        if (!$apiResult['success']) {
            $failed++;
            logMsg($logFile, "❌ #{$orderId} {$symbol}: Alpaca API error — "
                             . ($apiResult['error'] ?? 'unknown') . " (HTTP {$apiResult['http_code']})");
            $fills[] = [
                'order_id'   => $orderId,
                'symbol'     => $symbol,
                'status'     => 'error',
                'error'      => $apiResult['error'] ?? 'API call failed',
            ];
            continue;
        }

        $data          = $apiResult['data'];
        $alpacaStatus  = $data['status'] ?? 'unknown';
        $filledQty     = !empty($data['filled_qty']) ? (float) $data['filled_qty'] : null;
        $filledAvgPx   = !empty($data['filled_avg_price']) ? (float) $data['filled_avg_price'] : null;
        $filledAt      = $data['filled_at'] ?? null;

        // Map Alpaca status → our status
        $newStatus = mapAlpacaStatus($alpacaStatus);

        if ($newStatus === 'confirmed') {
            // Calculate exec values from real fill data
            $execPrice  = $filledAvgPx ?? 0;
            $execShares = $filledQty ?? $shares;
            $execAmount = round($execPrice * $execShares, 2);
            $execTime   = $filledAt ? date('Y-m-d H:i:s', strtotime($filledAt)) : gmdate('Y-m-d H:i:s');

            try {
                $stmt = $conn->prepare("
                    UPDATE orders
                    SET    status          = 'confirmed',
                           executed_at     = ?,
                           executed_price  = ?,
                           executed_shares = ?,
                           executed_amount = ?
                    WHERE  order_id = ?
                      AND  LOWER(status) = 'placed'
                ");
                $stmt->execute([$execTime, $execPrice, $execShares, $execAmount, $orderId]);

                if ($stmt->rowCount() > 0) {
                    $executed++;
                    $targetPrice = ($shares > 0) ? ($amount / $shares) : 0;
                    $variancePct = ($targetPrice > 0) ? round(($execPrice / $targetPrice - 1) * 100, 2) : 0;

                    $fills[] = [
                        'order_id'          => $orderId,
                        'symbol'            => $symbol,
                        'shares'            => round($execShares, 6),
                        'executed_price'    => $execPrice,
                        'executed_amount'   => $execAmount,
                        'target_price'      => round($targetPrice, 4),
                        'variance_pct'      => $variancePct,
                        'alpaca_status'     => $alpacaStatus,
                        'alpaca_order_id'   => $alpacaOrderId,
                        'filled_at'         => $execTime,
                        'status'            => 'confirmed',
                        'source'            => 'alpaca_api',
                    ];
                    logMsg($logFile, "✅ #{$orderId} {$symbol}: ALPACA FILL {$execShares} @ \${$execPrice} = \${$execAmount} (status={$alpacaStatus})");
                } else {
                    $failed++;
                    logMsg($logFile, "⚠️ #{$orderId} {$symbol}: DB update failed (status may have changed)");
                }
            } catch (\PDOException $e) {
                $failed++;
                logMsg($logFile, "❌ #{$orderId} {$symbol}: DB error — " . $e->getMessage());
            }

        } elseif ($newStatus === 'failed') {
            // Order was canceled/rejected/expired on Alpaca side
            try {
                $stmt = $conn->prepare("
                    UPDATE orders
                    SET    status = 'failed',
                           executed_at = NOW()
                    WHERE  order_id = ?
                      AND  LOWER(status) = 'placed'
                ");
                $stmt->execute([$orderId]);
                $failed++;
                $fills[] = [
                    'order_id'        => $orderId,
                    'symbol'          => $symbol,
                    'alpaca_status'   => $alpacaStatus,
                    'alpaca_order_id' => $alpacaOrderId,
                    'status'          => 'failed',
                    'source'          => 'alpaca_api',
                ];
                logMsg($logFile, "❌ #{$orderId} {$symbol}: Alpaca status={$alpacaStatus} → failed");
            } catch (\PDOException $e) {
                $failed++;
                logMsg($logFile, "❌ #{$orderId} {$symbol}: " . $e->getMessage());
            }

        } else {
            // Still pending on Alpaca (new, accepted, partially_filled, etc.)
            $pending++;
            $fills[] = [
                'order_id'        => $orderId,
                'symbol'          => $symbol,
                'alpaca_status'   => $alpacaStatus,
                'alpaca_order_id' => $alpacaOrderId,
                'filled_qty'      => $filledQty,
                'status'          => 'pending',
                'source'          => 'alpaca_api',
            ];
            logMsg($logFile, "⏳ #{$orderId} {$symbol}: Alpaca status={$alpacaStatus} → still pending (filled_qty={$filledQty})");
        }
    }

    return ['executed' => $executed, 'failed' => $failed, 'pending' => $pending, 'fills' => $fills];
}


// ==================================================================
// Map Alpaca order status → our order status
// ==================================================================

function mapAlpacaStatus(string $alpacaStatus): string
{
    return match ($alpacaStatus) {
        'filled', 'done_for_day'                          => 'confirmed',
        'canceled', 'expired', 'rejected', 'suspended'    => 'failed',
        // Everything else is still working
        default                                            => 'placed',
    };
}


// ==================================================================
// SIMULATED — existing mock execution with ±2% variance
// ==================================================================

function executeSimulatedOrders(PDO $conn, array $orders, string $logFile): array
{
    $executed = 0;
    $failed   = 0;
    $fills    = [];

    foreach ($orders as $o) {
        $orderId = (int) $o['order_id'];
        $symbol  = $o['symbol'];
        $shares  = (float) $o['shares'];
        $amount  = (float) $o['amount'];

        // Simulate market execution price
        // Target price = amount / shares, with ±2% market variance
        $targetPrice = ($shares > 0) ? ($amount / $shares) : 0;
        $variance    = 1 + (mt_rand(-200, 200) / 10000);  // 0.98 to 1.02
        $execPrice   = round($targetPrice * $variance, 4);

        // Executed shares = original shares (fractional market buy fills fully)
        $execShares = $shares;

        // Executed amount = price × shares
        $execAmount = round($execPrice * $execShares, 2);

        try {
            $stmt = $conn->prepare("
                UPDATE orders
                SET    status          = 'confirmed',
                       executed_at     = NOW(),
                       executed_price  = ?,
                       executed_shares = ?,
                       executed_amount = ?
                WHERE  order_id = ?
                  AND  LOWER(status) = 'placed'
            ");
            $stmt->execute([$execPrice, $execShares, $execAmount, $orderId]);

            if ($stmt->rowCount() > 0) {
                $executed++;
                $fills[] = [
                    'order_id'        => $orderId,
                    'symbol'          => $symbol,
                    'shares'          => round($execShares, 4),
                    'executed_price'  => $execPrice,
                    'executed_amount' => $execAmount,
                    'target_price'    => round($targetPrice, 4),
                    'variance_pct'    => round(($variance - 1) * 100, 2),
                    'status'          => 'confirmed',
                    'source'          => 'simulated',
                ];
                logMsg($logFile, "✅ #{$orderId} {$symbol}: SIM {$execShares} shares @ \${$execPrice} = \${$execAmount}");
            } else {
                $failed++;
                logMsg($logFile, "⚠️ #{$orderId} {$symbol}: no rows updated (status may have changed)");
            }
        } catch (\PDOException $e) {
            $failed++;
            logMsg($logFile, "❌ #{$orderId} {$symbol}: " . $e->getMessage());
        }
    }

    return ['executed' => $executed, 'failed' => $failed, 'fills' => $fills];
}


// ==================================================================
// EXECUTE MERCHANT — all placed orders for a specific merchant
// ==================================================================

function executeMerchant(PDO $conn, string $merchantId, string $logFile): array
{
    $execId     = 'EXEC-' . date('Ymd-His') . '-' . substr(uniqid(), -5);
    $executedAt = gmdate('c');
    $startTime  = microtime(true);

    logMsg($logFile, str_repeat('=', 70));
    logMsg($logFile, "EXEC MERCHANT {$merchantId}: {$execId}");

    $stmt = $conn->prepare("
        SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
               o.symbol, o.shares, o.amount, o.broker, o.broker_ref,
               bc.broker_account_id,
               COALESCE(bm.broker_type, 'webhook') AS broker_type
        FROM   orders o
        LEFT JOIN broker_credentials bc
               ON bc.member_id = o.member_id AND LOWER(bc.broker) = LOWER(o.broker)
        LEFT JOIN broker_master bm
               ON (bm.broker_name = o.broker OR bm.broker_id = o.broker)
        WHERE  o.merchant_id = ?
          AND  LOWER(o.status) = 'placed'
        ORDER  BY o.basket_id, o.order_id ASC
    ");
    $stmt->execute([$merchantId]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($orders)) {
        return ['success' => false, 'error' => "No placed orders for merchant {$merchantId}"];
    }

    logMsg($logFile, "Found " . count($orders) . " placed order(s) for merchant {$merchantId}");

    // Group by basket
    $baskets = [];
    foreach ($orders as $o) {
        $bid = $o['basket_id'] ?? 'no_basket';
        $baskets[$bid][] = $o;
    }

    $totalExecuted = 0;
    $totalFailed   = 0;
    $basketResults = [];

    foreach ($baskets as $basketId => $basketOrders) {
        $result = executeBasketOrders($conn, $basketId, $basketOrders, $execId, $executedAt, $logFile);
        $totalExecuted += $result['orders_executed'];
        $totalFailed   += $result['orders_failed'];
        $basketResults[] = $result;
    }

    $duration = round(microtime(true) - $startTime, 2);

    logMsg($logFile, "MERCHANT EXEC DONE: executed={$totalExecuted}, failed={$totalFailed}, "
                     . "baskets=" . count($baskets) . ", duration={$duration}s");

    return [
        'success'           => true,
        'exec_id'           => $execId,
        'executed_at'       => $executedAt,
        'orders_executed'   => $totalExecuted,
        'orders_failed'     => $totalFailed,
        'baskets_processed' => count($baskets),
        'basket_results'    => $basketResults,
        'duration_seconds'  => $duration,
    ];
}


// ==================================================================
// HISTORY — past execution batches from broker_notifications
// ==================================================================

function getExecHistory(PDO $conn, int $limit): array
{
    $safeLimit = max(1, min($limit, 100));

    // Each broker_notifications row for 'order.confirmed' has exec_id in payload JSON.
    // Group by exec_id to get batch-level summaries.
    $stmt = $conn->query("
        SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.exec_id')) AS exec_id,
               MIN(sent_at) AS started_at,
               MAX(sent_at) AS completed_at,
               COUNT(DISTINCT basket_id)  AS baskets_processed,
               COUNT(DISTINCT broker_id)  AS brokers_count,
               COUNT(DISTINCT member_id)  AS members_count,
               GROUP_CONCAT(DISTINCT broker_id) AS brokers,
               SUM(CAST(JSON_EXTRACT(payload, '$.orders_executed') AS UNSIGNED)) AS orders_executed,
               SUM(CAST(JSON_EXTRACT(payload, '$.total_amount') AS DECIMAL(12,2))) AS total_amount
        FROM   broker_notifications
        WHERE  event_type = 'order.confirmed'
          AND  JSON_EXTRACT(payload, '$.exec_id') IS NOT NULL
        GROUP  BY exec_id
        ORDER  BY started_at DESC
        LIMIT  {$safeLimit}
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $row['baskets_processed'] = (int)   $row['baskets_processed'];
        $row['brokers_count']     = (int)   $row['brokers_count'];
        $row['members_count']     = (int)   $row['members_count'];
        $row['orders_executed']   = (int)   $row['orders_executed'];
        $row['total_amount']      = (float) $row['total_amount'];
        $row['brokers']           = $row['brokers'] ? explode(',', $row['brokers']) : [];

        if ($row['started_at'] && $row['completed_at']) {
            $row['duration_seconds'] = max(0, strtotime($row['completed_at']) - strtotime($row['started_at']));
        } else {
            $row['duration_seconds'] = 0;
        }
    }
    unset($row);

    return [
        'success' => true,
        'history' => $rows,
    ];
}


// ==================================================================
// EXEC_ORDERS — confirmed orders for a specific execution batch
// Returns same column shape as preview so the hierarchy component works.
// ==================================================================

function getExecOrders(PDO $conn, string $execId): array
{
    // Get the execution time window from broker_notifications
    $stmt = $conn->prepare("
        SELECT MIN(sent_at) AS started_at,
               MAX(sent_at) AS completed_at
        FROM   broker_notifications
        WHERE  event_type = 'order.confirmed'
          AND  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.exec_id')) = ?
    ");
    $stmt->execute([$execId]);
    $window = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$window || !$window['started_at']) {
        return ['success' => false, 'error' => 'Execution batch not found'];
    }

    // Query confirmed orders in this time window
    $stmt = $conn->prepare("
        SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
               o.symbol, o.shares, o.amount, o.points_used, o.broker,
               o.status, o.placed_at, o.order_type, o.broker_ref,
               o.executed_price, o.executed_shares, o.executed_amount, o.executed_at,
               m.merchant_name
        FROM   orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        WHERE  o.executed_at BETWEEN DATE_SUB(?, INTERVAL 30 SECOND) AND DATE_ADD(?, INTERVAL 5 SECOND)
          AND  LOWER(o.status) = 'confirmed'
        ORDER BY o.merchant_id, o.broker, o.basket_id, o.symbol
        LIMIT 1000
    ");
    $stmt->execute([$window['started_at'], $window['completed_at']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'success' => true,
        'orders'  => $rows,
    ];
}
