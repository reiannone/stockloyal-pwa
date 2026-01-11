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
$member_id      = trim($input['member_id']      ?? '');
$merchant_id    = trim($input['merchant_id']    ?? '');
$points         = isset($input['points']) ? (float)$input['points'] : null;
$amount_cash    = isset($input['amount_cash']) ? (float)$input['amount_cash'] : null;
$action         = strtolower(trim($input['action'] ?? 'earn')); // 'earn' or 'redeem'
$client_tx_id   = trim($input['client_tx_id']   ?? '');
$member_timezone = trim($input['member_timezone'] ?? '');
$note           = trim($input['note'] ?? 'Demo launch');

if ($member_id === '' || $merchant_id === '' || $points === null || $points <= 0 || $client_tx_id === '' || $member_timezone === '') {
  http_response_code(400);
  echo json_encode(["success" => false, "error" => "Missing/invalid member_id, merchant_id, points, client_tx_id, or member_timezone"]);
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
      (:member_id, :merchant_id, :tx_type, :direction, 'Internal', 'confirmed',
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

  echo json_encode(["success" => true, "tx_id" => $conn->lastInsertId()]);
} catch (PDOException $e) {
  // Handle idempotency duplicate gracefully (unique client_tx_id)
  if (strpos($e->getMessage(), 'uq_client_tx_id') !== false) {
    echo json_encode(["success" => true, "duplicate" => true]);
  } else {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
  }
}
