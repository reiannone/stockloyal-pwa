<?php
// api/save-social-post.php
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

// ── Required field ──────────────────────────────────────────────────────────
$postId = isset($input['id']) ? (int)$input['id'] : null;

if (!$postId) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => 'Post ID is required',
    ]);
    exit;
}

try {
    // ── Verify post exists ──────────────────────────────────────────────────
    $checkStmt = $conn->prepare("SELECT id FROM social_posts WHERE id = :id");
    $checkStmt->execute([':id' => $postId]);
    
    if (!$checkStmt->fetch()) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error'   => 'Post not found',
        ]);
        exit;
    }

    // ── Build update fields ─────────────────────────────────────────────────
    $updates = [];
    $params = [':id' => $postId];

    // member_id
    if (isset($input['member_id'])) {
        $updates[] = "member_id = :member_id";
        $params[':member_id'] = trim($input['member_id']);
    }

    // member_avatar
    if (array_key_exists('member_avatar', $input)) {
        $updates[] = "member_avatar = :member_avatar";
        $params[':member_avatar'] = $input['member_avatar'] ?: null;
    }

    // text
    if (array_key_exists('text', $input)) {
        $text = $input['text'] ?? '';
        // Enforce 500 char limit
        if (strlen($text) > 500) {
            $text = substr($text, 0, 500);
        }
        $updates[] = "text = :text";
        $params[':text'] = $text ?: null;
    }

    // strategy_tag
    if (array_key_exists('strategy_tag', $input)) {
        $updates[] = "strategy_tag = :strategy_tag";
        $params[':strategy_tag'] = $input['strategy_tag'] ?: null;
    }

    // primary_ticker
    if (array_key_exists('primary_ticker', $input)) {
        $ticker = $input['primary_ticker'] ? strtoupper(trim($input['primary_ticker'])) : null;
        $updates[] = "primary_ticker = :primary_ticker";
        $params[':primary_ticker'] = $ticker;
    }

    // tickers_json
    if (array_key_exists('tickers_json', $input)) {
        $tickersJson = null;
        if ($input['tickers_json'] !== null && $input['tickers_json'] !== '') {
            // Accept array or already-encoded string
            if (is_array($input['tickers_json'])) {
                $tickersJson = json_encode($input['tickers_json']);
            } else {
                // Validate it's valid JSON
                json_decode($input['tickers_json']);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $tickersJson = $input['tickers_json'];
                } else {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'error'   => 'Invalid JSON in tickers_json',
                    ]);
                    exit;
                }
            }
        }
        $updates[] = "tickers_json = :tickers_json";
        $params[':tickers_json'] = $tickersJson;
    }

    // points_used
    if (isset($input['points_used'])) {
        $updates[] = "points_used = :points_used";
        $params[':points_used'] = max(0, (int)$input['points_used']);
    }

    // cash_value
    if (isset($input['cash_value'])) {
        $updates[] = "cash_value = :cash_value";
        $params[':cash_value'] = number_format((float)$input['cash_value'], 2, '.', '');
    }

    // like_count
    if (isset($input['like_count'])) {
        $updates[] = "like_count = :like_count";
        $params[':like_count'] = max(0, (int)$input['like_count']);
    }

    // comment_count
    if (isset($input['comment_count'])) {
        $updates[] = "comment_count = :comment_count";
        $params[':comment_count'] = max(0, (int)$input['comment_count']);
    }

    // visibility
    if (isset($input['visibility'])) {
        $visibility = $input['visibility'];
        if (!in_array($visibility, ['public', 'private'], true)) {
            $visibility = 'public';
        }
        $updates[] = "visibility = :visibility";
        $params[':visibility'] = $visibility;
    }

    // is_deleted
    if (isset($input['is_deleted'])) {
        $updates[] = "is_deleted = :is_deleted";
        $params[':is_deleted'] = (int)$input['is_deleted'] ? 1 : 0;
    }

    // ── Execute update ──────────────────────────────────────────────────────
    if (count($updates) === 0) {
        echo json_encode([
            'success' => true,
            'message' => 'No fields to update',
        ]);
        exit;
    }

    // updated_at is auto-updated by MySQL ON UPDATE CURRENT_TIMESTAMP
    $sql = "UPDATE social_posts SET " . implode(', ', $updates) . " WHERE id = :id";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    // ── Fetch updated record ────────────────────────────────────────────────
    $fetchStmt = $conn->prepare("
        SELECT 
            id, member_id, member_avatar, created_at, updated_at,
            text, strategy_tag, points_used, cash_value, primary_ticker,
            tickers_json, like_count, comment_count, visibility, is_deleted
        FROM social_posts 
        WHERE id = :id
    ");
    $fetchStmt->execute([':id' => $postId]);
    $updatedPost = $fetchStmt->fetch(PDO::FETCH_ASSOC);

    if ($updatedPost) {
        // Cast types
        $updatedPost['id'] = (int)$updatedPost['id'];
        $updatedPost['points_used'] = (int)$updatedPost['points_used'];
        $updatedPost['like_count'] = (int)$updatedPost['like_count'];
        $updatedPost['comment_count'] = (int)$updatedPost['comment_count'];
        $updatedPost['is_deleted'] = (int)$updatedPost['is_deleted'];
        $updatedPost['cash_value'] = (float)$updatedPost['cash_value'];
    }

    echo json_encode([
        'success' => true,
        'message' => 'Post updated successfully',
        'post'    => $updatedPost,
    ]);

} catch (Throwable $e) {
    error_log("save-social-post.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Unable to save post: ' . $e->getMessage(),
    ]);
}
