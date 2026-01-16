<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$id = $input['id'] ?? null;

if (!$id) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing notification ID"
    ]);
    exit;
}

try {
    $stmt = $conn->prepare("DELETE FROM merchant_notifications WHERE id = :id");
    $stmt->execute([':id' => $id]);

    echo json_encode([
        "success" => true,
        "message" => "Notification deleted",
        "rows_affected" => $stmt->rowCount()
    ]);

} catch (PDOException $e) {
    error_log("delete-merchant-notification.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Database error: " . $e->getMessage()
    ]);
}
