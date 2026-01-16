<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// api/webhook-stats.php
// GET: Fetch webhook statistics (24h)

try {
    // Check if webhook_logs table exists
    $tableCheck = $conn->query("SHOW TABLES LIKE 'webhook_logs'");
    if ($tableCheck->rowCount() === 0) {
        echo json_encode([
            'success' => true,
            'stats' => [
                'total24h' => 0,
                'uniqueEvents' => 0,
                'uniqueIps' => 0,
                'verified' => 0,
                'eventBreakdown' => [],
                'recentErrors' => []
            ],
            'warning' => 'webhook_logs table not found. Run webhook_logs_schema.sql to enable logging.'
        ], JSON_NUMERIC_CHECK);
        exit;
    }
    
    // Get 24h statistics
    $stats_sql = "SELECT 
                    COUNT(*) as total_24h,
                    COUNT(DISTINCT event_type) as unique_events,
                    COUNT(DISTINCT source_ip) as unique_ips,
                    SUM(signature_verified) as verified
                  FROM webhook_logs
                  WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)";
    
    $stmt = $conn->prepare($stats_sql);
    $stmt->execute();
    $stats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Get event breakdown
    $events_sql = "SELECT 
                        event_type,
                        COUNT(*) as count,
                        SUM(signature_verified) as verified
                   FROM webhook_logs
                   WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                   GROUP BY event_type
                   ORDER BY count DESC
                   LIMIT 10";
    
    $stmt = $conn->prepare($events_sql);
    $stmt->execute();
    $eventBreakdown = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get recent errors
    $errors_sql = "SELECT 
                        request_id,
                        event_type,
                        source_ip,
                        received_at
                   FROM webhook_logs
                   WHERE signature_verified = 0
                       AND received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                   ORDER BY received_at DESC
                   LIMIT 10";
    
    $stmt = $conn->prepare($errors_sql);
    $stmt->execute();
    $recentErrors = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'stats' => [
            'total24h' => (int)$stats['total_24h'],
            'uniqueEvents' => (int)$stats['unique_events'],
            'uniqueIps' => (int)$stats['unique_ips'],
            'verified' => (int)$stats['verified'],
            'eventBreakdown' => $eventBreakdown,
            'recentErrors' => $recentErrors
        ]
    ], JSON_NUMERIC_CHECK);
    
} catch (PDOException $e) {
    error_log("webhook-stats.php ERROR: " . $e->getMessage());
    // Return empty stats instead of failing
    echo json_encode([
        'success' => true,
        'stats' => [
            'total24h' => 0,
            'uniqueEvents' => 0,
            'uniqueIps' => 0,
            'verified' => 0,
            'eventBreakdown' => [],
            'recentErrors' => []
        ],
        'error' => 'Database error: ' . $e->getMessage()
    ], JSON_NUMERIC_CHECK);
} catch (Exception $e) {
    error_log("webhook-stats.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error',
        'details' => $e->getMessage()
    ]);
}
