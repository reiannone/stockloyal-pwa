<?php
// api/get-order-ticker.php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

try {
    // One row per (order × redeem_points txn). Orders with no ledger still appear once with pts=0.
    $sql = "
        SELECT
            o.order_id,
            o.member_id,
            o.symbol,
            o.shares,
            COALESCE(ABS(t.amount_points), 0) AS pts,  -- per-action points (no SUM/GROUP)
            o.status,
            COALESCE(t.created_at, o.placed_at) AS event_time
        FROM orders o
        LEFT JOIN transactions_ledger t
               ON t.order_id = o.order_id
              AND t.tx_type = 'redeem_points'          -- adjust if your type differs
        WHERE o.status IN ('pending','executed','confirmed')
        ORDER BY event_time DESC
        LIMIT 50
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute();

    $items = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $items[] = [
            'member_id' => $row['member_id'],
            'symbol'    => $row['symbol'],
            'shares'    => $row['shares'],
            'pts'       => (int)$row['pts'],           // cast if you want integers
            'status'    => $row['status'],
            'placed_at' => $row['event_time'],
        ];
    }

    echo json_encode(['success' => true, 'items' => $items], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error'], JSON_UNESCAPED_SLASHES);
}
