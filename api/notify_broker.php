<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function j($arr, int $code = 200) {
  http_response_code($code);
  echo json_encode($arr);
  exit;
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    j(["success" => false, "error" => "Method not allowed"], 405);
  }

  $raw = file_get_contents("php://input");
  $input = json_decode($raw, true);
  if (!is_array($input)) {
    j(["success" => false, "error" => "Invalid JSON payload"], 400);
  }

  // Required basics
  $member_id   = trim((string)($input['member_id'] ?? ''));
  $merchant_id = trim((string)($input['merchant_id'] ?? ''));
  $basket_id   = trim((string)($input['basket_id'] ?? ''));
  $broker      = trim((string)($input['broker'] ?? ''));

  if ($member_id === '' || $basket_id === '' || $broker === '') {
    j(["success" => false, "error" => "member_id, basket_id, broker are required"], 400);
  }

  // Payload to send to broker webhook (you can expand this)
  $event_type = trim((string)($input['event_type'] ?? 'order_placed'));
  $payloadArr = $input['payload'] ?? null;

  if (!is_array($payloadArr)) {
    // sensible default broker payload if caller didn't send a nested payload
    $payloadArr = [
      "event_type"  => $event_type,
      "member_id"   => $member_id,
      "merchant_id" => $merchant_id,
      "basket_id"   => $basket_id,
      "timestamp"   => gmdate('c'),
      // optional rollups if provided
      "amount"      => $input['amount'] ?? null,
      "points_used" => $input['points_used'] ?? null,
      "orders"      => $input['orders'] ?? null,
    ];
  }

  // 1) Lookup broker_master webhook_url + api_key
  // If your UI stores broker name in orders (it does) we match broker_name; you can switch to broker_id later.
  $stmt = $conn->prepare("
    SELECT broker_id, broker_name, webhook_url, api_key
    FROM broker_master
    WHERE broker_name = :broker_name OR broker_id = :broker_id
    LIMIT 1
  ");
  $stmt->execute([
    ":broker_name" => $broker,
    ":broker_id"   => $broker,
  ]);
  $bm = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$bm) {
    j(["success" => false, "error" => "Broker not found in broker_master"], 404);
  }

  $broker_id   = $bm['broker_id'] ?? null;
  $broker_name = $bm['broker_name'] ?? null;
  $webhook_url = $bm['webhook_url'] ?? null;
  $api_key     = $bm['api_key'] ?? null;

  if (!$webhook_url) {
    j(["success" => false, "error" => "Broker webhook_url is not configured"], 400);
  }

  // 2) Insert notification record (pending)
  $payloadJson = json_encode($payloadArr, JSON_UNESCAPED_SLASHES);
  $ins = $conn->prepare("
    INSERT INTO broker_notifications
      (broker_id, broker_name, event_type, status, member_id, merchant_id, basket_id, payload)
    VALUES
      (:broker_id, :broker_name, :event_type, 'pending', :member_id, :merchant_id, :basket_id, :payload)
  ");
  $ins->execute([
    ":broker_id"   => $broker_id,
    ":broker_name" => $broker_name,
    ":event_type"  => $event_type,
    ":member_id"   => $member_id,
    ":merchant_id" => $merchant_id,
    ":basket_id"   => $basket_id,
    ":payload"     => $payloadJson,
  ]);
  $notif_id = (int)$conn->lastInsertId();

  // 3) POST to broker webhook
  $ch = curl_init($webhook_url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadJson);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
  curl_setopt($ch, CURLOPT_TIMEOUT, 20);

  $headers = [
    "Content-Type: application/json",
  ];

  // Choose ONE header convention. Default to Bearer token.
  if ($api_key) {
    $headers[] = "Authorization: Bearer " . $api_key;
    // alternatively: $headers[] = "x-api-key: " . $api_key;
  }

  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

  $respBody = curl_exec($ch);
  $curlErr  = curl_error($ch);
  $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  // 4) Update notification record with result
  if ($respBody === false || $curlErr) {
    $upd = $conn->prepare("
      UPDATE broker_notifications
      SET status='failed', error_message=:err, response_code=:code, response_body=:body
      WHERE id=:id
    ");
    $upd->execute([
      ":err"  => $curlErr ?: "Webhook call failed",
      ":code" => $httpCode ?: null,
      ":body" => $respBody ?: null,
      ":id"   => $notif_id
    ]);

    j([
      "success" => true,
      "notified" => false,
      "notification_id" => $notif_id,
      "status" => "failed",
      "http_code" => $httpCode,
      "error" => $curlErr ?: "Webhook call failed",
    ]);
  }

  $ok = ($httpCode >= 200 && $httpCode < 300);
  $upd = $conn->prepare("
    UPDATE broker_notifications
    SET status=:status,
        sent_at=IF(:status='sent', CURRENT_TIMESTAMP, sent_at),
        response_code=:code,
        response_body=:body,
        error_message=NULL
    WHERE id=:id
  ");
  $upd->execute([
    ":status" => $ok ? "sent" : "failed",
    ":code"   => $httpCode ?: null,
    ":body"   => $respBody,
    ":id"     => $notif_id
  ]);

  j([
    "success" => true,
    "notified" => $ok,
    "notification_id" => $notif_id,
    "status" => $ok ? "sent" : "failed",
    "http_code" => $httpCode,
  ]);

} catch (Exception $e) {
  error_log("notify_broker.php ERROR: " . $e->getMessage());
  j(["success" => false, "error" => "Server error", "details" => $e->getMessage()], 500);
}
