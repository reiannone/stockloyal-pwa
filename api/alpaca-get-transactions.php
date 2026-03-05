<?php
declare(strict_types=1);

/**
 * alpaca-get-transactions.php
 *
 * Returns trade history for a member's Alpaca brokerage account.
 * Pulls from two Alpaca Broker API sources:
 *   1. Orders (all statuses) — buy/sell submissions with execution details
 *   2. Account activities (FILL type) — confirmed trade executions
 *
 * Input:  { member_id, ?days (default 90), ?status, ?side, ?symbol }
 * Output: { success, orders[], activities[], summary }
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/BrokerAdapterFactory.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $input    = json_decode(file_get_contents('php://input'), true) ?: [];
    $memberId = trim($input['member_id'] ?? '');
    $days     = min(max((int)($input['days'] ?? 90), 1), 365);
    $filterStatus = strtolower(trim($input['status'] ?? ''));   // filled, canceled, etc.
    $filterSide   = strtolower(trim($input['side'] ?? ''));     // buy, sell
    $filterSymbol = strtoupper(trim($input['symbol'] ?? ''));

    if (empty($memberId)) {
        echo json_encode(['success' => false, 'error' => 'member_id required']);
        exit;
    }

    // ── 1. Look up Alpaca account ID for this member ──
    $stmt = $conn->prepare("
        SELECT bc.broker_account_id, w.merchant_id
        FROM broker_credentials bc
        LEFT JOIN wallet w ON w.member_id = bc.member_id
        WHERE bc.member_id = ? AND bc.broker = 'Alpaca' AND bc.broker_account_id IS NOT NULL
        LIMIT 1
    ");
    $stmt->execute([$memberId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row || empty($row['broker_account_id'])) {
        echo json_encode(['success' => false, 'error' => 'No Alpaca account found for this member.']);
        exit;
    }

    $accountId = $row['broker_account_id'];
    error_log("[tx-debug] member={$memberId} resolved account={$accountId}");
    $merchantId = $row['merchant_id'] ?? '';
    $adapter = BrokerAdapterFactory::forMerchant($conn, $merchantId, 'Alpaca');
    $alpaca  = $adapter->getApi();

    // ── 2. Fetch orders from Alpaca ──
    $afterDate = date('Y-m-d\TH:i:s\Z', strtotime("-{$days} days"));
    $ordersEndpoint = '/v1/trading/accounts/' . urlencode($accountId)
        . '/orders?status=all&limit=500&direction=desc&after=' . urlencode($afterDate);

    $ordersResult = $alpaca->getOrders($accountId, 'all');

    $orders = [];
    if ($ordersResult['success'] && is_array($ordersResult['data'])) {
        foreach ($ordersResult['data'] as $o) {
            $status = strtolower($o['status'] ?? '');
            $side   = strtolower($o['side'] ?? '');
            $symbol = strtoupper($o['symbol'] ?? '');

            // Apply filters
            if ($filterStatus && $status !== $filterStatus) continue;
            if ($filterSide && $side !== $filterSide) continue;
            if ($filterSymbol && $symbol !== $filterSymbol) continue;

            $filledQty   = (float)($o['filled_qty'] ?? 0);
            $filledPrice = (float)($o['filled_avg_price'] ?? 0);
            $orderQty    = (float)($o['qty'] ?? $o['notional'] ?? 0);

            $orders[] = [
                'order_id'        => $o['id'] ?? '',
                'client_order_id' => $o['client_order_id'] ?? '',
                'symbol'          => $symbol,
                'side'            => $side,
                'type'            => $o['type'] ?? 'market',
                'time_in_force'   => $o['time_in_force'] ?? 'day',
                'status'          => $status,
                'qty'             => $orderQty,
                'filled_qty'      => $filledQty,
                'filled_avg_price' => $filledPrice,
                'filled_amount'   => round($filledQty * $filledPrice, 2),
                'limit_price'     => $o['limit_price'] ?? null,
                'stop_price'      => $o['stop_price'] ?? null,
                'submitted_at'    => $o['submitted_at'] ?? null,
                'filled_at'       => $o['filled_at'] ?? null,
                'canceled_at'     => $o['canceled_at'] ?? null,
                'created_at'      => $o['created_at'] ?? null,
            ];
        }
    }

    // ── 3. Fetch account activities (fills) ──
    $activities = [];
    $activitiesEndpoint = '/v1/accounts/activities/FILL?account_id=' . urlencode($accountId)
        . '&date=' . date('Y-m-d') . '&direction=desc&page_size=100';

    // Use the generic activities endpoint for the member
    $actResult = $alpaca->getAccountActivities($accountId, 'FILL', $days);

    if ($actResult['success'] && is_array($actResult['data'])) {
        foreach ($actResult['data'] as $a) {
            $side   = strtolower($a['side'] ?? '');
            $symbol = strtoupper($a['symbol'] ?? '');

            if ($filterSide && $side !== $filterSide) continue;
            if ($filterSymbol && $symbol !== $filterSymbol) continue;

            $qty   = (float)($a['qty'] ?? 0);
            $price = (float)($a['price'] ?? 0);

            $activities[] = [
                'activity_id'     => $a['id'] ?? '',
                'activity_type'   => $a['activity_type'] ?? 'FILL',
                'symbol'          => $symbol,
                'side'            => $side,
                'qty'             => $qty,
                'price'           => $price,
                'amount'          => round($qty * $price, 2),
                'order_id'        => $a['order_id'] ?? '',
                'transaction_time' => $a['transaction_time'] ?? null,
                'type'            => $a['type'] ?? '',
            ];
        }
    }

    // ── 4. Build summary ──
    $totalBuys = 0; $totalSells = 0;
    $buyAmount = 0; $sellAmount = 0;
    $buyCount = 0;  $sellCount = 0;

    foreach ($orders as $o) {
        if ($o['status'] !== 'filled' && $o['status'] !== 'partially_filled') continue;
        if ($o['side'] === 'buy') {
            $buyCount++;
            $buyAmount += $o['filled_amount'];
        } elseif ($o['side'] === 'sell') {
            $sellCount++;
            $sellAmount += $o['filled_amount'];
        }
    }

    // ── 5. Also pull from local orders table for StockLoyal-specific data ──
    $localStmt = $conn->prepare("
        SELECT order_id, symbol, amount, shares, points_used, status,
               order_type, broker, placed_at, updated_at, paid_flag
        FROM orders
        WHERE member_id = ?
        ORDER BY placed_at DESC
        LIMIT 200
    ");
    $localStmt->execute([$memberId]);
    $localOrders = $localStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success'    => true,
        'account_id' => $accountId,
        'days'       => $days,
        'orders'     => $orders,
        'activities' => $activities,
        'local_orders' => $localOrders,
        'summary'    => [
            'total_orders'  => count($orders),
            'filled_buys'   => $buyCount,
            'filled_sells'  => $sellCount,
            'buy_amount'    => round($buyAmount, 2),
            'sell_amount'   => round($sellAmount, 2),
            'net_invested'  => round($buyAmount - $sellAmount, 2),
        ],
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
