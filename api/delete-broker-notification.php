<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
  }

  $raw = file_get_contents("php://input");
  $input = json_decode($raw, true);
  if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid JSON payload"]);
    exit;
  }

  $id = (int)($input['id'] ?? 0);
  if ($id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "id is required"]);
    exit;
  }

  $stmt = $conn->prepare("DELETE FROM broker_notifications WHERE id = :id");
  $stmt->execute([":id" => $id]);

  echo json_encode([
    "success" => true,
    "message" => "Broker notification deleted",
    "id" => $id
  ]);

} catch (Exception $e) {
  error_log("delete-broker-notification.php ERROR: " . $e->getMessage());
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => "Server error",
    "details" => $e->getMessage(),
  ]);
}
