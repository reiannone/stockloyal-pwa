<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  // Accept filters via POST JSON (matches your admin pages' apiPost usage)
  $raw = file_get_contents("php://input");
  $input = json_decode($raw, true);
  if (!is_array($input)) $input = [];

  $where = [];
  $params = [];

  // Exact / LIKE filters
  if (!empty($input['broker_id'])) {
    $where[] = "broker_id = :broker_id";
    $params[':broker_id'] = trim((string)$input['broker_id']);
  }

  if (!empty($input['broker_name'])) {
    $where[] = "broker_name LIKE :broker_name";
    $params[':broker_name'] = "%" . trim((string)$input['broker_name']) . "%";
  }

  if (!empty($input['member_id'])) {
    $where[] = "member_id = :member_id";
    $params[':member_id'] = trim((string)$input['member_id']);
  }

  if (!empty($input['merchant_id'])) {
    $where[] = "merchant_id = :merchant_id";
    $params[':merchant_id'] = trim((string)$input['merchant_id']);
  }

  if (!empty($input['basket_id'])) {
    $where[] = "basket_id = :basket_id";
    $params[':basket_id'] = trim((string)$input['basket_id']);
  }

  if (!empty($input['event_type'])) {
    $where[] = "event_type = :event_type";
    $params[':event_type'] = trim((string)$input['event_type']);
  }

  if (!empty($input['status'])) {
    $where[] = "status = :status";
    $params[':status'] = trim((string)$input['status']);
  }

  // Date range filters (created_at)
  if (!empty($input['start_date'])) {
    $where[] = "created_at >= :start_date";
    $params[':start_date'] = trim((string)$input['start_date']);
  }
  if (!empty($input['end_date'])) {
    $where[] = "created_at < :end_date";
    $params[':end_date'] = trim((string)$input['end_date']);
  }

  $whereSql = $where ? ("WHERE " . implode(" AND ", $where)) : "";

  // Sorting + paging (whitelisted)
  $allowedSort = [
    "created_at", "sent_at", "status", "event_type",
    "broker_name", "broker_id", "member_id", "merchant_id", "basket_id", "id"
  ];
  $sortBy = (string)($input['sort_by'] ?? "created_at");
  if (!in_array($sortBy, $allowedSort, true)) $sortBy = "created_at";

  $sortDir = strtoupper((string)($input['sort_dir'] ?? "DESC"));
  $sortDir = ($sortDir === "ASC") ? "ASC" : "DESC";

  $limit = (int)($input['limit'] ?? 200);
  if ($limit < 1) $limit = 200;
  if ($limit > 500) $limit = 500;

  $offset = (int)($input['offset'] ?? 0);
  if ($offset < 0) $offset = 0;

  $sql = "
    SELECT
      id, created_at, sent_at,
      broker_id, broker_name,
      event_type, status,
      member_id, merchant_id, basket_id,
      payload, response_code, response_body, error_message
    FROM broker_notifications
    $whereSql
    ORDER BY $sortBy $sortDir
    LIMIT :limit OFFSET :offset
  ";

  $stmt = $conn->prepare($sql);

  foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v);
  }
  $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
  $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);

  $stmt->execute();
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  echo json_encode([
    "success" => true,
    "notifications" => $rows,
    "limit" => $limit,
    "offset" => $offset,
    "count" => count($rows),
  ]);

} catch (Exception $e) {
  error_log("get-broker-notifications.php ERROR: " . $e->getMessage());
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => "Server error",
    "details" => $e->getMessage(),
  ]);
}
