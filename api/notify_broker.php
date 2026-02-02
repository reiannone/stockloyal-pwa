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

  // ✅ NEW: Processing stage for 3-stage order flow
  // "acknowledge" = Stage 2: Update orders to "placed"
  // "confirm" = Stage 3: Update orders to "confirmed"
  $processing_stage = trim((string)($input['processing_stage'] ?? 'acknowledge'));

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
      "processing_stage" => $processing_stage, // ✅ Include stage in payload
    ];
  }

  // ✅ FIRST: Update order status REGARDLESS of broker lookup
  // This ensures orders progress even if broker is not configured
  $ordersUpdated = 0;
  $newStatus = null;
  $fromStatus = null;
  
  if ($processing_stage === 'acknowledge') {
    $newStatus = 'placed';
    $fromStatus = 'pending';
  } elseif ($processing_stage === 'confirm') {
    $newStatus = 'confirmed';
    $fromStatus = 'placed';
  }
  
  if ($newStatus !== null && $basket_id !== '') {
    try {
      $orderUpd = $conn->prepare("
        UPDATE orders 
        SET status = :new_status,
            updated_at = NOW()
        WHERE basket_id = :basket_id 
          AND member_id = :member_id
          AND LOWER(status) = LOWER(:from_status)
      ");
      $orderUpd->execute([
        ":new_status"  => $newStatus,
        ":basket_id"   => $basket_id,
        ":member_id"   => $member_id,
        ":from_status" => $fromStatus,
      ]);
      $ordersUpdated = $orderUpd->rowCount();
      
      error_log("notify_broker.php: Updated $ordersUpdated orders from '$fromStatus' to '$newStatus' for basket_id=$basket_id, member_id=$member_id");
    } catch (Exception $orderErr) {
      error_log("notify_broker.php: Failed to update order status: " . $orderErr->getMessage());
    }
  } else {
    error_log("notify_broker.php: Skipping order update - newStatus=$newStatus, basket_id=$basket_id, processing_stage=$processing_stage");
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

  // If broker not found, still return success since orders were updated
  if (!$bm) {
    error_log("notify_broker.php: Broker '$broker' not found in broker_master - orders updated but no webhook sent");
    j([
      "success" => true,
      "notified" => false,
      "message" => "Broker not found in broker_master - orders updated but no webhook sent",
      "processing_stage" => $processing_stage,
      "orders_updated" => $ordersUpdated,
      "new_order_status" => $newStatus,
    ]);
  }

  $broker_id   = $bm['broker_id'] ?? null;
  $broker_name = $bm['broker_name'] ?? null;
  $webhook_url = $bm['webhook_url'] ?? null;
  $api_key     = $bm['api_key'] ?? null;

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

  // ✅ If no webhook URL configured, return success (orders already updated above)
  if (!$webhook_url) {
    // Update notification record to reflect no webhook
    $upd = $conn->prepare("
      UPDATE broker_notifications
      SET status='skipped', error_message='No webhook URL configured'
      WHERE id=:id
    ");
    $upd->execute([":id" => $notif_id]);

    j([
      "success" => true,
      "notified" => false,
      "notification_id" => $notif_id,
      "status" => "skipped",
      "message" => "No webhook URL configured - orders updated without webhook",
      "processing_stage" => $processing_stage,
      "orders_updated" => $ordersUpdated,
      "new_order_status" => $newStatus,
    ]);
  }

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

    // ✅ Orders were already updated above, return that info even on webhook failure
    j([
      "success" => true,
      "notified" => false,
      "notification_id" => $notif_id,
      "status" => "failed",
      "http_code" => $httpCode,
      "error" => $curlErr ?: "Webhook call failed",
      "processing_stage" => $processing_stage,
      "orders_updated" => $ordersUpdated,
      "new_order_status" => $newStatus,
      "message" => "Webhook failed but orders were updated",
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
    "processing_stage" => $processing_stage,
    "orders_updated" => $ordersUpdated,
    "new_order_status" => $newStatus,
  ]);

} catch (Exception $e) {
  error_log("notify_broker.php ERROR: " . $e->getMessage());
  j(["success" => false, "error" => "Server error", "details" => $e->getMessage()], 500);
}
