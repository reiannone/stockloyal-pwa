<?php
// api/get-social-posts.php
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

// ── Filter parameters ───────────────────────────────────────────────────────
$postId        = isset($input['post_id']) ? (int)$input['post_id'] : null;
$postIds       = $input['post_ids'] ?? null; // Array of IDs (for Data Quality)
$memberId      = strtolower(trim((string)($input['member_id'] ?? '')));
$strategyTag   = trim($input['strategy_tag'] ?? '');
$primaryTicker = trim($input['primary_ticker'] ?? '');
$visibility    = trim($input['visibility'] ?? '');
$isDeleted     = isset($input['is_deleted']) ? (int)$input['is_deleted'] : null;

$dateStart     = trim($input['date_start'] ?? '');
$dateEnd       = trim($input['date_end'] ?? '');

$sortBy        = $input['sort_by'] ?? 'created_at';
$sortDir       = strtoupper($input['sort_dir'] ?? 'DESC');
 $limit         = max(1, min(200, (int)($input['limit'] ?? 50)));
$offset        = max(0, (int)($input['offset'] ?? 0));
$detail        = !empty($input['detail']); // when true, include large fields (avatar, full text, tickers_json)

// Validate sort parameters
$allowedSortFields = ['id', 'member_id', 'created_at', 'updated_at', 'like_count', 'comment_count', 'points_used', 'cash_value'];
if (!in_array($sortBy, $allowedSortFields, true)) {
    $sortBy = 'created_at';
}
$sortDir = ($sortDir === 'ASC') ? 'ASC' : 'DESC';

try {
    $where = [];
    $params = [];

    // ── Specific post ID ────────────────────────────────────────────────────
    if ($postId !== null) {
        $where[] = "p.id = :post_id";
        $params[':post_id'] = $postId;
    }

    // ── Multiple post IDs (Data Quality mode) ───────────────────────────────
    if (is_array($postIds) && count($postIds) > 0) {
        $placeholders = [];
        foreach ($postIds as $i => $id) {
            $key = ":pid_$i";
            $placeholders[] = $key;
            $params[$key] = (int)$id;
        }
        $where[] = "p.id IN (" . implode(', ', $placeholders) . ")";
    }

    // ── Member ID ───────────────────────────────────────────────────────────
    if ($memberId !== '') {
        $where[] = "p.member_id = :member_id";
        $params[':member_id'] = $memberId;
    }

    // ── Strategy Tag ────────────────────────────────────────────────────────
    if ($strategyTag !== '') {
        $where[] = "p.strategy_tag = :strategy_tag";
        $params[':strategy_tag'] = $strategyTag;
    }

    // ── Primary Ticker ──────────────────────────────────────────────────────
    if ($primaryTicker !== '') {
        $where[] = "p.primary_ticker = :primary_ticker";
        $params[':primary_ticker'] = strtoupper($primaryTicker);
    }

    // ── Visibility ──────────────────────────────────────────────────────────
    if ($visibility !== '' && in_array($visibility, ['public', 'private'], true)) {
        $where[] = "p.visibility = :visibility";
        $params[':visibility'] = $visibility;
    }

    // ── Is Deleted ──────────────────────────────────────────────────────────
    if ($isDeleted !== null) {
        $where[] = "p.is_deleted = :is_deleted";
        $params[':is_deleted'] = $isDeleted;
    }

    // ── Date Range ──────────────────────────────────────────────────────────
    if ($dateStart !== '') {
        $where[] = "p.created_at >= :date_start";
        $params[':date_start'] = $dateStart;
    }
    if ($dateEnd !== '') {
        $where[] = "p.created_at < :date_end";
        $params[':date_end'] = $dateEnd;
    }

    // ── Build WHERE clause ──────────────────────────────────────────────────
    $whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

    // ── Query ───────────────────────────────────────────────────────────────
    // Default list mode is "thin" to avoid huge memory usage (avatars / long text / tickers_json).
    // Pass {"detail":true} or a specific post_id to fetch full fields.
    $isDetail = $detail || ($postId !== null);
    $selectFields = $isDetail ? "
            p.id,
            p.member_id,
            p.member_avatar,
            p.created_at,
            p.updated_at,
            p.text,
            p.strategy_tag,
            p.points_used,
            p.cash_value,
            p.primary_ticker,
            p.tickers_json,
            p.like_count,
            p.comment_count,
            p.visibility,
            p.is_deleted
        " : "
            p.id,
            p.member_id,
            p.created_at,
            p.updated_at,
            LEFT(p.text, 280) AS text,
            p.strategy_tag,
            p.points_used,
            p.cash_value,
            p.primary_ticker,
            p.like_count,
            p.comment_count,
            p.visibility,
            p.is_deleted
        ";

    $sql = "
        SELECT
        $selectFields
        FROM social_posts p
        $whereClause
        ORDER BY p.$sortBy $sortDir
        LIMIT :limit OFFSET :offset
    ";

    $stmt = $conn->prepare($sql);

    foreach ($params as $k => $v) {
        if (is_int($v)) {
            $stmt->bindValue($k, $v, PDO::PARAM_INT);
        } else {
            $stmt->bindValue($k, $v, PDO::PARAM_STR);
        }
    }

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);

    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── Decode tickers_json ─────────────────────────────────────────────────
    foreach ($rows as &$row) {
        // Keep tickers_json as-is for admin editing
        // Also provide decoded tickers array for convenience
        if (isset($row['tickers_json']) && $row['tickers_json'] !== '' && $isDetail) {
            $decoded = json_decode($row['tickers_json'], true);
            $row['tickers'] = (json_last_error() === JSON_ERROR_NONE && is_array($decoded))
                ? $decoded
                : [];
        } else {
            $row['tickers'] = [];
        }

        // Cast numeric fields
        $row['id'] = (int)$row['id'];
        $row['points_used'] = (int)$row['points_used'];
        $row['like_count'] = (int)$row['like_count'];
        $row['comment_count'] = (int)$row['comment_count'];
        $row['is_deleted'] = (int)$row['is_deleted'];
        $row['cash_value'] = (float)$row['cash_value'];
    }

    // ── Get total count (for pagination info) ───────────────────────────────
    $countSql = "SELECT COUNT(*) as total FROM social_posts p $whereClause";
    $countStmt = $conn->prepare($countSql);
    foreach ($params as $k => $v) {
        if (is_int($v)) {
            $countStmt->bindValue($k, $v, PDO::PARAM_INT);
        } else {
            $countStmt->bindValue($k, $v, PDO::PARAM_STR);
        }
    }
    $countStmt->execute();
    $totalCount = (int)$countStmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'posts'   => $rows,
        'total'   => $totalCount,
        'limit'   => $limit,
        'offset'  => $offset,
        'is_detail' => $isDetail,
        'next_offset' => ($offset + $limit < $totalCount) ? ($offset + $limit) : null,
        'prev_offset' => ($offset - $limit >= 0) ? max(0, $offset - $limit) : null,
    ]);

} catch (Throwable $e) {
    error_log("get-social-posts.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Unable to load posts: ' . $e->getMessage(),
    ]);
}
