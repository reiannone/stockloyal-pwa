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

// api/webhook-test.php
// POST: Send test webhook to configured receiver

try {
    $webhookUrl = getenv('WEBHOOK_URL') ?: 'https://app.stockloyal.com/webhooks/stockloyal-receiver.php';
    $apiKey = getenv('STOCKLOYAL_WEBHOOK_SECRET') ?: '';
    
    if (empty($webhookUrl) || empty($apiKey)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Webhook not configured. Set WEBHOOK_URL and STOCKLOYAL_WEBHOOK_SECRET environment variables.'
        ]);
        exit;
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
        ], JSON_NUMERIC_CHECK);
    } else {
        http_response_code($httpCode ?: 500);
        echo json_encode([
            'success' => false,
            'error' => "HTTP {$httpCode}: " . ($error ?: $response),
            'http_code' => $httpCode
        ]);
    }
    
} catch (Exception $e) {
    error_log("webhook-test.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error',
        'details' => $e->getMessage()
    ]);
}
