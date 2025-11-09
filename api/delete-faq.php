<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get-ledger.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // exposes $conn (PDO)

try {
  $body = json_decode(file_get_contents('php://input'), true) ?? $_POST ?? [];
  $faq_id = isset($body['faq_id']) ? (int)$body['faq_id'] : 0;

  if ($faq_id <= 0) {
    http_response_code(400);
    echo json_encode(['success'=>false,'error'=>'Invalid faq_id']);
    exit;
  }

  $stmt = $conn->prepare("DELETE FROM faq WHERE faq_id = :id");
  $stmt->execute([':id' => $faq_id]);

  echo json_encode(['success'=>true, 'deleted'=>$stmt->rowCount()]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['success'=>false,'error'=>'Server error: '.$e->getMessage()]);
}
