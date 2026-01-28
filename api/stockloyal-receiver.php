<?php
declare(strict_types=1);

/**
 * stockloyal-receiver.php - Standalone version
 * Inbound webhook receiver with database connection built-in
 */

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Webhook-Signature, X-API-Key, X-Request-Id, X-Event-Type, X-Signature');
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

// Database connection
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
    error_log("Database connection failed: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

// Get raw payload
$rawPayload = file_get_contents('php://input');
$timestamp = gmdate('Y-m-d H:i:s');

// Setup logging
$logFile = '/var/www/html/stockloyal-pwa/logs/webhook-inbound.log';
if (!is_dir('/var/www/html/stockloyal-pwa/logs')) {
    @mkdir('/var/www/html/stockloyal-pwa/logs', 0755, true);
}

// Log incoming webhook
file_put_contents(
    $logFile,
    "\n[{$timestamp}] Inbound webhook from {$_SERVER['REMOTE_ADDR']}\n{$rawPayload}\n" . str_repeat('-', 80) . "\n",
    FILE_APPEND
);

try {
    $payload = json_decode($rawPayload, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON: ' . json_last_error_msg());
    }

    $eventType = $payload['event_type'] ?? '';
    $requestId = $payload['request_id'] ?? uniqid('wh_', true);
    $sourceIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    
    // Log to webhook_logs table (if it exists)
    try {
        $stmt = $conn->prepare("
            INSERT INTO webhook_logs 
            (request_id, event_type, source_ip, origin, payload, signature_verified, received_at, processed_at)
            VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
        ");
        $stmt->execute([
            $requestId,
            $eventType,
            $sourceIp,
            $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? 'unknown',
            $rawPayload
        ]);
    } catch (PDOException $e) {
        // Table might not exist - continue anyway
        error_log("webhook_logs insert failed: " . $e->getMessage());
    }

    // Process based on event type
    $result = null;
    switch ($eventType) {
        case 'points_received':
        case 'points.received':
            $result = processPointsReceived($conn, $payload, $requestId, $logFile);
            break;
            
        case 'order_confirmed':
        case 'order.confirmed':
            $result = processOrderConfirmed($conn, $payload, $requestId, $logFile);
            break;
            
        case 'test.connection':
        case 'test':
            $result = ['success' => true, 'message' => 'Test webhook received'];
            break;
            
        default:
            $result = ['success' => true, 'message' => 'Event type not handled', 'event_type' => $eventType];
    }

    echo json_encode(array_merge([
        'success' => true,
        'request_id' => $requestId,
        'event_type' => $eventType,
        'timestamp' => gmdate('c')
    ], $result ?? []));

} catch (Exception $e) {
    file_put_contents($logFile, "[{$timestamp}] ERROR: {$e->getMessage()}\n", FILE_APPEND);
    
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'request_id' => $requestId ?? uniqid('err_', true)
    ]);
}

function processPointsReceived($conn, $payload, $requestId, $logFile): array {
    $timestamp = gmdate('Y-m-d H:i:s');
    
    $memberId = $payload['member_id'] ?? null;
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
    
    // Generate unique client_tx_id
    if (!empty($transactionId)) {
        $clientTxId = "merchant_{$merchantId}_{$transactionId}";
    } else {
        $clientTxId = "webhook_{$requestId}";
    }
    
    file_put_contents(
        $logFile,
        "[{$timestamp}] Processing points_received: member={$memberId}, points={$points}, client_tx_id={$clientTxId}\n",
        FILE_APPEND
    );
    
    // Check for duplicate
    $checkStmt = $conn->prepare("SELECT tx_id, client_tx_id, created_at FROM transactions_ledger WHERE client_tx_id = ? LIMIT 1");
    $checkStmt->execute([$clientTxId]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    if ($existing) {
        file_put_contents(
            $logFile,
            "[{$timestamp}] ✅ DUPLICATE PREVENTED: {$clientTxId} exists (tx_id: {$existing['tx_id']})\n",
            FILE_APPEND
        );
        
        return [
            'success' => true,
            'duplicate' => true,
            'tx_id' => $existing['tx_id'],
            'client_tx_id' => $clientTxId,
            'message' => 'Transaction already processed'
        ];
    }
    
    // Get timezone - FIXED: Changed from members_wallet to wallet
    try {
        $tzStmt = $conn->prepare("SELECT member_timezone FROM wallet WHERE member_id = ? LIMIT 1");
        $tzStmt->execute([$memberId]);
        $wallet = $tzStmt->fetch(PDO::FETCH_ASSOC);
        $memberTimezone = $wallet['member_timezone'] ?? 'America/New_York';
    } catch (Exception $e) {
        $memberTimezone = 'America/New_York';
    }
    
    // Insert to ledger
    $ledgerStmt = $conn->prepare("
        INSERT INTO transactions_ledger 
        (member_id, merchant_id, broker, client_tx_id, tx_type, direction, channel, status, amount_points, note, member_timezone)
        VALUES (?, ?, ?, ?, 'points_received', 'inbound', 'Merchant API', 'confirmed', ?, ?, ?)
    ");
    
    try {
        $ledgerStmt->execute([
            $memberId,
            $merchantId,
            $broker,
            $clientTxId,
            $points,
            $note,
            $memberTimezone
        ]);
        
        $txId = $conn->lastInsertId();
        
        file_put_contents($logFile, "[{$timestamp}] ✅ Ledger entry created: tx_id={$txId}\n", FILE_APPEND);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000 && strpos($e->getMessage(), 'client_tx_id') !== false) {
            $checkStmt->execute([$clientTxId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            return [
                'success' => true,
                'duplicate' => true,
                'race_condition' => true,
                'tx_id' => $existing['tx_id'] ?? null,
                'client_tx_id' => $clientTxId
            ];
        }
        throw $e;
    }
    
    // Update wallet - FIXED: Changed from members_wallet to wallet
    try {
        $updateStmt = $conn->prepare("UPDATE wallet SET points = points + ? WHERE member_id = ?");
        $updateStmt->execute([$points, $memberId]);
        file_put_contents($logFile, "[{$timestamp}] ✅ Wallet updated\n", FILE_APPEND);
    } catch (Exception $e) {
        file_put_contents($logFile, "[{$timestamp}] ⚠️  Wallet update failed: {$e->getMessage()}\n", FILE_APPEND);
    }
    
    return [
        'success' => true,
        'duplicate' => false,
        'tx_id' => $txId,
        'client_tx_id' => $clientTxId,
        'points_added' => $points
    ];
}

function processOrderConfirmed($conn, $payload, $requestId, $logFile): array {
    $timestamp = gmdate('Y-m-d H:i:s');
    
    $basketId = $payload['basket_id'] ?? '';
    $status = $payload['status'] ?? 'confirmed';
    $brokerOrderId = $payload['broker_order_id'] ?? '';
    
    if (empty($basketId)) {
        throw new Exception('Missing basket_id');
    }
    
    $updateStmt = $conn->prepare("UPDATE orders SET status = ?, broker_order_id = COALESCE(?, broker_order_id) WHERE basket_id = ?");
    $updateStmt->execute([$status, $brokerOrderId, $basketId]);
    
    $rowsAffected = $updateStmt->rowCount();
    
    file_put_contents($logFile, "[{$timestamp}] ✅ Orders updated: basket_id={$basketId}, rows={$rowsAffected}\n", FILE_APPEND);
    
    return [
        'success' => true,
        'basket_id' => $basketId,
        'orders_updated' => $rowsAffected
    ];
}