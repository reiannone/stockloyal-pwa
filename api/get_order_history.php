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
        SELECT 
            order_id,
            member_id,
            symbol,
            shares,
            amount,
            status,
            placed_at,
            broker,
            order_type
        FROM orders
        WHERE member_id = :member_id
        ORDER BY placed_at DESC
    ");
    $stmt->execute([":member_id" => $memberId]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ✅ Cast numeric fields
    foreach ($orders as &$order) {
        if (isset($order['shares'])) {
            $order['shares'] = (float) $order['shares'];
        }
        if (isset($order['amount'])) {
            $order['amount'] = (float) $order['amount'];
        }
    }

    echo json_encode([
        "success" => true,
        "orders"  => $orders
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
