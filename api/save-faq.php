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

  $faq_id      = isset($body['faq_id']) ? (int)$body['faq_id'] : null;
  $question    = trim((string)($body['question'] ?? ''));
  $answer_html = (string)($body['answer_html'] ?? '');
  $category    = trim((string)($body['category'] ?? ''));
  $tags_csv    = trim((string)($body['tags_csv'] ?? ''));
  $sort_order  = (int)($body['sort_order'] ?? 0);
  $is_active   = (int)!!($body['is_active'] ?? 1);
  $user        = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

  if ($question === '' || $answer_html === '') {
    http_response_code(400);
    echo json_encode(['success'=>false,'error'=>'Question and Answer are required']);
    exit;
  }

  if ($faq_id) {
    // Update
    $sql = "UPDATE faq
               SET question = :question,
                   answer_html = :answer_html,
                   category = :category,
                   tags_csv = :tags_csv,
                   sort_order = :sort_order,
                   is_active = :is_active,
                   last_modified_by = :user
             WHERE faq_id = :faq_id";
    $stmt = $conn->prepare($sql);
    $stmt->execute([
      ':question'    => $question,
      ':answer_html' => $answer_html,
      ':category'    => ($category !== '' ? $category : null),
      ':tags_csv'    => ($tags_csv !== '' ? $tags_csv : null),
      ':sort_order'  => $sort_order,
      ':is_active'   => $is_active,
      ':user'        => $user,
      ':faq_id'      => $faq_id
    ]);
  } else {
    // Insert
    $sql = "INSERT INTO faq
              (question, answer_html, category, tags_csv, sort_order, is_active, last_modified_by)
            VALUES
              (:question, :answer_html, :category, :tags_csv, :sort_order, :is_active, :user)";
    $stmt = $conn->prepare($sql);
    $stmt->execute([
      ':question'    => $question,
      ':answer_html' => $answer_html,
      ':category'    => ($category !== '' ? $category : null),
      ':tags_csv'    => ($tags_csv !== '' ? $tags_csv : null),
      ':sort_order'  => $sort_order,
      ':is_active'   => $is_active,
      ':user'        => $user
    ]);
    $faq_id = (int)$conn->lastInsertId();
  }

  // Return saved row
  $get = $conn->prepare("SELECT faq_id, question, answer_html, category, tags_csv, sort_order, is_active, created_at, updated_at
                         FROM faq WHERE faq_id = :id");
  $get->execute([':id' => $faq_id]);
  $faq = $get->fetch(PDO::FETCH_ASSOC);

  echo json_encode(['success' => true, 'faq' => $faq]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['success'=>false,'error'=>'Server error: '.$e->getMessage()]);
}
