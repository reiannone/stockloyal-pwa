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

$inputRaw = file_get_contents("php://input");
$input    = json_decode($inputRaw, true);
if (!is_array($input)) {
    $input = [];
}

$strategyTag = trim($input['strategy_tag'] ?? '');
$offset      = (int)($input['offset'] ?? 0);
$limit       = (int)($input['limit'] ?? 20);
$limit       = max(1, min($limit, 50));

try {
    $params = [];
    $sql = "SELECT
                id,
                member_id,
                created_at,
                text,
                strategy_tag,
                points_used,
                cash_value,
                primary_ticker,
                tickers_json,
                like_count,
                comment_count
            FROM social_posts
            WHERE is_deleted = 0
              AND visibility = 'public'";

    if ($strategyTag !== '') {
        $sql .= " AND strategy_tag = :strategy_tag";
        $params[':strategy_tag'] = $strategyTag;
    }

    $sql .= " ORDER BY created_at DESC
              LIMIT :offset, :limit";

    $stmt = $conn->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $posts = [];

    foreach ($rows as $row) {
        $tickers = null;
        if (!empty($row['tickers_json'])) {
            $decoded = json_decode($row['tickers_json'], true);
            $tickers = is_array($decoded) ? $decoded : null;
        }

        $posts[] = [
            'id'            => (int)$row['id'],
            'member_handle' => $row['member_id'], // later you can mask or map to profile
            'created_at'    => $row['created_at'],
            'text'          => $row['text'],
            'strategy_tag'  => $row['strategy_tag'],
            'points_used'   => (int)$row['points_used'],
            'cash_value'    => (float)$row['cash_value'],
            'primary_ticker'=> $row['primary_ticker'],
            'tickers'       => $tickers,
            'like_count'    => (int)$row['like_count'],
            'comment_count' => (int)$row['comment_count'],
        ];
    }

    echo json_encode([
        'success' => true,
        'posts'   => $posts,
        'offset'  => $offset,
        'limit'   => $limit,
    ]);
} catch (Throwable $e) {
    error_log('social_feed error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to load feed']);
}
