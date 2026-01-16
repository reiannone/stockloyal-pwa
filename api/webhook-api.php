<?php
declare(strict_types=1);

/**
 * webhook-api.php
 * 
 * API endpoints for React WebhookAdmin component
 * Handles configuration management, statistics, and log retrieval
 * 
 * Routes:
 * GET  /api/webhook/config - Get current configuration
 * POST /api/webhook/config - Update configuration
 * GET  /api/webhook/stats  - Get statistics
 * GET  /api/webhook/logs   - Get webhook logs with filters
 * POST /api/webhook/test   - Send test webhook
 */

// ============================================================================
// CORS Configuration - MUST BE FIRST
// ============================================================================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://localhost:5173',      // Vite dev server
    'http://localhost:3000',      // Alternative dev port
    'https://app.stockloyal.com', // Production
    'https://stockloyal.com'      // Production (alternative)
];

if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 86400'); // Cache preflight for 24 hours
}

// Handle OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../_loadenv.php';

header('Content-Type: application/json');

// ============================================================================
// Authentication Check
// ============================================================================
// IMPORTANT: Uncomment this block for production
// session_start();
// if (!isset($_SESSION['memberId']) || $_SESSION['memberId'] !== 'admin') {
//     http_response_code(403);
//     echo json_encode(['success' => false, 'error' => 'Unauthorized']);
//     exit;
// }

// Get request method and path
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Log for debugging (remove in production)
error_log("Webhook API: {$method} {$path}");

// ============================================================================
// Route Handler with Multiple Pattern Support
// ============================================================================
try {
    // Support both /api/webhook/* and /webhook/* patterns
    $isWebhookConfig = (
        str_ends_with($path, '/webhook/config') || 
        str_contains($path, '/webhook/config')
    );
    $isWebhookStats = (
        str_ends_with($path, '/webhook/stats') || 
        str_contains($path, '/webhook/stats')
    );
    $isWebhookLogs = (
        str_ends_with($path, '/webhook/logs') || 
        str_contains($path, '/webhook/logs')
    );
    $isWebhookTest = (
        str_ends_with($path, '/webhook/test') || 
        str_contains($path, '/webhook/test')
    );
    
    if ($method === 'GET' && $isWebhookConfig) {
        handleGetConfig($pdo);
    } elseif ($method === 'POST' && $isWebhookConfig) {
        handleUpdateConfig($pdo);
    } elseif ($method === 'GET' && $isWebhookStats) {
        handleGetStats($pdo);
    } elseif ($method === 'GET' && $isWebhookLogs) {
        handleGetLogs($pdo);
    } elseif ($method === 'POST' && $isWebhookTest) {
        handleTestWebhook();
    } else {
        http_response_code(404);
        echo json_encode([
            'success' => false, 
            'error' => 'Endpoint not found',
            'path' => $path,
            'method' => $method,
            'debug' => 'Available: /api/webhook/config, /api/webhook/stats, /api/webhook/logs, /api/webhook/test'
        ]);
    }
} catch (Exception $e) {
    error_log("Webhook API Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

// ============================================================================
// Handler Functions
// ============================================================================

function handleGetConfig(PDO $pdo): void {
    try {
        // Try to load from database first
        $stmt = $pdo->query("SELECT * FROM webhook_config WHERE id = 1 LIMIT 1");
        $dbConfig = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($dbConfig) {
            // Use database config
            $config = [
                'webhookUrl' => $dbConfig['webhook_url'],
                'apiKey' => $dbConfig['api_key'],
                'environment' => $dbConfig['environment'],
                'requireSignature' => (bool)$dbConfig['require_signature'],
                'rateLimit' => (int)$dbConfig['rate_limit'],
            ];
        } else {
            // Fallback to environment variables
            $config = [
                'webhookUrl' => getenv('WEBHOOK_URL') ?: 'https://app.stockloyal.com/webhooks/stockloyal-receiver.php',
                'apiKey' => getenv('STOCKLOYAL_WEBHOOK_SECRET') ?: '',
                'environment' => getenv('ENVIRONMENT') ?: 'development',
                'requireSignature' => (getenv('ENVIRONMENT') ?: 'production') === 'production',
                'rateLimit' => (int)(getenv('WEBHOOK_RATE_LIMIT') ?: 60),
            ];
        }
        
        echo json_encode([
            'success' => true,
            'config' => $config
        ]);
    } catch (PDOException $e) {
        // If table doesn't exist, return defaults
        error_log("Webhook config table error: " . $e->getMessage());
        
        $config = [
            'webhookUrl' => 'https://app.stockloyal.com/webhooks/stockloyal-receiver.php',
            'apiKey' => '',
            'environment' => 'development',
            'requireSignature' => false,
            'rateLimit' => 60,
        ];
        
        echo json_encode([
            'success' => true,
            'config' => $config,
            'warning' => 'Using default configuration. Run webhook_config_schema.sql to enable database storage.'
        ]);
    }
}

function handleUpdateConfig(PDO $pdo): void {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
        return;
    }
    
    // Validate input
    if (empty($input['webhookUrl']) || !filter_var($input['webhookUrl'], FILTER_VALIDATE_URL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid webhook URL']);
        return;
    }
    
    if (empty($input['apiKey']) || strlen($input['apiKey']) < 32) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'API key must be at least 32 characters']);
        return;
    }
    
    // Save to database (recommended for production)
    try {
        $stmt = $pdo->prepare("
            INSERT INTO webhook_config (id, webhook_url, api_key, environment, require_signature, rate_limit, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                webhook_url = VALUES(webhook_url),
                api_key = VALUES(api_key),
                environment = VALUES(environment),
                require_signature = VALUES(require_signature),
                rate_limit = VALUES(rate_limit),
                updated_at = NOW()
        ");
        
        $stmt->execute([
            $input['webhookUrl'],
            $input['apiKey'],
            $input['environment'],
            $input['requireSignature'] ? 1 : 0,
            $input['rateLimit']
        ]);
        
        // Also update .env file (optional)
        updateEnvFile([
            'WEBHOOK_URL' => $input['webhookUrl'],
            'STOCKLOYAL_WEBHOOK_SECRET' => $input['apiKey'],
            'ENVIRONMENT' => $input['environment'],
            'WEBHOOK_RATE_LIMIT' => $input['rateLimit']
        ]);
        
        echo json_encode(['success' => true]);
        
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

function handleGetStats(PDO $pdo): void {
    try {
        // Check if webhook_logs table exists
        $tableCheck = $pdo->query("SHOW TABLES LIKE 'webhook_logs'");
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
            ]);
            return;
        }
        
        // Get 24h statistics
        $stats_sql = "
            SELECT 
                COUNT(*) as total_24h,
                COUNT(DISTINCT event_type) as unique_events,
                COUNT(DISTINCT source_ip) as unique_ips,
                SUM(signature_verified) as verified
            FROM webhook_logs
            WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ";
        
        $stats = $pdo->query($stats_sql)->fetch();
        
        // Get event breakdown
        $events_sql = "
            SELECT 
                event_type,
                COUNT(*) as count,
                SUM(signature_verified) as verified
            FROM webhook_logs
            WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY event_type
            ORDER BY count DESC
            LIMIT 10
        ";
        
        $eventBreakdown = $pdo->query($events_sql)->fetchAll();
        
        // Get recent errors
        $errors_sql = "
            SELECT 
                request_id,
                event_type,
                source_ip,
                received_at
            FROM webhook_logs
            WHERE signature_verified = 0
                AND received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY received_at DESC
            LIMIT 10
        ";
        
        $recentErrors = $pdo->query($errors_sql)->fetchAll();
        
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
        ]);
    } catch (PDOException $e) {
        error_log("Webhook stats error: " . $e->getMessage());
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
        ]);
    }
}

function handleGetLogs(PDO $pdo): void {
    try {
        // Check if webhook_logs table exists
        $tableCheck = $pdo->query("SHOW TABLES LIKE 'webhook_logs'");
        if ($tableCheck->rowCount() === 0) {
            echo json_encode([
                'success' => true,
                'logs' => [],
                'total' => 0,
                'page' => 1,
                'perPage' => 50,
                'warning' => 'webhook_logs table not found. Run webhook_logs_schema.sql to enable logging.'
            ]);
            return;
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
        $stmt = $pdo->prepare($count_sql);
        $stmt->execute($params);
        $total = (int)$stmt->fetchColumn();
        
        // Get logs
        $sql = "
            SELECT 
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
            LIMIT ? OFFSET ?
        ";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($params, [$perPage, $offset]));
        $logs = $stmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'logs' => $logs,
            'total' => $total,
            'page' => $page,
            'perPage' => $perPage
        ]);
    } catch (PDOException $e) {
        error_log("Webhook logs error: " . $e->getMessage());
        echo json_encode([
            'success' => true,
            'logs' => [],
            'total' => 0,
            'page' => 1,
            'perPage' => 50,
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    }
}

function handleTestWebhook(): void {
    $webhookUrl = getenv('WEBHOOK_URL') ?: 'https://app.stockloyal.com/webhooks/stockloyal-receiver.php';
    $apiKey = getenv('STOCKLOYAL_WEBHOOK_SECRET') ?: '';
    
    if (empty($webhookUrl) || empty($apiKey)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Webhook not configured']);
        return;
    }
    
    // Build test payload
    $requestId = 'test_' . bin2hex(random_bytes(8));
    $payload = [
        'event_type' => 'test.connection',
        'request_id' => $requestId,
        'timestamp' => gmdate('c'),
        'test' => true,
        'source' => 'webhook_admin'
    ];
    
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
    $signature = hash_hmac('sha256', $json, $apiKey);
    
    // Send webhook
    $ch = curl_init($webhookUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            "X-API-Key: {$apiKey}",
            "X-Request-Id: {$requestId}",
            "X-Event-Type: test.connection",
            "X-Signature: sha256={$signature}",
        ],
        CURLOPT_POSTFIELDS => $json,
        CURLOPT_TIMEOUT => 10,
    ]);
    
    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($httpCode === 200) {
        echo json_encode([
            'success' => true,
            'request_id' => $requestId,
            'response' => json_decode($response, true)
        ]);
    } else {
        http_response_code($httpCode);
        echo json_encode([
            'success' => false,
            'error' => "HTTP {$httpCode}: " . ($error ?: $response),
            'http_code' => $httpCode
        ]);
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

function updateEnvFile(array $updates): void {
    $envFile = __DIR__ . '/../.env';
    
    if (!file_exists($envFile)) {
        // Create new .env file
        $content = '';
        foreach ($updates as $key => $value) {
            $content .= "{$key}={$value}\n";
        }
        file_put_contents($envFile, $content);
        return;
    }
    
    // Update existing .env file
    $content = file_get_contents($envFile);
    $lines = explode("\n", $content);
    $updated = [];
    
    foreach ($lines as $line) {
        $found = false;
        foreach ($updates as $key => $value) {
            if (strpos($line, $key . '=') === 0) {
                $updated[] = "{$key}={$value}";
                $found = true;
                unset($updates[$key]);
                break;
            }
        }
        if (!$found && trim($line) !== '') {
            $updated[] = $line;
        }
    }
    
    // Add any remaining new keys
    foreach ($updates as $key => $value) {
        $updated[] = "{$key}={$value}";
    }
    
    file_put_contents($envFile, implode("\n", $updated) . "\n");
}
