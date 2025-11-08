<?php
// api/get-order-ticker.php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';     // if you use one

header('Content-Type: application/json');

require_once __DIR__ . '/config.php';   // your PDO $conn loader


try {
    // Recent 50 orders (tweak as needed). Show both pending/executed for a lively tape.
    $sql = "
        SELECT
            o.order_id,
            o.member_id,
            o.symbol,
            o.shares,
            COALESCE(pts.total_points, 0) AS pts,
            o.status,
            o.placed_at
        FROM orders o
        LEFT JOIN (
            SELECT order_id, ABS(SUM(amount_points)) AS total_points
            FROM transactions_ledger
            WHERE tx_type = 'redeem_points'
            GROUP BY order_id
        ) pts ON pts.order_id = o.order_id
        WHERE o.status IN ('pending','executed')
        ORDER BY o.placed_at DESC
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
            'pts'       => $row['pts'],
            'status'    => $row['status'],
            'placed_at' => $row['placed_at'],
        ];
    }

    echo json_encode(['success' => true, 'items' => $items], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error'], JSON_UNESCAPED_SLASHES);
}
