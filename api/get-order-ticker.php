<?php
// api/get-order-ticker.php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

try {
    // Pull rows to aggregate by order_id
    $sql = "
        SELECT
            o.order_id,
            o.member_id,
            o.symbol,
            o.shares,
            o.amount,
            COALESCE(o.points_used, 0) AS points_used,
            o.status,
            o.placed_at,
            t.created_at AS ledger_time
        FROM orders o
        LEFT JOIN transactions_ledger t
               ON t.order_id = o.order_id
              AND t.tx_type = 'redeem_points'
        WHERE o.status IN ('pending','executed','confirmed')
        ORDER BY COALESCE(t.created_at, o.placed_at) DESC, o.order_id DESC
        LIMIT 500
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute();

    // Group rows by order_id
    $byOrder = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $oid = $row['order_id'];

        if (!isset($byOrder[$oid])) {
            $byOrder[$oid] = [
                'order_id'   => $oid,
                'member_id'  => $row['member_id'],
                'pts'        => 0,
                'items'      => [], // array of { symbol, shares, amount }
                'status'     => $row['status'],
                'event_time' => $row['placed_at'],
            ];
        }

        // Add each stock line item
        $byOrder[$oid]['items'][] = [
            'symbol' => $row['symbol'],
            'amount' => isset($row['amount']) ? (float)$row['amount'] : 0.0,
            'shares' => isset($row['shares']) ? (float)$row['shares'] : 0.0,
        ];

        // Accumulate total points for this order
        $byOrder[$oid]['pts'] += (float)$row['points_used'];

        // Pick status (keep first or override—your call)
        if (!$byOrder[$oid]['status'] && $row['status']) {
            $byOrder[$oid]['status'] = $row['status'];
        }

        // Latest event time (ledger redeem > placed)
        $candidate = $row['ledger_time'] ?? $row['placed_at'];
        if ($candidate && strcmp($candidate, $byOrder[$oid]['event_time']) > 0) {
            $byOrder[$oid]['event_time'] = $candidate;
        }
    }

    // Sort by most recent event_time descending
    usort($byOrder, function ($a, $b) {
        return strcmp($b['event_time'], $a['event_time']);
    });

    // Prepare final payload (limit to 50 most recent)
    $items = [];
    $count = 0;
    foreach ($byOrder as $order) {
        $items[] = [
            'order_id'    => $order['order_id'],
            'member_id'   => $order['member_id'],
            'pts'         => $order['pts'],             // legacy shorthand
            'points_used' => $order['pts'],             // explicit total points
            'status'      => $order['status'],
            'placed_at'   => $order['event_time'],
            'lines'       => $order['items'],           // each {symbol, shares, amount}
        ];
        if (++$count >= 50) break;
    }

    echo json_encode([
        'success' => true,
        'items'   => $items
    ], JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Server error'
    ], JSON_UNESCAPED_SLASHES);
}
