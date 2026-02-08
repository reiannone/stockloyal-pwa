<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/place_order.php

// header("Access-Control-Allow-Origin: *");
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

$member_id   = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
$merchant_id = $input['merchant_id'] ?? null; // ✅ Accept merchant_id
$symbol      = $input['symbol'];
$shares      = $input['shares'];
$points_used = $input['points_used'];
$broker      = $input['broker'];
$order_type  = $input['order_type'] ?? "market"; // ✅ default to market
$amount      = isset($input['amount']) ? floatval($input['amount']) : 0.0;
$basket_id   = $input['basket_id'] ?? null;

// ✅ NEW: Support 3-stage order process
// order_status: "pending" (T+1/immediate), "queued" (batched), or legacy "placed"
$order_status = $input['order_status'] ?? 'pending'; // ✅ Accept dynamic status
$sweep_day    = $input['sweep_day'] ?? null; // ✅ Accept sweep_day for reference

try {
    // ✅ 3-STAGE ORDER PROCESS:
    // - "pending": Initial status for T+1/immediate processing (Stage 1)
    // - "placed": After broker acknowledges (Stage 2)
    // - "confirmed": After broker confirms execution (Stage 3)
    // - "queued": For batched orders (sweep_day 1-31), processed on sweep day
    
    $sql = "
        INSERT INTO orders (
            member_id, merchant_id, symbol, shares, points_used, amount, order_type, status, placed_at, broker, basket_id
        ) VALUES (
            :member_id, :merchant_id, :symbol, :shares, :points_used, :amount, :order_type, :status, NOW(), :broker, :basket_id
        )
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':member_id'   => $member_id,
        ':merchant_id' => $merchant_id,
        ':symbol'      => $symbol,
        ':shares'      => $shares,
        ':amount'      => $amount,
        ':points_used' => $points_used,
        ':order_type'  => $order_type,
        ':status'      => $order_status, // ✅ Use dynamic status
        ':broker'      => $broker,
        ':basket_id'   => $basket_id
    ]);

    $order_id = $conn->lastInsertId();

    // ✅ Fetch inserted row so we can include placed_at timestamp
    $stmt2 = $conn->prepare("SELECT * FROM orders WHERE order_id = :order_id LIMIT 1");
    $stmt2->execute([':order_id' => $order_id]);
    $row = $stmt2->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        "success"  => true,
        "order_id" => $order_id,
        "data"     => [
            "member_id"   => $row['member_id'],
            "merchant_id" => $row['merchant_id'],
            "symbol"      => $row['symbol'],
            "shares"      => (float)$row['shares'],
            "points_used" => $row['points_used'],
            "amount"      => (float)$row['amount'],
            "order_type"  => $row['order_type'],
            "status"      => $row['status'],
            "broker"      => $row['broker'],
            "basket_id"   => $row['basket_id'],
            "placed_at"   => $row['placed_at'], // ✅ timestamp included
            "sweep_day"   => $sweep_day, // ✅ Include sweep_day for reference
        ]
    ]);
} catch (Exception $e) {
    error_log("place_order.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error"
    ]);
}
