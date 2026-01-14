<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header("Access-Control-Allow-Methods: POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type");
  exit;
}

require_once 'config.php';

// ✅ Expect JSON
$input = json_decode(file_get_contents("php://input"), true) ?? [];
$limit = isset($input['limit']) ? (int)$input['limit'] : 50;
$limit = max(1, min($limit, 200));

try {
  // NOTE:
  // - "Most purchased" interpreted as: most orders placed per symbol.
  // - If you prefer "most purchased by shares", change COUNT(*) -> SUM(COALESCE(shares,0)).
  // - If you want only completed orders, uncomment status filter.
  $sql = "
    SELECT
      UPPER(TRIM(o.symbol)) AS symbol,
      COUNT(*) AS purchases
    FROM orders o
    WHERE o.symbol IS NOT NULL
      AND TRIM(o.symbol) <> ''
      -- AND o.status IN ('filled','executed','confirmed')
    GROUP BY UPPER(TRIM(o.symbol))
    ORDER BY purchases DESC
    LIMIT :lim
  ";

  $stmt = $conn->prepare($sql);
  $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
  $stmt->execute();

  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  echo json_encode([
    "success" => true,
    "limit"   => $limit,
    "rows"    => $rows
  ]);
} catch (Throwable $e) {
  error_log("popular-member-picks.php error: " . $e->getMessage());
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error"   => "Server error: " . $e->getMessage()
  ]);
}
