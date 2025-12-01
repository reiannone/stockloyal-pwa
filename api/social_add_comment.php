<?php
// api/social_add_comment.php
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
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

$postId   = (int)($input['post_id'] ?? 0);
$memberId = trim($input['member_id'] ?? '');
$text     = trim($input['text'] ?? '');
$parentId = isset($input['parent_id']) ? (int)$input['parent_id'] : null;

if ($postId <= 0 || $memberId === '' || $text === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'post_id, member_id and text are required']);
    exit;
}

try {
    $conn->beginTransaction();

    $stmt = $conn->prepare(
        "INSERT INTO social_comments (post_id, member_id, text, parent_id)
         VALUES (:post_id, :member_id, :text, :parent_id)"
    );
    $stmt->execute([
        ':post_id'   => $postId,
        ':member_id' => $memberId,
        ':text'      => $text,
        ':parent_id' => $parentId ?: null,
    ]);

    $stmt = $conn->prepare("UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = :post_id");
    $stmt->execute([':post_id' => $postId]);

    $conn->commit();

    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    $conn->rollBack();
    error_log('social_add_comment error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to add comment']);
}
