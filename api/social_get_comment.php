<?php
// api/social_get_comments.php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$postId = isset($_GET['post_id']) ? (int)$_GET['post_id'] : 0;
if ($postId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'post_id is required']);
    exit;
}

try {
    $sql = "SELECT id, member_id, text, created_at, parent_id
            FROM social_comments
            WHERE post_id = :post_id AND is_deleted = 0
            ORDER BY created_at ASC";
    $stmt = $conn->prepare($sql);
    $stmt->execute([':post_id' => $postId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $comments = [];
    foreach ($rows as $row) {
        $comments[] = [
            'id'         => (int)$row['id'],
            'member_id'  => $row['member_id'],
            'text'       => $row['text'],
            'created_at' => $row['created_at'],
            'parent_id'  => $row['parent_id'] ? (int)$row['parent_id'] : null,
        ];
    }

    echo json_encode([
        'success'  => true,
        'comments' => $comments,
    ]);
} catch (Throwable $e) {
    error_log('social_get_comments error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to load comments']);
}
