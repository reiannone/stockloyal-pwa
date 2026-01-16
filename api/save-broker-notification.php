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

  // Whitelist fields that the admin UI might edit
  $allowed = [
    "broker_id",
    "broker_name",
    "event_type",
    "status",
    "member_id",
    "merchant_id",
    "basket_id",
    "payload",
    "response_code",
    "response_body",
    "error_message",
    "sent_at",
  ];

  $sets = [];
  $params = [":id" => $id];

  foreach ($allowed as $field) {
    if (array_key_exists($field, $input)) {
      $sets[] = "$field = :$field";

      $val = $input[$field];

      // Normalize empty strings -> NULL for nullable columns
      if (is_string($val) && trim($val) === "") $val = null;

      $params[":$field"] = $val;
    }
  }

  if (!$sets) {
    echo json_encode(["success" => true, "message" => "No changes"]);
    exit;
  }

  // Ensure status is valid if provided
  if (array_key_exists(":status", $params)) {
    $s = (string)$params[":status"];
    if (!in_array($s, ["pending", "sent", "failed"], true)) {
      http_response_code(400);
      echo json_encode(["success" => false, "error" => "Invalid status"]);
      exit;
    }
  }

  $sql = "UPDATE broker_notifications SET " . implode(", ", $sets) . " WHERE id = :id";
  $stmt = $conn->prepare($sql);
  $stmt->execute($params);

  echo json_encode([
    "success" => true,
    "message" => "Broker notification saved",
    "id" => $id
  ]);

} catch (Exception $e) {
  error_log("save-broker-notification.php ERROR: " . $e->getMessage());
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => "Server error",
    "details" => $e->getMessage(),
  ]);
}
