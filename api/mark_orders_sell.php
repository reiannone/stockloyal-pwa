<?php
// api/admin/mark_orders_sell.php
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

// ✅ Expect JSON
$input = json_decode(file_get_contents("php://input"), true) ?? [];
$orderIds = $input["order_ids"] ?? [];

if (empty($orderIds) || !is_array($orderIds)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "No order IDs provided."
    ]);
    exit;
}

// ✅ Sanitize: keep only positive integer IDs
$orderIds = array_map("intval", $orderIds);
$orderIds = array_values(array_filter($orderIds, fn($id) => $id > 0));

if (empty($orderIds)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Invalid order IDs."
    ]);
    exit;
}

try {
    $placeholders = implode(",", array_fill(0, count($orderIds), "?"));

    $stmt = $conn->prepare("
        UPDATE orders
        SET status = 'sell'
        WHERE order_id IN ($placeholders)
          AND status IN ('executed', 'confirmed', 'settled')
    ");
    $stmt->execute(array_values($orderIds));
    $updatedCount = $stmt->rowCount();

    echo json_encode([
        "success"       => true,
        "updated_count" => $updatedCount,
        "requested"     => count($orderIds),
    ]);
} catch (Exception $e) {
    error_log("mark_orders_sell.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
