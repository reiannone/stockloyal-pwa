<?php
// api/get_order_history.php

header("Access-Control-Allow-Origin: *");
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
    // 1. Fetch all orders for this member
    $stmt = $conn->prepare("
        SELECT *
        FROM orders
        WHERE member_id = :member_id
        ORDER BY placed_at DESC
    ");
    $stmt->execute([":member_id" => $memberId]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ✅ Cast numeric fields + calculate portfolio total
    $portfolioTotal = 0.0;
    foreach ($orders as &$order) {
        if (isset($order['shares'])) {
            $order['shares'] = (float) $order['shares'];
        }
        if (isset($order['amount'])) {
            $order['amount'] = (float) $order['amount'];
        }
        // Add to portfolio if status is confirmed or executed
        if (isset($order['status']) && in_array(strtolower($order['status']), ['confirmed','executed'])) {
            $portfolioTotal += (float) $order['amount'];
        }
    }

    echo json_encode([
        "success"          => true,
        "orders"           => $orders,
        "portfolio_value"  => $portfolioTotal
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
