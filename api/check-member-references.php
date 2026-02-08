<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/check-member-references.php

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // ✅ contains $conn (PDO)

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);
$member_id = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;

if (!$member_id) {
    echo json_encode([
        'success' => false,
        'error' => 'Member ID is required'
    ]);
    exit();
}

try {
    // Initialize counts
    $counts = [
        'orders' => 0,
        'transactions' => 0,
        'portfolios' => 0,
        'social' => 0,
        'other' => 0
    ];
    
    // Check orders table
    $stmt = $conn->prepare("SELECT COUNT(*) as count FROM orders WHERE member_id = :member_id");
    $stmt->execute(['member_id' => $member_id]);
    $counts['orders'] = (int) $stmt->fetchColumn();
    
    // Check transactions_ledger table
    $stmt = $conn->prepare("SELECT COUNT(*) as count FROM transactions_ledger WHERE member_id = :member_id");
    $stmt->execute(['member_id' => $member_id]);
    $counts['transactions'] = (int) $stmt->fetchColumn();
    
    // Check portfolio holdings (if you have a separate portfolio table)
    // Adjust table name as needed
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) as count FROM portfolio_holdings WHERE member_id = :member_id");
        $stmt->execute(['member_id' => $member_id]);
        $counts['portfolios'] = (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table doesn't exist, skip
    }
    
    // Check social posts/comments (if you have social features)
    // Adjust table names as needed
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) as count FROM social_posts WHERE member_id = :member_id");
        $stmt->execute(['member_id' => $member_id]);
        $counts['social'] = (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table doesn't exist, skip
    }
    
    // Check for baskets
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) as count FROM baskets WHERE member_id = :member_id");
        $stmt->execute(['member_id' => $member_id]);
        $counts['other'] += (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table doesn't exist, skip
    }
    
    // Check broker_credentials
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) as count FROM broker_credentials WHERE member_id = :member_id");
        $stmt->execute(['member_id' => $member_id]);
        $counts['other'] += (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // Table doesn't exist, skip
    }
    
    // Determine if there are any references
    $totalReferences = array_sum($counts);
    $hasReferences = $totalReferences > 0;
    
    echo json_encode([
        'success' => true,
        'has_references' => $hasReferences,
        'reference_counts' => $counts,
        'total_references' => $totalReferences
    ]);
    
} catch (PDOException $e) {
    error_log("check-member-references error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
