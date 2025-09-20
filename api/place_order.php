<?php
// api/place_order.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// ✅ Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once "config.php"; // $conn is PDO

// ✅ Read JSON body
$input = json_decode(file_get_contents("php://input"), true);

if (
    !$input ||
    !isset($input['member_id'], $input['symbol'], $input['shares'], $input['broker'])
) {
    http_response_code(400);
    echo json_encode([
        "success"  => false,
        "error"    => "Invalid input: required fields missing",
        "received" => $input
    ]);
    exit;
}

$member_id  = $input['member_id'];
$symbol     = $input['symbol'];
$shares     = $input['shares'];
$broker     = $input['broker'];
$order_type = $input['order_type'] ?? "market"; // ✅ default to market

try {
    $sql = "
        INSERT INTO orders (member_id, symbol, shares, order_type, status, placed_at, broker)
        VALUES (:member_id, :symbol, :shares, :order_type, 'placed', NOW(), :broker)
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':member_id'  => $member_id,
        ':symbol'     => $symbol,
        ':shares'     => $shares,
        ':order_type' => $order_type,
        ':broker'     => $broker
    ]);

    echo json_encode([
        "success"  => true,
        "order_id" => $conn->lastInsertId(),
        "data"     => [
            "member_id"  => $member_id,
            "symbol"     => $symbol,
            "shares"     => $shares,
            "order_type" => $order_type,
            "broker"     => $broker
        ]
    ]);
} catch (Exception $e) {
    error_log("place_order.php error: " . $e->getMessage()); // ✅ log details safely
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error"
    ]);
}
