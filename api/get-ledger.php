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

$input = json_decode(file_get_contents("php://input"), true) ?? [];

// ---- Filters (all optional) ----
$memberId  = isset($input['member_id'])  ? trim($input['member_id'])  : null;
$orderId   = isset($input['order_id'])   ? $input['order_id']         : null;
$txType    = isset($input['tx_type'])    ? trim($input['tx_type'])    : null;
$status    = isset($input['status'])     ? trim($input['status'])     : null;
$direction = isset($input['direction'])  ? trim($input['direction'])  : null;
$channel   = isset($input['channel'])    ? trim($input['channel'])    : null;

// Date range (UTC) using created_at
$startDate = isset($input['start_date']) ? trim($input['start_date']) : null; // 'YYYY-MM-DD' or full 'YYYY-MM-DD HH:MM:SS'
$endDate   = isset($input['end_date'])   ? trim($input['end_date'])   : null;

// Pagination / sorting
$limit    = isset($input['limit'])    ? (int)$input['limit']    : 100;
$offset   = isset($input['offset'])   ? (int)$input['offset']   : 0;
$sortBy   = isset($input['sort_by'])  ? trim($input['sort_by']) : 'created_at';
$sortDir  = isset($input['sort_dir']) ? strtoupper(trim($input['sort_dir'])) : 'DESC';

// Whitelist sort columns to prevent SQL injection
$sortable = [
    'tx_id', 'created_at', 'member_id', 'order_id', 'tx_type',
    'direction', 'channel', 'status', 'amount_points', 'amount_cash'
];
if (!in_array($sortBy, $sortable, true)) {
    $sortBy = 'created_at';
}
$sortDir = ($sortDir === 'ASC') ? 'ASC' : 'DESC';

// Build WHERE clause
$where = [];
$params = [];

if ($memberId !== null && $memberId !== '') {
    $where[] = "tl.member_id = :member_id";
    $params[':member_id'] = $memberId;
}
if ($orderId !== null && $orderId !== '') {
    $where[] = "tl.order_id = :order_id";
    $params[':order_id'] = $orderId;
}
if ($txType !== null && $txType !== '') {
    $where[] = "tl.tx_type = :tx_type";
    $params[':tx_type'] = $txType;
}
if ($status !== null && $status !== '') {
    $where[] = "tl.status = :status";
    $params[':status'] = $status;
}
if ($direction !== null && $direction !== '') {
    $where[] = "tl.direction = :direction";
    $params[':direction'] = $direction;
}
if ($channel !== null && $channel !== '') {
    $where[] = "tl.channel = :channel";
    $params[':channel'] = $channel;
}
if ($startDate) {
    $where[] = "tl.created_at >= :start_date";
    $params[':start_date'] = $startDate;
}
if ($endDate) {
    $where[] = "tl.created_at < :end_date";
    $params[':end_date'] = $endDate;
}

$whereSql = $where ? ("WHERE " . implode(" AND ", $where)) : "";

// Count
$countSql = "SELECT COUNT(*) AS total
             FROM transactions_ledger tl
             $whereSql";

// Data
$dataSql = "
    SELECT
        tl.*,
        -- Aliases for UI convenience:
        tl.tx_id            AS id,
        tl.created_at       AS event_at,
        -- Ensure a usable timezone for display:
        COALESCE(NULLIF(tl.member_timezone, ''), 'America/New_York') AS member_timezone
    FROM transactions_ledger tl
    $whereSql
    ORDER BY $sortBy $sortDir
    LIMIT :limit OFFSET :offset
";

try {
    // total count
    $stmtCount = $conn->prepare($countSql);
    foreach ($params as $k => $v) {
        $stmtCount->bindValue($k, $v);
    }
    $stmtCount->execute();
    $total = (int)$stmtCount->fetchColumn();

    // rows
    $stmt = $conn->prepare($dataSql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->bindValue(':limit',  max(0, $limit),  PDO::PARAM_INT);
    $stmt->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Normalize numeric fields
    foreach ($rows as &$r) {
        if (isset($r['amount_points'])) {
            $r['amount_points'] = $r['amount_points'] !== null ? (float)$r['amount_points'] : null;
        }
        if (isset($r['amount_cash'])) {
            $r['amount_cash'] = $r['amount_cash'] !== null ? (float)$r['amount_cash'] : null;
        }
        // Ensure aliases are present
        if (!isset($r['id']) && isset($r['tx_id'])) {
            $r['id'] = $r['tx_id'];
        }
        if (!isset($r['event_at']) && isset($r['created_at'])) {
            $r['event_at'] = $r['created_at'];
        }
        if (!isset($r['member_timezone']) || $r['member_timezone'] === null || $r['member_timezone'] === '') {
            $r['member_timezone'] = 'America/New_York';
        }
    }
    unset($r);

    echo json_encode([
        "success" => true,
        "total"   => $total,
        "limit"   => $limit,
        "offset"  => $offset,
        "rows"    => $rows
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
