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

// api/webhook-logs.php
// GET: Fetch webhook logs with filters and pagination

try {
    // Check if webhook_logs table exists
    $tableCheck = $conn->query("SHOW TABLES LIKE 'webhook_logs'");
    if ($tableCheck->rowCount() === 0) {
        echo json_encode([
            'success' => true,
            'logs' => [],
            'total' => 0,
            'page' => 1,
            'perPage' => 50,
            'warning' => 'webhook_logs table not found. Run webhook_logs_schema.sql to enable logging.'
        ], JSON_NUMERIC_CHECK);
        exit;
    }
    
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $perPage = isset($_GET['perPage']) ? min(100, max(10, (int)$_GET['perPage'])) : 50;
    $offset = ($page - 1) * $perPage;
    
    // Build filters
    $where = [];
    $params = [];
    
    if (!empty($_GET['eventType'])) {
        $where[] = "event_type = ?";
        $params[] = $_GET['eventType'];
    }
    
    if (!empty($_GET['sourceIp'])) {
        $where[] = "source_ip = ?";
        $params[] = $_GET['sourceIp'];
    }
    
    if (!empty($_GET['date'])) {
        $where[] = "DATE(received_at) = ?";
        $params[] = $_GET['date'];
    }
    
    if (isset($_GET['verified']) && $_GET['verified'] !== '') {
        $where[] = "signature_verified = ?";
        $params[] = (int)$_GET['verified'];
    }
    
    $where_clause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
    
    // Get total count
    $count_sql = "SELECT COUNT(*) FROM webhook_logs $where_clause";
    $stmt = $conn->prepare($count_sql);
    $stmt->execute($params);
    $total = (int)$stmt->fetchColumn();
    
    // Get logs
    $sql = "SELECT 
                id,
                request_id,
                event_type,
                signature_verified,
                source_ip,
                origin,
                received_at
            FROM webhook_logs
            $where_clause
            ORDER BY received_at DESC
            LIMIT ? OFFSET ?";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute(array_merge($params, [$perPage, $offset]));
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'logs' => $logs,
        'total' => $total,
        'page' => $page,
        'perPage' => $perPage
    ], JSON_NUMERIC_CHECK);
    
} catch (PDOException $e) {
    error_log("webhook-logs.php ERROR: " . $e->getMessage());
    echo json_encode([
        'success' => true,
        'logs' => [],
        'total' => 0,
        'page' => 1,
        'perPage' => 50,
        'error' => 'Database error: ' . $e->getMessage()
    ], JSON_NUMERIC_CHECK);
} catch (Exception $e) {
    error_log("webhook-logs.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error',
        'details' => $e->getMessage()
    ]);
}
