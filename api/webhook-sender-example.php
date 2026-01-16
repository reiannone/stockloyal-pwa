<?php
declare(strict_types=1);

/**
 * webhook-sender-example.php
 * 
 * Example of how to send webhooks to the StockLoyal webhook receiver
 * Demonstrates proper authentication, signature generation, and error handling
 */

class WebhookSender {
    private string $webhookUrl;
    private string $apiKey;
    private int $timeout;
    
    public function __construct(string $webhookUrl, string $apiKey, int $timeout = 10) {
        $this->webhookUrl = $webhookUrl;
        $this->apiKey = $apiKey;
        $this->timeout = $timeout;
    }
    
    /**
     * Send a webhook with full signing and ACK support
     */
    public function send(
        string $eventType,
        array $data,
        ?string $requestId = null,
        ?string $ackUrl = null
    ): array {
        // Generate request ID if not provided
        if ($requestId === null) {
            $requestId = 'req_' . bin2hex(random_bytes(16));
        }
        
        // Build payload
        $payload = array_merge($data, [
            'event_type' => $eventType,
            'request_id' => $requestId,
            'timestamp' => gmdate('c'),
        ]);
        
        // Add ACK URL if provided
        if ($ackUrl !== null) {
            $payload['ack_url'] = $ackUrl;
        }
        
        // Encode payload
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        
        // Generate HMAC signature
        $signature = hash_hmac('sha256', $json, $this->apiKey);
        
        // Prepare headers
        $headers = [
            'Content-Type: application/json',
            "X-API-Key: {$this->apiKey}",
            "X-Request-Id: {$requestId}",
            "X-Event-Type: {$eventType}",
            "X-Signature: sha256={$signature}",
        ];
        
        // Send request
        $ch = curl_init($this->webhookUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        // Parse response
        $responseData = is_string($response) ? json_decode($response, true) : null;
        
        return [
            'success' => $httpCode === 200,
            'http_code' => $httpCode,
            'request_id' => $requestId,
            'response' => $responseData,
            'curl_error' => $curlError ?: null,
        ];
    }
    
    /**
     * Send webhook with automatic retry on failure
     */
    public function sendWithRetry(
        string $eventType,
        array $data,
        ?string $requestId = null,
        ?string $ackUrl = null,
        int $maxRetries = 3,
        int $retryDelayMs = 1000
    ): array {
        $attempts = 0;
        $lastResult = null;
        
        while ($attempts < $maxRetries) {
            $attempts++;
            
            $result = $this->send($eventType, $data, $requestId, $ackUrl);
            $lastResult = $result;
            
            // Success - return immediately
            if ($result['success']) {
                $result['attempts'] = $attempts;
                return $result;
            }
            
            // Specific errors we shouldn't retry
            $noRetryHttpCodes = [400, 401, 403, 404, 422];
            if (in_array($result['http_code'], $noRetryHttpCodes, true)) {
                $result['attempts'] = $attempts;
                $result['retry_aborted'] = true;
                return $result;
            }
            
            // Wait before retry (exponential backoff)
            if ($attempts < $maxRetries) {
                $delay = $retryDelayMs * pow(2, $attempts - 1);
                usleep($delay * 1000);
            }
        }
        
        // All retries exhausted
        $lastResult['attempts'] = $attempts;
        $lastResult['retry_exhausted'] = true;
        return $lastResult;
    }
}

// ============================================================================
// Example Usage
// ============================================================================

// Configuration
$WEBHOOK_URL = 'https://app.stockloyal.com/webhooks/stockloyal-receiver.php';
$API_KEY = getenv('STOCKLOYAL_WEBHOOK_SECRET') ?: 'your_webhook_secret_here';

// Create sender
$sender = new WebhookSender($WEBHOOK_URL, $API_KEY);

// ============================================================================
// Example 1: Simple webhook (points redeemed)
// ============================================================================
echo "Example 1: Points Redeemed Event\n";
echo str_repeat('=', 70) . "\n";

$result = $sender->send('points.redeemed', [
    'member_id' => 'M12345',
    'merchant_id' => 'MERCHANT_001',
    'points_redeemed' => 5000,
    'cash_value' => 50.00,
    'currency' => 'USD',
    'transaction_id' => 'TXN_' . time(),
]);

echo "Status: " . ($result['success'] ? 'SUCCESS' : 'FAILED') . "\n";
echo "HTTP Code: {$result['http_code']}\n";
echo "Request ID: {$result['request_id']}\n";

if ($result['response']) {
    echo "Response:\n";
    print_r($result['response']);
}

echo "\n";

// ============================================================================
// Example 2: Webhook with ACK callback
// ============================================================================
echo "Example 2: Webhook with ACK Callback\n";
echo str_repeat('=', 70) . "\n";

$result = $sender->send('member.tier_upgraded', [
    'member_id' => 'M67890',
    'old_tier' => 'silver',
    'new_tier' => 'gold',
    'effective_date' => gmdate('Y-m-d'),
], null, 'https://your-domain.com/ack-receiver');

echo "Status: " . ($result['success'] ? 'SUCCESS' : 'FAILED') . "\n";
echo "ACK Attempted: " . ($result['response']['ack']['attempted'] ?? 'No') . "\n";

if (isset($result['response']['ack']['http_status'])) {
    echo "ACK HTTP Status: {$result['response']['ack']['http_status']}\n";
}

echo "\n";

// ============================================================================
// Example 3: Webhook with automatic retry
// ============================================================================
echo "Example 3: Webhook with Automatic Retry\n";
echo str_repeat('=', 70) . "\n";

$result = $sender->sendWithRetry('order.completed', [
    'order_id' => 'ORD_12345',
    'member_id' => 'M99999',
    'stock_symbol' => 'AAPL',
    'shares' => 10,
    'price' => 150.25,
    'total' => 1502.50,
], null, null, 3, 1000); // max 3 retries, 1s initial delay

echo "Status: " . ($result['success'] ? 'SUCCESS' : 'FAILED') . "\n";
echo "Attempts: {$result['attempts']}\n";

if (isset($result['retry_exhausted'])) {
    echo "⚠️  All retry attempts exhausted\n";
}

echo "\n";

// ============================================================================
// Example 4: Batch webhooks with idempotency
// ============================================================================
echo "Example 4: Batch Webhooks with Idempotency\n";
echo str_repeat('=', 70) . "\n";

$batchRequestId = 'batch_' . time();

$events = [
    ['member_id' => 'M001', 'action' => 'login'],
    ['member_id' => 'M002', 'action' => 'purchase'],
    ['member_id' => 'M003', 'action' => 'referral'],
];

foreach ($events as $index => $event) {
    $requestId = "{$batchRequestId}_{$index}";
    
    $result = $sender->send('member.activity', $event, $requestId);
    
    echo "Event {$index}: " . ($result['success'] ? '✓' : '✗') . " ";
    echo "Request ID: {$requestId}\n";
}

echo "\n";

// ============================================================================
// Example 5: Error handling
// ============================================================================
echo "Example 5: Error Handling\n";
echo str_repeat('=', 70) . "\n";

// Test with invalid API key
$invalidSender = new WebhookSender($WEBHOOK_URL, 'invalid_key_12345');
$result = $invalidSender->send('test.error', ['test' => true]);

echo "Expected Error - Unauthorized:\n";
echo "Status: " . ($result['success'] ? 'SUCCESS' : 'FAILED') . "\n";
echo "HTTP Code: {$result['http_code']}\n";

if (isset($result['response']['error'])) {
    echo "Error Message: {$result['response']['error']}\n";
}

echo "\n";

// ============================================================================
// Example 6: Custom merchant notification
// ============================================================================
echo "Example 6: Merchant Notification (Real-world Example)\n";
echo str_repeat('=', 70) . "\n";

/**
 * This is how you'd notify a merchant when points are redeemed
 */
function notifyMerchantPointsRedemption(
    WebhookSender $sender,
    array $redemptionData
): array {
    return $sender->sendWithRetry(
        'merchant.points_redeemed',
        [
            'notification_id' => 'NOTIF_' . bin2hex(random_bytes(8)),
            'merchant_id' => $redemptionData['merchant_id'],
            'merchant_name' => $redemptionData['merchant_name'],
            'member_id' => $redemptionData['member_id'],
            'member_name' => $redemptionData['member_name'],
            'member_email' => $redemptionData['member_email'],
            'points_redeemed' => $redemptionData['points'],
            'cash_value' => $redemptionData['cash_value'],
            'currency' => 'USD',
            'redemption_date' => gmdate('c'),
            'transaction_reference' => $redemptionData['transaction_id'],
        ],
        null,
        $redemptionData['merchant_webhook_url'] ?? null,
        3,
        2000
    );
}

// Example redemption
$redemption = [
    'merchant_id' => 'MERCH_001',
    'merchant_name' => 'Coffee & Co',
    'merchant_webhook_url' => 'https://merchant.example.com/webhook',
    'member_id' => 'M12345',
    'member_name' => 'John Doe',
    'member_email' => 'john@example.com',
    'points' => 1000,
    'cash_value' => 10.00,
    'transaction_id' => 'TXN_' . time(),
];

$result = notifyMerchantPointsRedemption($sender, $redemption);

echo "Merchant Notification:\n";
echo "Status: " . ($result['success'] ? '✓ Delivered' : '✗ Failed') . "\n";
echo "Attempts: {$result['attempts']}\n";
echo "Request ID: {$result['request_id']}\n";

if (!$result['success']) {
    echo "⚠️  Notification failed - consider email fallback\n";
}

echo "\n";

// ============================================================================
// Best Practices Summary
// ============================================================================
echo "\n";
echo "📋 Best Practices Summary\n";
echo str_repeat('=', 70) . "\n";
echo "✓ Always generate unique request_id for idempotency\n";
echo "✓ Use HMAC signatures for security\n";
echo "✓ Implement retry logic with exponential backoff\n";
echo "✓ Handle specific HTTP error codes appropriately\n";
echo "✓ Use ACK callbacks for critical events\n";
echo "✓ Log all webhook attempts for audit trail\n";
echo "✓ Have email fallback for failed notifications\n";
echo "✓ Monitor webhook delivery rates\n";
echo "\n";
