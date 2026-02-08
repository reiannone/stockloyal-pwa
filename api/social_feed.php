<?php
// api/social_feed.php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$filterType      = $input['filter_type'] ?? 'all';   // all | liked | commented
$memberId        = strtolower(trim((string)($input['member_id'] ?? '')));  // current user (for liked/commented)
$authorMemberId  = trim($input['author_member_id'] ?? ''); // filter by post author
$limit           = max(1, min(100, (int)($input['limit'] ?? 20)));
$offset          = max(0, (int)($input['offset'] ?? 0));

try {

    $where = "p.is_deleted = 0 AND p.visibility = 'public'";
    $params = [];

    // Author filter (from ?member_id=XYZ)
    if ($authorMemberId !== '') {
        $where .= " AND p.member_id = :author_member_id";
        $params[':author_member_id'] = $authorMemberId;
    }

    // Filter: liked or commented by this user
    if (($filterType === 'liked' || $filterType === 'commented') && $memberId !== '') {
        if ($filterType === 'liked') {
            $where .= " AND EXISTS (
                SELECT 1 FROM social_likes l
                WHERE l.post_id = p.id AND l.member_id = :me
            )";
        } else {
            $where .= " AND EXISTS (
                SELECT 1 FROM social_comments c
                WHERE c.post_id = p.id AND c.member_id = :me
            )";
        }
        $params[':me'] = $memberId;
    }

    // 🔥 Always select member_avatar
    $sql = "
        SELECT
            p.id,
            p.member_id,
            p.member_avatar,
            p.created_at,
            p.text,
            p.strategy_tag,
            p.points_used,
            p.cash_value,
            p.primary_ticker,
            p.tickers_json,
            p.like_count,
            p.comment_count
        FROM social_posts p
        WHERE $where
        ORDER BY p.created_at DESC
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

    // ✅ Decode tickers_json → tickers[]
    foreach ($rows as &$row) {
        if (!empty($row['tickers_json'])) {
            $decoded = json_decode($row['tickers_json'], true);
            $row['tickers'] = (json_last_error() === JSON_ERROR_NONE && is_array($decoded))
                ? $decoded
                : [];
        } else {
            $row['tickers'] = [];
        }
        unset($row['tickers_json']);
    }

    echo json_encode([
        'success' => true,
        'posts'   => $rows,
    ]);

} catch (Throwable $e) {
    error_log("social_feed.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Unable to load feed',
    ]);
}
