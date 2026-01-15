<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/log-ledger.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header("Access-Control-Allow-Methods: POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type");
  exit;
}

require_once __DIR__ . '/config.php'; // uses your PDO $conn

$input = json_decode(file_get_contents("php://input"), true);

// ✅ Log incoming request for debugging
error_log("[log-ledger.php] Incoming request: " . json_encode($input));

$member_id      = trim($input['member_id']      ?? '');
$merchant_id    = trim($input['merchant_id']    ?? '');
$points         = isset($input['points']) ? (float)$input['points'] : null;
$amount_cash    = isset($input['amount_cash']) ? (float)$input['amount_cash'] : null;
$action         = strtolower(trim($input['action'] ?? 'earn')); // 'earn' or 'redeem'
$client_tx_id   = trim($input['client_tx_id']   ?? '');
$member_timezone = trim($input['member_timezone'] ?? '');
$note           = trim($input['note'] ?? 'Demo launch');

// ✅ IMPORTANT: Due to ck_amount_exclusive constraint, we can only set ONE of:
// amount_points OR amount_cash (not both)
// For points transactions, we use amount_points and set amount_cash to NULL
if ($points !== null && $points > 0) {
  $amount_cash = null;  // ✅ Set to NULL to satisfy constraint
  error_log("[log-ledger.php] Points transaction - setting amount_cash to NULL");
}

// ✅ Detailed validation logging
if ($member_id === '') {
  error_log("[log-ledger.php] Validation failed: member_id is empty");
}
if ($merchant_id === '') {
  error_log("[log-ledger.php] Validation failed: merchant_id is empty");
}
if ($points === null || $points <= 0) {
  error_log("[log-ledger.php] Validation failed: points is null or <= 0");
}
if ($client_tx_id === '') {
  error_log("[log-ledger.php] Validation failed: client_tx_id is empty");
}
if ($member_timezone === '') {
  error_log("[log-ledger.php] Validation failed: member_timezone is empty");
}

if ($member_id === '' || $merchant_id === '' || $points === null || $points <= 0 || $client_tx_id === '' || $member_timezone === '') {
  http_response_code(400);
  $errorResponse = [
    "success" => false, 
    "error" => "Missing/invalid fields",
    "details" => [
      "member_id" => $member_id === '' ? "empty" : "ok",
      "merchant_id" => $merchant_id === '' ? "empty" : "ok",
      "points" => ($points === null || $points <= 0) ? "invalid" : "ok",
      "client_tx_id" => $client_tx_id === '' ? "empty" : "ok",
      "member_timezone" => $member_timezone === '' ? "empty" : "ok"
    ]
  ];
  error_log("[log-ledger.php] Validation failed: " . json_encode($errorResponse));
  echo json_encode($errorResponse);
  exit;
}

/* Map action -> tx_type + direction */
$tx_type   = $action === 'redeem' ? 'redeem_points' : 'points_received';
$direction = $action === 'redeem' ? 'outbound'      : 'inbound';

try {
  $sql = "
    INSERT INTO transactions_ledger
      (member_id, merchant_id, tx_type, direction, channel, status,
       amount_points, amount_cash, client_tx_id, member_timezone, note)
    VALUES
      (:member_id, :merchant_id, :tx_type, :direction, 'merchant', 'confirmed',
       :amount_points, :amount_cash, :client_tx_id, :member_timezone, :note)
  ";

  $stmt = $conn->prepare($sql);
  $stmt->execute([
    ':member_id'       => $member_id,
    ':merchant_id'     => $merchant_id,
    ':tx_type'         => $tx_type,
    ':direction'       => $direction,
    ':amount_points'   => $points,
    ':amount_cash'     => $amount_cash,
    ':client_tx_id'    => $client_tx_id,
    ':member_timezone' => $member_timezone,
    ':note'            => $note,
  ]);

  $txId = $conn->lastInsertId();
  error_log("[log-ledger.php] Transaction logged successfully: tx_id=$txId, client_tx_id=$client_tx_id");
  
  echo json_encode(["success" => true, "tx_id" => $txId]);
} catch (PDOException $e) {
  // Handle idempotency duplicate gracefully (unique client_tx_id)
  if (strpos($e->getMessage(), 'uq_client_tx_id') !== false) {
    error_log("[log-ledger.php] Duplicate client_tx_id detected: $client_tx_id");
    echo json_encode(["success" => true, "duplicate" => true]);
  } else {
    error_log("[log-ledger.php] Database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
  }
}
