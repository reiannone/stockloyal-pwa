<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function respond(array $arr, int $code = 200): void {
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

  $id = (int)($input['id'] ?? 0);
  if ($id <= 0) {
    respond(["success" => false, "error" => "id is required"], 400);
  }

  // Load notification
  $stmt = $conn->prepare("
    SELECT id, broker_id, broker_name, payload
    FROM broker_notifications
    WHERE id = :id
    LIMIT 1
  ");
  $stmt->execute([":id" => $id]);
  $n = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$n) {
    respond(["success" => false, "error" => "Notification not found"], 404);
  }

  $broker_id = $n['broker_id'] ?? null;
  $broker_name = $n['broker_name'] ?? null;
  $payload = $n['payload'] ?? null;

  if (!$payload || trim((string)$payload) === "") {
    respond(["success" => false, "error" => "Notification has no payload to resend"], 400);
  }

  // Lookup broker webhook config
  $stmt2 = $conn->prepare("
    SELECT broker_id, broker_name, webhook_url, api_key
    FROM broker_master
    WHERE (broker_id = :broker_id AND :broker_id IS NOT NULL AND :broker_id <> '')
       OR (broker_name = :broker_name AND :broker_name IS NOT NULL AND :broker_name <> '')
    LIMIT 1
  ");
  $stmt2->execute([
    ":broker_id" => (string)($broker_id ?? ""),
    ":broker_name" => (string)($broker_name ?? ""),
  ]);
  $bm = $stmt2->fetch(PDO::FETCH_ASSOC);

  if (!$bm) {
    respond(["success" => false, "error" => "Broker not found in broker_master"], 404);
  }

  $webhook_url = $bm['webhook_url'] ?? null;
  $api_key = $bm['api_key'] ?? null;

  if (!$webhook_url || trim((string)$webhook_url) === "") {
    respond(["success" => false, "error" => "Broker webhook_url is not configured"], 400);
  }

  // Set pending before retry
  $conn->prepare("
    UPDATE broker_notifications
    SET status='pending', error_message=NULL
    WHERE id=:id
  ")->execute([":id" => $id]);

  // POST to broker webhook
  $ch = curl_init($webhook_url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
  curl_setopt($ch, CURLOPT_TIMEOUT, 20);

  $headers = ["Content-Type: application/json"];
  if ($api_key && trim((string)$api_key) !== "") {
    // Choose ONE convention; keep consistent with notify_broker.php
    $headers[] = "Authorization: Bearer " . $api_key;
    // alt: $headers[] = "x-api-key: " . $api_key;
  }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

  $respBody = curl_exec($ch);
  $curlErr  = curl_error($ch);
  $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($respBody === false || $curlErr) {
    $conn->prepare("
      UPDATE broker_notifications
      SET status='failed', response_code=:code, response_body=:body, error_message=:err
      WHERE id=:id
    ")->execute([
      ":code" => $httpCode ?: null,
      ":body" => $respBody ?: null,
      ":err"  => $curlErr ?: "Webhook call failed",
      ":id"   => $id
    ]);

    respond([
      "success" => true,
      "retried" => true,
      "notified" => false,
      "status" => "failed",
      "http_code" => $httpCode,
      "error" => $curlErr ?: "Webhook call failed",
      "id" => $id
    ]);
  }

  $ok = ($httpCode >= 200 && $httpCode < 300);

  $conn->prepare("
    UPDATE broker_notifications
    SET status=:status,
        sent_at=IF(:status='sent', CURRENT_TIMESTAMP, sent_at),
        response_code=:code,
        response_body=:body,
        error_message=IF(:status='failed', 'Non-2xx response', NULL)
    WHERE id=:id
  ")->execute([
    ":status" => $ok ? "sent" : "failed",
    ":code" => $httpCode ?: null,
    ":body" => $respBody,
    ":id" => $id
  ]);

  respond([
    "success" => true,
    "retried" => true,
    "notified" => $ok,
    "status" => $ok ? "sent" : "failed",
    "http_code" => $httpCode,
    "id" => $id
  ]);

} catch (Exception $e) {
  error_log("retry-broker-notification.php ERROR: " . $e->getMessage());
  respond(["success" => false, "error" => "Server error", "details" => $e->getMessage()], 500);
}
