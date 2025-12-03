<?php
// api/social_feed.php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);

$strategy   = $input['strategy_tag'] ?? null;
$filterMid  = $input['member_id'] ?? null;
$offset     = (int)($input['offset'] ?? 0);
$limit      = (int)($input['limit'] ?? 20);

try {
    $sql = "
        SELECT
            p.id,
            p.member_id,
            m.member_handle,
            p.points_used,
            p.cash_value,
            p.primary_ticker,
            p.strategy_tag,
            p.text,
            p.tickers_json,
            p.like_count,
            p.comment_count,
            p.created_at
        FROM social_posts p
        LEFT JOIN members m ON m.member_id = p.member_id
        WHERE p.is_deleted = 0
    ";

    $params = [];

    // Optional strategy filter
    if ($strategy) {
        $sql .= " AND p.strategy_tag = :strategy_tag";
        $params[':strategy_tag'] = $strategy;
    }

    // Optional member filter
    if (!empty($filterMid)) {
        $sql .= " AND p.member_id = :filter_mid";
        $params[':filter_mid'] = $filterMid;
    }

    $sql .= "
        ORDER BY p.created_at DESC
        LIMIT :offset, :limit
    ";

    // Add offset and limit to params
    $params[':offset'] = $offset;
    $params[':limit'] = $limit;

    $stmt = $conn->prepare($sql);

    // Bind all parameters in one loop
    foreach ($params as $k => $v) {
        $type = is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR;
        $stmt->bindValue($k, $v, $type);
    }

    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as &$row) {
        $row['tickers'] = $row['tickers_json']
            ? json_decode($row['tickers_json'], true)
            : [];
    }

    echo json_encode([
        'success' => true,
        'posts'   => $rows,
    ]);
} catch (Throwable $e) {
    error_log("social_feed.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Unable to load feed',
    ]);
}