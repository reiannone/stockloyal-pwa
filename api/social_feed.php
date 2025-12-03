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

// 🔧 Inputs from frontend
$strategy        = $input['strategy_tag']      ?? null;        // optional, legacy
$filterType      = $input['filter_type']       ?? 'all';       // "all" | "liked" | "commented"
$currentMemberId = $input['member_id']         ?? null;        // current logged-in member
$authorMemberId  = $input['author_member_id']  ?? null;        // author filter (from ticker)
$offset          = (int)($input['offset']      ?? 0);
$limit           = (int)($input['limit']       ?? 20);

try {
    // Basic SELECT; DISTINCT to avoid duplicates when joining likes/comments
    $sql = "
        SELECT DISTINCT
            p.id,
            p.member_id,
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
    ";

    $params = [];

    // 🎯 Join for interaction filters
    if ($filterType === 'liked') {
        if (empty($currentMemberId)) {
            echo json_encode([
                'success' => false,
                'error'   => 'member_id is required for liked filter',
            ]);
            exit;
        }
        $sql .= "
            INNER JOIN social_likes l
                ON l.post_id = p.id
               AND l.member_id = :current_mid
        ";
        $params[':current_mid'] = $currentMemberId;
    } elseif ($filterType === 'commented') {
        if (empty($currentMemberId)) {
            echo json_encode([
                'success' => false,
                'error'   => 'member_id is required for commented filter',
            ]);
            exit;
        }
        $sql .= "
            INNER JOIN social_comments c
                ON c.post_id = p.id
               AND c.member_id = :current_mid
               AND c.is_deleted = 0
        ";
        $params[':current_mid'] = $currentMemberId;
    }

    // Base WHERE
    $sql .= " WHERE p.is_deleted = 0";

    // Optional legacy strategy filter
    if (!empty($strategy)) {
        $sql .= " AND p.strategy_tag = :strategy_tag";
        $params[':strategy_tag'] = $strategy;
    }

    // Optional AUTHOR filter (from ticker ?member_id=XYZ)
    if (!empty($authorMemberId)) {
        $sql .= " AND p.member_id = :author_mid";
        $params[':author_mid'] = $authorMemberId;
    }

    $sql .= "
        ORDER BY p.created_at DESC
        LIMIT :offset, :limit
    ";

    // Add offset and limit to params
    $params[':offset'] = $offset;
    $params[':limit']  = $limit;

    $stmt = $conn->prepare($sql);

    // Bind all parameters
    foreach ($params as $k => $v) {
        $type = is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR;
        $stmt->bindValue($k, $v, $type);
    }

    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as &$row) {
        // Convert numeric fields to proper types
        $row['id']            = (int)$row['id'];
        $row['points_used']   = (int)$row['points_used'];
        $row['cash_value']    = (float)$row['cash_value'];
        $row['like_count']    = (int)$row['like_count'];
        $row['comment_count'] = (int)$row['comment_count'];

        // Parse tickers JSON
        $row['tickers'] = $row['tickers_json']
            ? json_decode($row['tickers_json'], true)
            : [];

        // Add member_handle as member_id for frontend compatibility
        $row['member_handle'] = $row['member_id'];
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