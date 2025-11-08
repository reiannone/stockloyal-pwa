<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once '/home/bitnami/stockloyal_bootstrap.php';
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
  // Accept query via either GET (for easy browsing) or JSON body (POST)
  $input = [];
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
  } else {
    $input = $_GET;
  }

  $active   = isset($input['active'])   ? (int)$input['active'] : null; // 1|0
  $category = isset($input['category']) ? trim((string)$input['category']) : null;
  $q        = isset($input['q'])        ? trim((string)$input['q']) : null;

  $limit  = isset($input['limit'])  ? (int)$input['limit']  : 200;
  $offset = isset($input['offset']) ? (int)$input['offset'] : 0;
  $limit  = max(1, min(500, $limit));
  $offset = max(0, $offset);

  $where  = [];
  $params = [];

  if ($active !== null) { $where[] = "is_active = :active"; $params[':active'] = $active; }
  if ($category)        { $where[] = "category = :category"; $params[':category'] = $category; }
  if ($q) {
    $where[] = "(question LIKE :q OR answer_html LIKE :q OR tags_csv LIKE :q)";
    $params[':q'] = '%'.$q.'%';
  }

  $whereSql = $where ? ('WHERE '.implode(' AND ', $where)) : '';

  $sql = "
    SELECT
      faq_id, question, answer_html, category, tags_csv,
      sort_order, is_active, created_at, updated_at
    FROM faq
    $whereSql
    ORDER BY sort_order ASC, faq_id DESC
    LIMIT :limit OFFSET :offset
  ";

  $stmt = $conn->prepare($sql);
  foreach ($params as $k => $v) $stmt->bindValue($k, $v);
  $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
  $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
  $stmt->execute();
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  echo json_encode(['success' => true, 'faqs' => $rows]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Server error: '.$e->getMessage()]);
}
