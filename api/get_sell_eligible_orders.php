<?php
// api/get_sell_eligible_orders.php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once __DIR__ . '/config.php';

try {
    $stmt = $conn->prepare("
        SELECT order_id, member_id, merchant_id, basket_id, batch_id,
               symbol, shares, amount, points_used, status, placed_at,
               member_timezone, broker, order_type,
               executed_at, executed_price, executed_shares, executed_amount,
               paid_flag, paid_batch_id, paid_at, broker_order_id,
               updated_at, confirmed_at
        FROM orders
        WHERE status IN ('settled', 'sell', 'sold')
        ORDER BY placed_at DESC
    ");
    $stmt->execute();
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ✅ Normalize numeric fields
    foreach ($orders as &$order) {
        foreach (['shares', 'amount', 'executed_price', 'executed_shares', 'executed_amount'] as $col) {
            if (isset($order[$col])) {
                $order[$col] = (float) $order[$col];
            }
        }
        foreach (['order_id', 'points_used', 'paid_flag'] as $col) {
            if (isset($order[$col])) {
                $order[$col] = (int) $order[$col];
            }
        }
    }
    unset($order);

    echo json_encode([
        "success" => true,
        "orders"  => $orders
    ]);
} catch (Exception $e) {
    error_log("get_sell_eligible_orders.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
