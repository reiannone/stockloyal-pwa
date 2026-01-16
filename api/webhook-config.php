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

// api/webhook-config.php
// GET: Fetch webhook configuration
// POST: Update webhook configuration

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // Try to load from database first
        $sql = "SELECT * FROM webhook_config WHERE id = 1 LIMIT 1";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
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
        ], JSON_NUMERIC_CHECK);
        
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
            exit;
        }
        
        // Validate input
        if (empty($input['webhookUrl']) || !filter_var($input['webhookUrl'], FILTER_VALIDATE_URL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid webhook URL']);
            exit;
        }
        
        if (empty($input['apiKey']) || strlen($input['apiKey']) < 32) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'API key must be at least 32 characters']);
            exit;
        }
        
        // Save to database
        $sql = "INSERT INTO webhook_config (id, webhook_url, api_key, environment, require_signature, rate_limit, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    webhook_url = VALUES(webhook_url),
                    api_key = VALUES(api_key),
                    environment = VALUES(environment),
                    require_signature = VALUES(require_signature),
                    rate_limit = VALUES(rate_limit),
                    updated_at = NOW()";
        
        $stmt = $conn->prepare($sql);
        $stmt->execute([
            $input['webhookUrl'],
            $input['apiKey'],
            $input['environment'],
            $input['requireSignature'] ? 1 : 0,
            $input['rateLimit']
        ]);
        
        echo json_encode(['success' => true], JSON_NUMERIC_CHECK);
    }
    
} catch (PDOException $e) {
    // If table doesn't exist, return helpful message
    error_log("webhook-config.php ERROR: " . $e->getMessage());
    
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // Return defaults for GET if table missing
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
        ], JSON_NUMERIC_CHECK);
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database error',
            'details' => $e->getMessage()
        ]);
    }
} catch (Exception $e) {
    error_log("webhook-config.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error',
        'details' => $e->getMessage()
    ]);
}
