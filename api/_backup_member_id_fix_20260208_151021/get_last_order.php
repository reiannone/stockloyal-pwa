<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get_last_order.php

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

// ✅ Expect JSON POST body
$input = json_decode(file_get_contents("php://input"), true);
$memberId = $input['member_id'] ?? null;

if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing member_id"
    ]);
    exit;
}

try {
    // First, get the most recent order to find the latest basket_id and placed_at date
    $stmt = $conn->prepare("
        SELECT basket_id, DATE(placed_at) as order_date
        FROM orders
        WHERE member_id = :member_id
        ORDER BY placed_at DESC
        LIMIT 1
    ");
    $stmt->execute([":member_id" => $memberId]);
    $lastOrder = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$lastOrder) {
        echo json_encode([
            "success" => true,
            "order"   => null,
            "message" => "No orders found"
        ]);
        exit;
    }

    // Now get ALL orders from that basket/date
    $stmt = $conn->prepare("
        SELECT 
            o.order_id,
            o.member_id,
            o.merchant_id,
            o.basket_id,
            o.symbol,
            o.shares,
            o.amount,
            o.status,
            o.placed_at,
            o.points_used,
            o.broker,
            o.order_type,
            m.merchant_name
        FROM orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        WHERE o.member_id = :member_id 
          AND o.basket_id = :basket_id
        ORDER BY o.order_id ASC
    ");
    $stmt->execute([
        ":member_id" => $memberId,
        ":basket_id" => $lastOrder['basket_id']
    ]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ✅ Aggregate the data
    $totalPointsUsed = 0.0;
    $totalCashValue = 0.0;
    $symbols = [];
    $primaryTicker = null;
    $orderIds = [];
    $merchantId = null;
    $merchantName = null;

    foreach ($orders as $order) {
        $totalPointsUsed += (float) $order['points_used'];
        $totalCashValue += (float) $order['amount'];
        
        if (!in_array($order['symbol'], $symbols)) {
            $symbols[] = $order['symbol'];
        }
        
        if ($primaryTicker === null) {
            $primaryTicker = $order['symbol']; // First symbol is primary
        }
        
        if ($merchantId === null) {
            $merchantId = $order['merchant_id']; // Get merchant_id from first order
        }
        
        if ($merchantName === null) {
            $merchantName = $order['merchant_name']; // Get merchant_name from wallet join
        }
        
        $orderIds[] = $order['order_id'];
    }

    // ✅ Create aggregated response
    $aggregatedOrder = [
        'order_ids' => implode(',', $orderIds),
        'basket_id' => $lastOrder['basket_id'],
        'member_id' => $memberId,
        'merchant_id' => $merchantId,
        'merchant_name' => $merchantName, // Now included!
        'points_used' => round($totalPointsUsed, 2),
        'cash_value' => round($totalCashValue, 2),
        'amount' => round($totalCashValue, 2), // Alias for consistency
        'primary_ticker' => $primaryTicker,
        'symbols' => implode(', ', $symbols), // Comma-separated list of symbols
        'order_count' => count($orders),
        'placed_at' => $orders[0]['placed_at'] ?? null,
        'broker' => $orders[0]['broker'] ?? null,
        'status' => $orders[0]['status'] ?? null
    ];

    echo json_encode([
        "success" => true,
        "order"   => $aggregatedOrder,
        "detail_orders" => $orders // Include individual orders for reference
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
