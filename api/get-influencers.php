<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// api/get-influencers.php

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // ✅ contains $conn (PDO)

try {
    // Get top 10 users by post count
    $stmt = $conn->query("
        SELECT 
            member_id,
            COUNT(*) as post_count
        FROM social_posts
        WHERE member_id IS NOT NULL
        GROUP BY member_id
        ORDER BY post_count DESC
        LIMIT 10
    ");
    $mostPosts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get top 10 users by total likes received
    $stmt = $conn->query("
        SELECT 
            p.member_id,
            SUM(p.like_count) as total_likes
        FROM social_posts p
        WHERE p.member_id IS NOT NULL
        GROUP BY p.member_id
        HAVING total_likes > 0
        ORDER BY total_likes DESC
        LIMIT 10
    ");
    $mostLikes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'influencers' => [
            'most_posts' => $mostPosts,
            'most_likes' => $mostLikes
        ]
    ]);
    
} catch (PDOException $e) {
    error_log("get-influencers error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
