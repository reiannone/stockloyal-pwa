<?php
// api/social_like_toggle.php
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

if ($postId <= 0 || $memberId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'post_id and member_id are required']);
    exit;
}

try {
    $conn->beginTransaction();

    // Does like already exist?
    $stmt = $conn->prepare("SELECT id FROM social_likes WHERE post_id = :post_id AND member_id = :member_id");
    $stmt->execute([
        ':post_id'   => $postId,
        ':member_id' => $memberId,
    ]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        // Unlike
        $stmt = $conn->prepare("DELETE FROM social_likes WHERE id = :id");
        $stmt->execute([':id' => $existing['id']]);

        $stmt = $conn->prepare("UPDATE social_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = :post_id");
        $stmt->execute([':post_id' => $postId]);

        $conn->commit();
        echo json_encode(['success' => true, 'liked' => false]);
        exit;
    } else {
        // Like
        $stmt = $conn->prepare(
            "INSERT INTO social_likes (post_id, member_id) VALUES (:post_id, :member_id)"
        );
        $stmt->execute([
            ':post_id'   => $postId,
            ':member_id' => $memberId,
        ]);

        $stmt = $conn->prepare("UPDATE social_posts SET like_count = like_count + 1 WHERE id = :post_id");
        $stmt->execute([':post_id' => $postId]);

        $conn->commit();
        echo json_encode(['success' => true, 'liked' => true]);
        exit;
    }
} catch (Throwable $e) {
    $conn->rollBack();
    error_log('social_like_toggle error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to toggle like']);
}
