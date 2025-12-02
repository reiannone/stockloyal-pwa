<?php
// api/social_get_post.php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');

require_once 'config.php'; // $conn = PDO

try {
    $postId = 0;

    // Allow both GET ?post_id= and JSON POST { "post_id": ... }
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

    // 🔎 Adjust table/columns if your schema uses different names.
    $sql = "
        SELECT
            id,
            member_id,
            member_handle,
            points_used,
            cash_value,
            primary_ticker,
            strategy_tag,
            text,
            tickers,
            created_at
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

    // If tickers are stored as JSON string, decode them
    if (isset($row['tickers']) && is_string($row['tickers'])) {
        $decoded = json_decode($row['tickers'], true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            $row['tickers'] = $decoded;
        } else {
            $row['tickers'] = [];
        }
    } elseif (!isset($row['tickers'])) {
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
