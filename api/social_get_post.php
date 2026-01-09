<?php
// api/social_get_post.php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    // Accept GET ?post_id=... and JSON POST { "post_id": ... }
    $postId = 0;

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (isset($_GET['post_id'])) {
            $postId = (int) $_GET['post_id'];
        }
    } else {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        if (isset($input['post_id'])) {
            $postId = (int) $input['post_id'];
        }
    }

    if ($postId <= 0) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error'   => 'post_id is required',
        ]);
        exit;
    }

    // Select row
    $sql = "
        SELECT *
        FROM social_posts
        WHERE id = :id
        LIMIT 1
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute([':id' => $postId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error'   => 'Post not found',
        ]);
        exit;
    }

    // ✅ Decode tickers_json -> tickers[]
    if (isset($row['tickers_json']) && is_string($row['tickers_json']) && $row['tickers_json'] !== '') {
        $decoded = json_decode($row['tickers_json'], true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            $row['tickers'] = $decoded;
        } else {
            $row['tickers'] = [];
        }
    } else {
        $row['tickers'] = [];
    }

    echo json_encode([
        'success' => true,
        'post'    => $row,
    ]);
} catch (Throwable $e) {
    error_log('social_get_post.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Internal server error',
    ]);
}
