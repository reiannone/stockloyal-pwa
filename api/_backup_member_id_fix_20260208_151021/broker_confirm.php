<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

/**
 * broker_confirm.php
 * 
 * STAGE 3 of 3-stage order process:
 * - Stage 1: Order created with status "pending" (place_order.php)
 * - Stage 2: Broker acknowledges → status "placed" (notify_broker.php)
 * - Stage 3: Broker confirms execution → status "confirmed" (this file)
 * 
 * This endpoint is called after a delay to confirm order execution.
 * It updates all orders in a basket from "placed" to "confirmed".
 */

function respond($arr, int $code = 200) {
    http_response_code($code);
    echo json_encode($arr);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(["success" => false, "error" => "Method not allowed"], 405);
    }

    $raw = file_get_contents("php://input");
    $input = json_decode($raw, true);
    
    if (!is_array($input)) {
        respond(["success" => false, "error" => "Invalid JSON payload"], 400);
    }

    $member_id  = trim((string)($input['member_id'] ?? ''));
    $basket_id  = trim((string)($input['basket_id'] ?? ''));
    $processing_stage = trim((string)($input['processing_stage'] ?? 'confirm'));

    if ($member_id === '' || $basket_id === '') {
        respond(["success" => false, "error" => "member_id and basket_id are required"], 400);
    }

    // Determine status transition based on processing_stage
    $newStatus = 'confirmed';
    $fromStatus = 'placed';
    
    if ($processing_stage === 'acknowledge') {
        // Allow this endpoint to also handle Stage 2 if needed
        $newStatus = 'placed';
        $fromStatus = 'pending';
    }

    // ✅ Update order status (case-insensitive comparison)
    $stmt = $conn->prepare("
        UPDATE orders 
        SET status = :new_status,
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE basket_id = :basket_id 
          AND member_id = :member_id
          AND LOWER(status) = LOWER(:from_status)
    ");
    
    $stmt->execute([
        ":new_status"  => $newStatus,
        ":basket_id"   => $basket_id,
        ":member_id"   => $member_id,
        ":from_status" => $fromStatus,
    ]);
    
    $ordersUpdated = $stmt->rowCount();

    // ✅ Log the confirmation
    error_log("broker_confirm.php: Updated $ordersUpdated orders from '$fromStatus' to '$newStatus' for basket_id=$basket_id, member_id=$member_id");

    // ✅ Optionally fetch updated orders to return details
    $fetchStmt = $conn->prepare("
        SELECT order_id, symbol, shares, amount, status, confirmed_at
        FROM orders
        WHERE basket_id = :basket_id AND member_id = :member_id
    ");
    $fetchStmt->execute([
        ":basket_id" => $basket_id,
        ":member_id" => $member_id,
    ]);
    $orders = $fetchStmt->fetchAll(PDO::FETCH_ASSOC);

    respond([
        "success" => true,
        "message" => "Orders confirmed successfully",
        "orders_updated" => $ordersUpdated,
        "basket_id" => $basket_id,
        "member_id" => $member_id,
        "new_status" => $newStatus,
        "orders" => $orders,
    ]);

} catch (Exception $e) {
    error_log("broker_confirm.php ERROR: " . $e->getMessage());
    respond([
        "success" => false, 
        "error" => "Server error", 
        "details" => $e->getMessage()
    ], 500);
}
