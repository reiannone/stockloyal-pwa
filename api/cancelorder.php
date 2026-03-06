<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/cancelorder.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true);
$orderId = $input['order_id'] ?? null;
$action  = $input['action']   ?? 'cancel'; // 'cancel' or 'delete'

if (!$orderId) {
    http_response_code(400);
    echo json_encode(["error" => "Missing 'order_id'"]);
    exit;
}

try {
    if ($action === 'delete') {
        $sql  = "DELETE FROM orders WHERE order_id = :oid";
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':oid', $orderId);
        if ($stmt->execute() && $stmt->rowCount() > 0) {
            echo json_encode(["success" => true, "action" => "deleted"]);
        } else {
            http_response_code(404);
            echo json_encode(["error" => "Order not found"]);
        }
    } else {
        $sql  = "UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE order_id = :oid";
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':oid', $orderId);
        if ($stmt->execute() && $stmt->rowCount() > 0) {
            echo json_encode(["success" => true, "action" => "cancelled"]);
        } else {
            http_response_code(404);
            echo json_encode(["error" => "Order not found or already cancelled"]);
        }
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server error: " . $e->getMessage()]);
}
