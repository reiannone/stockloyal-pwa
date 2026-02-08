<?php
declare(strict_types=1);

/**
 * stockloyal-receiver.php - Router/Legacy Fallback
 * 
 * This endpoint routes incoming webhooks to the appropriate receiver:
 *   - Broker events → broker-receiver.php logic
 *   - Merchant events → merchant-receiver.php logic
 * 
 * For new integrations, use the dedicated endpoints:
 *   - Brokers: https://api.stockloyal.com/api/broker-receiver.php
 *   - Merchants: https://api.stockloyal.com/api/merchant-receiver.php
 * 
 * This endpoint remains for backward compatibility.
 */

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-Webhook-Signature, X-Request-Id, X-Event-Type, X-Signature');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

$logDir = '/var/www/html/stockloyal-pwa/logs';
$logFile = $logDir . '/webhook-inbound.log';

if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

try {
    $host = 'stockloyal-db.ctms60ci403w.us-east-2.rds.amazonaws.com';
    $dbname = 'stockloyal';
    $username = 'admin';
    $password = 'StockLoyal2025!';
    
    $conn = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
} catch (PDOException $e) {
    error_log("stockloyal-receiver.php: Database connection failed: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function logMessage(string $logFile, string $message): void {
    $timestamp = gmdate('Y-m-d H:i:s');
    file_put_contents($logFile, "[{$timestamp}] {$message}\n", FILE_APPEND);
}

function respond(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// ============================================================================
// EVENT TYPE CLASSIFICATION
// ============================================================================

// Broker events (3-stage order flow)
$brokerEvents = [
    'order.acknowledged', 'order_acknowledged', 'order_placed',
    'order.confirmed', 'order_confirmed',
    'order.executed', 'order_executed',
    'order.rejected', 'order_rejected',
    'order.cancelled', 'order_cancelled',
];

// Merchant events
$merchantEvents = [
    'points_received', 'points.received',
    'points_adjusted', 'points.adjusted',
    'member_updated', 'member.updated',
    'tier_changed', 'tier.changed',
    'member_enrolled', 'member.enrolled',
];

// ============================================================================
// MAIN PROCESSING
// ============================================================================

try {
    $rawPayload = file_get_contents('php://input');
    $sourceIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    
    logMessage($logFile, str_repeat('=', 80));
    logMessage($logFile, "Inbound webhook from {$sourceIp} (via legacy router)");
    logMessage($logFile, "Payload: {$rawPayload}");
    
    $payload = json_decode($rawPayload, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON: ' . json_last_error_msg());
    }
    
    // Determine event type
    $eventType = $payload['event_type'] 
        ?? $payload['event'] 
        ?? $_SERVER['HTTP_X_EVENT_TYPE'] 
        ?? '';
    
    $requestId = $payload['request_id'] 
        ?? $_SERVER['HTTP_X_REQUEST_ID'] 
        ?? uniqid('wh_', true);
    
    logMessage($logFile, "Event: {$eventType}, Request ID: {$requestId}");
    
    // Log to webhook_logs (without 'source' column that may not exist)
    try {
        $stmt = $conn->prepare("
            INSERT INTO webhook_logs 
            (request_id, event_type, source_ip, payload, received_at)
            VALUES (?, ?, ?, ?, NOW())
        ");
        $stmt->execute([$requestId, $eventType, $sourceIp, $rawPayload]);
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ webhook_logs insert failed: " . $e->getMessage());
    }
    
    // Route based on event type
    $result = null;
    
    // ========================================================================
    // BROKER EVENTS
    // ========================================================================
    
    if (in_array($eventType, $brokerEvents)) {
        logMessage($logFile, "Routing to BROKER handler");
        
        $basketId = $payload['basket_id'] ?? '';
        $memberId = strtolower(trim((string)($payload['member_id'] ?? '')));
        $brokerOrderId = $payload['broker_order_id'] ?? null;
        
        if (empty($basketId)) {
            throw new Exception('Missing basket_id');
        }
        
        switch ($eventType) {
            case 'order.acknowledged':
            case 'order_acknowledged':
            case 'order_placed':
                // Stage 2: pending → placed (case-insensitive)
                $stmt = $conn->prepare("
                    UPDATE orders 
                    SET status = 'placed',
                        broker_order_id = COALESCE(?, broker_order_id),
                        updated_at = NOW()
                    WHERE basket_id = ? AND LOWER(status) = 'pending'
                ");
                $stmt->execute([$brokerOrderId, $basketId]);
                $result = [
                    'event' => $eventType,
                    'basket_id' => $basketId,
                    'orders_updated' => $stmt->rowCount(),
                    'new_status' => 'placed'
                ];
                break;
                
            case 'order.confirmed':
            case 'order_confirmed':
                // Stage 3: placed → confirmed (case-insensitive)
                $stmt = $conn->prepare("
                    UPDATE orders 
                    SET status = 'confirmed',
                        broker_order_id = COALESCE(?, broker_order_id),
                        confirmed_at = NOW(),
                        updated_at = NOW()
                    WHERE basket_id = ? AND LOWER(status) IN ('pending', 'placed')
                ");
                $stmt->execute([$brokerOrderId, $basketId]);
                $result = [
                    'event' => $eventType,
                    'basket_id' => $basketId,
                    'orders_updated' => $stmt->rowCount(),
                    'new_status' => 'confirmed'
                ];
                break;
                
            case 'order.executed':
            case 'order_executed':
                $stmt = $conn->prepare("
                    UPDATE orders 
                    SET status = 'executed',
                        executed_at = NOW(),
                        updated_at = NOW()
                    WHERE basket_id = ? AND LOWER(status) IN ('placed', 'confirmed')
                ");
                $stmt->execute([$basketId]);
                $result = [
                    'event' => $eventType,
                    'basket_id' => $basketId,
                    'orders_updated' => $stmt->rowCount(),
                    'new_status' => 'executed'
                ];
                break;
                
            case 'order.rejected':
            case 'order_rejected':
                $reason = $payload['reason'] ?? 'Unknown reason';
                $stmt = $conn->prepare("
                    UPDATE orders 
                    SET status = 'rejected',
                        reject_reason = ?,
                        updated_at = NOW()
                    WHERE basket_id = ? AND LOWER(status) IN ('pending', 'placed')
                ");
                $stmt->execute([$reason, $basketId]);
                $result = [
                    'event' => $eventType,
                    'basket_id' => $basketId,
                    'orders_updated' => $stmt->rowCount(),
                    'new_status' => 'rejected',
                    'reason' => $reason
                ];
                break;
                
            case 'order.cancelled':
            case 'order_cancelled':
                $reason = $payload['reason'] ?? 'Cancelled';
                $stmt = $conn->prepare("
                    UPDATE orders 
                    SET status = 'cancelled',
                        cancel_reason = ?,
                        updated_at = NOW()
                    WHERE basket_id = ? AND LOWER(status) IN ('pending', 'placed', 'queued')
                ");
                $stmt->execute([$reason, $basketId]);
                $result = [
                    'event' => $eventType,
                    'basket_id' => $basketId,
                    'orders_updated' => $stmt->rowCount(),
                    'new_status' => 'cancelled'
                ];
                break;
        }
    }
    
    // ========================================================================
    // MERCHANT EVENTS
    // ========================================================================
    
    elseif (in_array($eventType, $merchantEvents)) {
        logMessage($logFile, "Routing to MERCHANT handler");
        
        switch ($eventType) {
            case 'points_received':
            case 'points.received':
                $memberId = isset($payload['member_id']) ? strtolower(trim((string)$payload['member_id'])) : null;
                $merchantId = $payload['merchant_id'] ?? null;
                $broker = $payload['broker'] ?? null;
                $points = isset($payload['points']) ? (int)$payload['points'] : 0;
                $transactionId = $payload['transaction_id'] ?? $payload['merchant_tx_id'] ?? '';
                $note = $payload['note'] ?? 'Points received from merchant';
                
                if (!$memberId) {
                    throw new Exception('Missing member_id');
                }
                if ($points <= 0) {
                    throw new Exception('Invalid points amount');
                }
                
                // Generate idempotency key
                $clientTxId = !empty($transactionId) 
                    ? "merchant_{$merchantId}_{$transactionId}" 
                    : "webhook_{$requestId}";
                
                // Check duplicate
                $checkStmt = $conn->prepare("SELECT tx_id FROM transactions_ledger WHERE client_tx_id = ? LIMIT 1");
                $checkStmt->execute([$clientTxId]);
                $existing = $checkStmt->fetch();
                
                if ($existing) {
                    $result = [
                        'event' => $eventType,
                        'duplicate' => true,
                        'tx_id' => $existing['tx_id'],
                        'client_tx_id' => $clientTxId,
                        'message' => 'Transaction already processed'
                    ];
                } else {
                    // Get timezone
                    $tzStmt = $conn->prepare("SELECT member_timezone FROM wallet WHERE member_id = ? LIMIT 1");
                    $tzStmt->execute([$memberId]);
                    $wallet = $tzStmt->fetch();
                    $memberTimezone = $wallet['member_timezone'] ?? 'America/New_York';
                    
                    // Insert ledger entry
                    $ledgerStmt = $conn->prepare("
                        INSERT INTO transactions_ledger 
                        (member_id, merchant_id, broker, client_tx_id, tx_type, direction, channel, status, amount_points, note, member_timezone)
                        VALUES (?, ?, ?, ?, 'points_received', 'inbound', 'Merchant API', 'confirmed', ?, ?, ?)
                    ");
                    $ledgerStmt->execute([$memberId, $merchantId, $broker, $clientTxId, $points, $note, $memberTimezone]);
                    $txId = $conn->lastInsertId();
                    
                    // Update wallet
                    $updateStmt = $conn->prepare("UPDATE wallet SET points = points + ?, updated_at = NOW() WHERE member_id = ?");
                    $updateStmt->execute([$points, $memberId]);
                    
                    $result = [
                        'event' => $eventType,
                        'duplicate' => false,
                        'tx_id' => $txId,
                        'client_tx_id' => $clientTxId,
                        'points_added' => $points
                    ];
                }
                break;
                
            case 'tier_changed':
            case 'tier.changed':
                $memberId = isset($payload['member_id']) ? strtolower(trim((string)$payload['member_id'])) : null;
                $newTier = $payload['tier'] ?? $payload['new_tier'] ?? $payload['member_tier'] ?? null;
                
                if (!$memberId || !$newTier) {
                    throw new Exception('Missing member_id or tier');
                }
                
                $updateStmt = $conn->prepare("UPDATE wallet SET member_tier = ?, updated_at = NOW() WHERE member_id = ?");
                $updateStmt->execute([$newTier, $memberId]);
                
                $result = [
                    'event' => $eventType,
                    'member_id' => $memberId,
                    'new_tier' => $newTier,
                    'updated' => $updateStmt->rowCount() > 0
                ];
                break;
                
            default:
                $result = [
                    'event' => $eventType,
                    'message' => 'Merchant event type not fully implemented in legacy router',
                    'recommendation' => 'Use https://api.stockloyal.com/api/merchant-receiver.php'
                ];
        }
    }
    
    // ========================================================================
    // TEST & OTHER EVENTS
    // ========================================================================
    
    elseif ($eventType === 'test.connection' || $eventType === 'test') {
        $result = [
            'event' => 'test.connection',
            'message' => 'Legacy router connection successful',
            'recommendation' => [
                'brokers' => 'https://api.stockloyal.com/api/broker-receiver.php',
                'merchants' => 'https://api.stockloyal.com/api/merchant-receiver.php'
            ],
            'echo' => $payload['echo'] ?? null
        ];
    }
    
    else {
        $result = [
            'event' => $eventType,
            'message' => 'Event type not recognized',
            'supported_broker_events' => $brokerEvents,
            'supported_merchant_events' => $merchantEvents,
            'recommendation' => [
                'brokers' => 'https://api.stockloyal.com/api/broker-receiver.php',
                'merchants' => 'https://api.stockloyal.com/api/merchant-receiver.php'
            ]
        ];
    }
    
    logMessage($logFile, "Response: " . json_encode($result));
    logMessage($logFile, str_repeat('-', 80));
    
    respond(array_merge([
        'success' => true,
        'request_id' => $requestId,
        'timestamp' => gmdate('c'),
        'router' => 'legacy'
    ], $result ?? []));

} catch (Exception $e) {
    logMessage($logFile, "❌ ERROR: " . $e->getMessage());
    logMessage($logFile, str_repeat('-', 80));
    
    respond([
        'success' => false,
        'error' => $e->getMessage(),
        'request_id' => $requestId ?? uniqid('err_', true)
    ], 400);
}
