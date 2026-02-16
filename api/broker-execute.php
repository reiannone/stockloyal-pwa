<?php
/**
 * broker-execute.php — Broker Trade Execution API
 *
 * Simulates the broker's side of trade execution.
 * After sweep marks orders as 'placed', this page lets admin:
 *   1. View placed orders awaiting execution
 *   2. Execute trades with simulated market prices
 *   3. Mark orders as 'confirmed' with executed_price, executed_shares, executed_amount
 *   4. Log execution to broker_notifications
 *
 * Actions:
 *   preview       → Fetch all placed orders grouped by broker/basket
 *   execute       → Execute ALL placed orders (simulate market open)
 *   execute_basket → Execute a single basket
 *
 * Tables read:    orders, merchant, broker_master
 * Tables write:   orders (status, executed_*), broker_notifications
 */

declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

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
               m.merchant_name
        FROM   orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
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

        if (!isset($grouped[$broker])) {
            $grouped[$broker] = ['broker' => $broker, 'baskets' => [], 'order_count' => 0, 'total_amount' => 0];
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
               o.symbol, o.shares, o.amount, o.broker
        FROM   orders o
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
        SELECT order_id, member_id, merchant_id, basket_id,
               symbol, shares, amount, broker
        FROM   orders
        WHERE  basket_id = ?
          AND  LOWER(status) = 'placed'
        ORDER  BY order_id ASC
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
// ==================================================================

function executeBasketOrders(
    PDO $conn, string $basketId, array $orders,
    string $execId, string $executedAt, string $logFile
): array {
    $first    = $orders[0];
    $broker   = $first['broker'] ?? 'unknown';
    $memberId = $first['member_id'];

    logMsg($logFile, "--- Basket {$basketId}: {$broker}, member={$memberId}, "
                     . count($orders) . " order(s) ---");

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
                ];
                logMsg($logFile, "✅ #{$orderId} {$symbol}: {$execShares} shares @ \${$execPrice} = \${$execAmount}");
            } else {
                $failed++;
                logMsg($logFile, "⚠️ #{$orderId} {$symbol}: no rows updated (status may have changed)");
            }
        } catch (\PDOException $e) {
            $failed++;
            logMsg($logFile, "❌ #{$orderId} {$symbol}: " . $e->getMessage());
        }
    }

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
                'orders_executed'  => $executed,
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
        'merchant_id'      => $first['merchant_id'] ?? null,
        'orders_executed'  => $executed,
        'orders_failed'    => $failed,
        'total_amount'     => $totalExecAmount,
        'symbols'          => $symbols,
        'executed_at'      => $executedAt,
        'fills'            => $fills,
    ];
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
        SELECT order_id, member_id, merchant_id, basket_id,
               symbol, shares, amount, broker
        FROM   orders
        WHERE  merchant_id = ?
          AND  LOWER(status) = 'placed'
        ORDER  BY basket_id, order_id ASC
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
               o.status, o.placed_at, o.order_type,
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
