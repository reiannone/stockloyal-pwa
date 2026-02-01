<?php
// api/get-admin-metrics.php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php'; // expects $conn

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$input = json_decode($raw ?: "{}", true) ?: [];

$days = isset($input['days']) ? (int)$input['days'] : 30;
if ($days < 1) $days = 30;
if ($days > 365) $days = 365;

$end = gmdate('Y-m-d');
$start = gmdate('Y-m-d', strtotime("-" . ($days - 1) . " days"));

try {
  // Use $conn from config.php
  
  // timeseries
  $stmt = $conn->prepare("
    SELECT day, orders_count, orders_cash_total, new_members_count,
           points_loaded_total, points_loaded_count, social_posts_count
    FROM analytics_daily
    WHERE day BETWEEN :start AND :end
    ORDER BY day ASC
  ");
  $stmt->execute([':start'=>$start, ':end'=>$end]);
  $daily = $stmt->fetchAll(PDO::FETCH_ASSOC);

  // broker breakdown for last N days (sum)
  $stmt = $conn->prepare("
    SELECT broker, SUM(orders_count) AS orders_count, SUM(orders_cash_total) AS orders_cash_total
    FROM analytics_daily_by_broker
    WHERE day BETWEEN :start AND :end
    GROUP BY broker
    ORDER BY orders_count DESC
    LIMIT 25
  ");
  $stmt->execute([':start'=>$start, ':end'=>$end]);
  $byBroker = $stmt->fetchAll(PDO::FETCH_ASSOC);

  // merchant breakdown (points + orders)
  $stmt = $conn->prepare("
    SELECT merchant_id,
           SUM(points_loaded_total) AS points_loaded_total,
           SUM(points_loaded_count) AS points_loaded_count,
           SUM(orders_count) AS orders_count,
           SUM(orders_cash_total) AS orders_cash_total
    FROM analytics_daily_by_merchant
    WHERE day BETWEEN :start AND :end
    GROUP BY merchant_id
    ORDER BY points_loaded_total DESC
    LIMIT 25
  ");
  $stmt->execute([':start'=>$start, ':end'=>$end]);
  $byMerchant = $stmt->fetchAll(PDO::FETCH_ASSOC);

  // quick summary totals
  $totals = [
    "orders_count" => 0,
    "orders_cash_total" => "0.00",
    "new_members_count" => 0,
    "points_loaded_total" => 0,
    "points_loaded_count" => 0,
    "social_posts_count" => 0,
  ];

  foreach ($daily as $d) {
    $totals["orders_count"] += (int)$d["orders_count"];
    $totals["orders_cash_total"] = (string) ( (float)$totals["orders_cash_total"] + (float)$d["orders_cash_total"] );
    $totals["new_members_count"] += (int)$d["new_members_count"];
    $totals["points_loaded_total"] += (int)$d["points_loaded_total"];
    $totals["points_loaded_count"] += (int)$d["points_loaded_count"];
    $totals["social_posts_count"] += (int)$d["social_posts_count"];
  }
  $totals["orders_cash_total"] = number_format((float)$totals["orders_cash_total"], 2, ".", "");

  echo json_encode([
    "success" => true,
    "range" => ["start"=>$start, "end"=>$end, "days"=>$days],
    "totals" => $totals,
    "daily" => $daily,
    "by_broker" => $byBroker,
    "by_merchant" => $byMerchant
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(["success"=>false, "error"=>$e->getMessage()]);
}
