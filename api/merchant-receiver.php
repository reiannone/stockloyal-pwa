<?php
declare(strict_types=1);

/**
 * merchant-receiver.php
 * 
 * Inbound webhook receiver for MERCHANT events
 * Handles:
 *   - points_received: Merchant awards points to member
 *   - points_adjusted: Merchant adjusts member points (add/subtract)
 *   - member_updated: Member profile sync from merchant
 *   - tier_changed: Member tier update from merchant
 *   - member_sync_request: SIMULATION — responds with current tier + random
 *     points (10,000–3,000,000) so the sync round-trip works without a live merchant
 *   - member_sync_response: Async callback with member's current points/tier
 *     (sent by merchant in response to a member_sync_request from request-member-sync.php)
 * 
 * Endpoint: https://api.stockloyal.com/api/merchant-receiver.php
 */

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-Webhook-Signature, X-Request-Id, X-Event-Type');
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
$logFile = $logDir . '/merchant-webhook.log';

// Ensure log directory exists
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
    error_log("merchant-receiver.php: Database connection failed: " . $e->getMessage());
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
// AUTHENTICATION
// ============================================================================

function authenticateMerchant(PDO $conn, string $logFile): ?array {
    // Get API key from headers (support multiple formats)
    $apiKey = $_SERVER['HTTP_X_API_KEY'] 
        ?? $_SERVER['HTTP_AUTHORIZATION'] 
        ?? null;
    
    // Strip "Bearer " prefix if present
    if ($apiKey && stripos($apiKey, 'Bearer ') === 0) {
        $apiKey = substr($apiKey, 7);
    }
    
    if (empty($apiKey)) {
        logMessage($logFile, "⚠️ AUTH FAILED: No API key provided");
        return null;
    }
    
    // Look up merchant by API key (without active_status in WHERE to avoid errors)
    try {
        $stmt = $conn->prepare("
            SELECT merchant_id, merchant_name, program_name, webhook_url, api_key
            FROM merchant
            WHERE api_key = ?
            LIMIT 1
        ");
        $stmt->execute([$apiKey]);
        $merchant = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$merchant) {
            logMessage($logFile, "⚠️ AUTH FAILED: Invalid API key");
            return null;
        }
        
        logMessage($logFile, "✅ Authenticated merchant: {$merchant['merchant_name']} (ID: {$merchant['merchant_id']})");
        return $merchant;
        
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ AUTH ERROR: " . $e->getMessage());
        return null;
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle points_received / points.received event
 * Merchant awards points to a member
 */
function handlePointsReceived(PDO $conn, array $payload, string $requestId, string $logFile): array {
    $memberId = $payload['member_id'] ?? null;
    $merchantId = $payload['merchant_id'] ?? null;
    $broker = $payload['broker'] ?? null;
    $points = isset($payload['points']) ? (int)$payload['points'] : 0;
    $transactionId = $payload['transaction_id'] ?? $payload['merchant_tx_id'] ?? '';
    $note = $payload['note'] ?? 'Points received from merchant';
    $reason = $payload['reason'] ?? null;
    
    if (!$memberId) {
        throw new Exception('Missing member_id');
    }
    
    if ($points <= 0) {
        throw new Exception('Invalid points amount: must be positive');
    }
    
    // Generate unique client_tx_id for idempotency
    if (!empty($transactionId)) {
        $clientTxId = "merchant_{$merchantId}_{$transactionId}";
    } else {
        $clientTxId = "webhook_{$requestId}";
    }
    
    logMessage($logFile, "Processing points_received: member={$memberId}, points={$points}, client_tx_id={$clientTxId}");
    
    // Check for duplicate transaction
    $checkStmt = $conn->prepare("SELECT tx_id, client_tx_id, created_at FROM transactions_ledger WHERE client_tx_id = ? LIMIT 1");
    $checkStmt->execute([$clientTxId]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    if ($existing) {
        logMessage($logFile, "✅ DUPLICATE PREVENTED: {$clientTxId} exists (tx_id: {$existing['tx_id']})");
        
        return [
            'event' => 'points_received',
            'duplicate' => true,
            'tx_id' => $existing['tx_id'],
            'client_tx_id' => $clientTxId,
            'message' => 'Transaction already processed'
        ];
    }
    
    // Get member timezone
    try {
        $tzStmt = $conn->prepare("SELECT member_timezone FROM wallet WHERE member_id = ? LIMIT 1");
        $tzStmt->execute([$memberId]);
        $wallet = $tzStmt->fetch(PDO::FETCH_ASSOC);
        $memberTimezone = $wallet['member_timezone'] ?? 'America/New_York';
    } catch (Exception $e) {
        $memberTimezone = 'America/New_York';
    }
    
    // Build note with reason if provided
    if ($reason) {
        $note = "{$note} - Reason: {$reason}";
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
        logMessage($logFile, "✅ Ledger entry created: tx_id={$txId}");
        
    } catch (PDOException $e) {
        // Handle race condition on duplicate key
        if ($e->getCode() == 23000 && strpos($e->getMessage(), 'client_tx_id') !== false) {
            $checkStmt->execute([$clientTxId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            return [
                'event' => 'points_received',
                'duplicate' => true,
                'race_condition' => true,
                'tx_id' => $existing['tx_id'] ?? null,
                'client_tx_id' => $clientTxId
            ];
        }
        throw $e;
    }
    
    // Update wallet points balance
    try {
        $updateStmt = $conn->prepare("UPDATE wallet SET points = points + ?, updated_at = NOW() WHERE member_id = ?");
        $updateStmt->execute([$points, $memberId]);
        $walletUpdated = $updateStmt->rowCount() > 0;
        logMessage($logFile, "✅ Wallet updated: " . ($walletUpdated ? "yes" : "no (member may not exist)"));
    } catch (Exception $e) {
        logMessage($logFile, "⚠️ Wallet update failed: " . $e->getMessage());
        $walletUpdated = false;
    }
    
    return [
        'event' => 'points_received',
        'duplicate' => false,
        'tx_id' => $txId,
        'client_tx_id' => $clientTxId,
        'points_added' => $points,
        'wallet_updated' => $walletUpdated
    ];
}

/**
 * Handle points_adjusted / points.adjusted event
 * Merchant adjusts member points (can be positive or negative)
 */
function handlePointsAdjusted(PDO $conn, array $payload, string $requestId, string $logFile): array {
    $memberId = $payload['member_id'] ?? null;
    $merchantId = $payload['merchant_id'] ?? null;
    $broker = $payload['broker'] ?? null;
    $points = isset($payload['points']) ? (int)$payload['points'] : 0;
    $transactionId = $payload['transaction_id'] ?? $payload['merchant_tx_id'] ?? '';
    $reason = $payload['reason'] ?? 'Points adjustment';
    
    if (!$memberId) {
        throw new Exception('Missing member_id');
    }
    
    if ($points == 0) {
        throw new Exception('Invalid points amount: cannot be zero');
    }
    
    // Generate unique client_tx_id
    if (!empty($transactionId)) {
        $clientTxId = "adjust_{$merchantId}_{$transactionId}";
    } else {
        $clientTxId = "adjust_{$requestId}";
    }
    
    $direction = $points > 0 ? 'inbound' : 'outbound';
    $txType = $points > 0 ? 'points_adjustment_credit' : 'points_adjustment_debit';
    
    logMessage($logFile, "Processing points_adjusted: member={$memberId}, points={$points}, direction={$direction}");
    
    // Check for duplicate
    $checkStmt = $conn->prepare("SELECT tx_id FROM transactions_ledger WHERE client_tx_id = ? LIMIT 1");
    $checkStmt->execute([$clientTxId]);
    if ($checkStmt->fetch()) {
        return [
            'event' => 'points_adjusted',
            'duplicate' => true,
            'client_tx_id' => $clientTxId,
            'message' => 'Adjustment already processed'
        ];
    }
    
    // Get member timezone
    try {
        $tzStmt = $conn->prepare("SELECT member_timezone, points FROM wallet WHERE member_id = ? LIMIT 1");
        $tzStmt->execute([$memberId]);
        $wallet = $tzStmt->fetch(PDO::FETCH_ASSOC);
        $memberTimezone = $wallet['member_timezone'] ?? 'America/New_York';
        $currentPoints = (int)($wallet['points'] ?? 0);
    } catch (Exception $e) {
        $memberTimezone = 'America/New_York';
        $currentPoints = 0;
    }
    
    // Prevent negative balance
    if ($points < 0 && ($currentPoints + $points) < 0) {
        throw new Exception("Insufficient points: member has {$currentPoints}, cannot deduct " . abs($points));
    }
    
    // Insert to ledger
    $ledgerStmt = $conn->prepare("
        INSERT INTO transactions_ledger 
        (member_id, merchant_id, broker, client_tx_id, tx_type, direction, channel, status, amount_points, note, member_timezone)
        VALUES (?, ?, ?, ?, ?, ?, 'Merchant API', 'confirmed', ?, ?, ?)
    ");
    $ledgerStmt->execute([
        $memberId,
        $merchantId,
        $broker,
        $clientTxId,
        $txType,
        $direction,
        abs($points),
        $reason,
        $memberTimezone
    ]);
    $txId = $conn->lastInsertId();
    
    // Update wallet
    $updateStmt = $conn->prepare("UPDATE wallet SET points = points + ?, updated_at = NOW() WHERE member_id = ?");
    $updateStmt->execute([$points, $memberId]);
    
    logMessage($logFile, "✅ Points adjusted: tx_id={$txId}, new_balance=" . ($currentPoints + $points));
    
    return [
        'event' => 'points_adjusted',
        'duplicate' => false,
        'tx_id' => $txId,
        'client_tx_id' => $clientTxId,
        'points_adjusted' => $points,
        'previous_balance' => $currentPoints,
        'new_balance' => $currentPoints + $points
    ];
}

/**
 * Handle member_updated / member.updated event
 * Sync member profile data from merchant
 */
function handleMemberUpdated(PDO $conn, array $payload, string $logFile): array {
    $memberId = $payload['member_id'] ?? null;
    $merchantId = $payload['merchant_id'] ?? null;
    
    if (!$memberId) {
        throw new Exception('Missing member_id');
    }
    
    logMessage($logFile, "Processing member_updated: member={$memberId}");
    
    // Fields that can be updated
    $allowedFields = [
        'member_email' => $payload['email'] ?? $payload['member_email'] ?? null,
        'first_name' => $payload['first_name'] ?? null,
        'last_name' => $payload['last_name'] ?? null,
        'phone' => $payload['phone'] ?? null,
        'member_timezone' => $payload['timezone'] ?? $payload['member_timezone'] ?? null,
    ];
    
    // Filter out null values
    $updates = array_filter($allowedFields, fn($v) => $v !== null);
    
    if (empty($updates)) {
        return [
            'event' => 'member_updated',
            'member_id' => $memberId,
            'fields_updated' => 0,
            'message' => 'No updateable fields provided'
        ];
    }
    
    // Build dynamic UPDATE query
    $setClauses = [];
    $params = [];
    foreach ($updates as $field => $value) {
        $setClauses[] = "{$field} = ?";
        $params[] = $value;
    }
    $setClauses[] = "updated_at = NOW()";
    $params[] = $memberId;
    
    $sql = "UPDATE wallet SET " . implode(', ', $setClauses) . " WHERE member_id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    
    $rowsUpdated = $stmt->rowCount();
    
    logMessage($logFile, "✅ Member updated: fields=" . implode(',', array_keys($updates)) . ", rows={$rowsUpdated}");
    
    return [
        'event' => 'member_updated',
        'member_id' => $memberId,
        'fields_updated' => count($updates),
        'updated_fields' => array_keys($updates),
        'wallet_found' => $rowsUpdated > 0
    ];
}

/**
 * Handle tier_changed / tier.changed event
 * Update member tier from merchant
 */
function handleTierChanged(PDO $conn, array $payload, string $logFile): array {
    $memberId = $payload['member_id'] ?? null;
    $merchantId = $payload['merchant_id'] ?? null;
    $newTier = $payload['tier'] ?? $payload['new_tier'] ?? $payload['member_tier'] ?? null;
    $previousTier = $payload['previous_tier'] ?? null;
    
    if (!$memberId) {
        throw new Exception('Missing member_id');
    }
    
    if (!$newTier) {
        throw new Exception('Missing tier value');
    }
    
    logMessage($logFile, "Processing tier_changed: member={$memberId}, tier={$newTier}");
    
    // Get current tier before update
    $currentStmt = $conn->prepare("SELECT member_tier FROM wallet WHERE member_id = ? LIMIT 1");
    $currentStmt->execute([$memberId]);
    $current = $currentStmt->fetch(PDO::FETCH_ASSOC);
    $currentTier = $current['member_tier'] ?? null;
    
    // Update tier
    $updateStmt = $conn->prepare("UPDATE wallet SET member_tier = ?, updated_at = NOW() WHERE member_id = ?");
    $updateStmt->execute([$newTier, $memberId]);
    $rowsUpdated = $updateStmt->rowCount();
    
    logMessage($logFile, "✅ Tier updated: {$currentTier} → {$newTier}");
    
    return [
        'event' => 'tier_changed',
        'member_id' => $memberId,
        'previous_tier' => $currentTier,
        'new_tier' => $newTier,
        'wallet_updated' => $rowsUpdated > 0
    ];
}

/**
 * Handle member_enrolled / member.enrolled event
 * New member enrolled by merchant
 */
function handleMemberEnrolled(PDO $conn, array $payload, string $logFile): array {
    $memberId = $payload['member_id'] ?? null;
    $merchantId = $payload['merchant_id'] ?? null;
    $email = $payload['email'] ?? $payload['member_email'] ?? null;
    $firstName = $payload['first_name'] ?? '';
    $lastName = $payload['last_name'] ?? '';
    $initialPoints = isset($payload['initial_points']) ? (int)$payload['initial_points'] : 0;
    $tier = $payload['tier'] ?? $payload['member_tier'] ?? 'Standard';
    
    if (!$memberId) {
        throw new Exception('Missing member_id');
    }
    
    logMessage($logFile, "Processing member_enrolled: member={$memberId}, merchant={$merchantId}");
    
    // Check if member already exists
    $checkStmt = $conn->prepare("SELECT member_id FROM wallet WHERE member_id = ? LIMIT 1");
    $checkStmt->execute([$memberId]);
    if ($checkStmt->fetch()) {
        logMessage($logFile, "⚠️ Member already exists: {$memberId}");
        return [
            'event' => 'member_enrolled',
            'member_id' => $memberId,
            'created' => false,
            'message' => 'Member already exists'
        ];
    }
    
    // Create new wallet entry
    $insertStmt = $conn->prepare("
        INSERT INTO wallet 
        (member_id, merchant_id, member_email, first_name, last_name, points, member_tier, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ");
    $insertStmt->execute([
        $memberId,
        $merchantId,
        $email,
        $firstName,
        $lastName,
        $initialPoints,
        $tier
    ]);
    
    logMessage($logFile, "✅ Member enrolled: {$memberId} with {$initialPoints} initial points");
    
    return [
        'event' => 'member_enrolled',
        'member_id' => $memberId,
        'created' => true,
        'initial_points' => $initialPoints,
        'tier' => $tier
    ];
}

/**
 * Handle test.connection event
 */
function handleTestConnection(array $payload, string $logFile): array {
    logMessage($logFile, "✅ Test connection received");
    
    return [
        'event' => 'test.connection',
        'message' => 'Merchant webhook connection successful',
        'echo' => $payload['echo'] ?? null
    ];
}

/**
 * Handle member_sync_request / member.sync_request event
 * 
 * SIMULATION MODE — This handler acts as a mock merchant endpoint.
 * When request-member-sync.php sends an outbound sync request and the
 * merchant's webhook_url points back here, this handler responds
 * synchronously with:
 *   - points: random integer between 10,000 and 3,000,000
 *   - tier:   the member's current tier from the wallet table
 * 
 * In production, a real merchant would handle this event and return
 * their own authoritative points balance and tier. This simulation
 * lets you test the full round-trip without a live merchant.
 */
function handleMemberSyncRequest(PDO $conn, array $payload, string $logFile): array {
    $memberId   = $payload['member_id'] ?? null;
    $merchantId = $payload['merchant_id'] ?? null;
    $requestId  = $payload['request_id'] ?? null;

    if (!$memberId) {
        throw new Exception('Missing member_id');
    }

    logMessage($logFile, "🔄 SIMULATING merchant sync for member={$memberId}");

    // Look up current tier from wallet
    $currentTier = 'Standard';
    try {
        $stmt = $conn->prepare("SELECT member_tier FROM wallet WHERE member_id = ? LIMIT 1");
        $stmt->execute([$memberId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && !empty($row['member_tier'])) {
            $currentTier = $row['member_tier'];
        }
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ Could not look up current tier: " . $e->getMessage());
    }

    // Generate random points between 10,000 and 3,000,000
    $simulatedPoints = random_int(10000, 3000000);

    logMessage($logFile, "✅ Simulated response: points={$simulatedPoints}, tier={$currentTier}");

    return [
        'success'          => true,
        'event'            => 'member_sync_request',
        'simulated'        => true,
        'member_id'        => $memberId,
        'points'           => $simulatedPoints,
        'tier'             => $currentTier,
        'request_id'       => $requestId,
        'merchant_message' => 'Simulated merchant response — random points between 10,000 and 3,000,000',
    ];
}

/**
 * Handle member_sync_response / member.sync_response event
 * Async callback from merchant with current points and/or tier.
 * Sent when the merchant could not respond synchronously to our member_sync_request.
 */
function handleMemberSyncResponse(PDO $conn, array $payload, string $logFile): array {
    $memberId   = $payload['member_id'] ?? null;
    $merchantId = $payload['merchant_id'] ?? null;

    if (!$memberId) {
        throw new Exception('Missing member_id');
    }

    logMessage($logFile, "Processing member_sync_response: member={$memberId}");

    // Get current wallet row
    $currentStmt = $conn->prepare("SELECT points, member_tier, cash_balance FROM wallet WHERE member_id = ? LIMIT 1");
    $currentStmt->execute([$memberId]);
    $current = $currentStmt->fetch(PDO::FETCH_ASSOC);

    if (!$current) {
        throw new Exception("Member wallet not found: {$memberId}");
    }

    $setClauses = [];
    $params     = [];
    $changes    = [];

    // --- Check points ---
    $newPoints = $payload['points'] ?? $payload['available_points'] ?? $payload['point_balance'] ?? null;
    if ($newPoints !== null) {
        $newPoints = (int) $newPoints;
        if ($newPoints !== (int) $current['points']) {
            $setClauses[] = 'points = ?';
            $params[]     = $newPoints;
            $changes['points'] = ['from' => (int) $current['points'], 'to' => $newPoints];

            // Recalculate cash_balance using merchant conversion_rate
            if ($merchantId) {
                try {
                    $rateStmt = $conn->prepare("SELECT conversion_rate FROM merchant WHERE merchant_id = ? LIMIT 1");
                    $rateStmt->execute([$merchantId]);
                    $rateRow        = $rateStmt->fetch(PDO::FETCH_ASSOC);
                    $conversionRate = (float) ($rateRow['conversion_rate'] ?? 0);

                    if ($conversionRate > 0) {
                        $newCash      = number_format($newPoints * $conversionRate, 2, '.', '');
                        $setClauses[] = 'cash_balance = ?';
                        $params[]     = $newCash;
                        $changes['cash_balance'] = $newCash;
                    }
                } catch (PDOException $e) {
                    logMessage($logFile, "⚠️ conversion_rate lookup failed: " . $e->getMessage());
                }
            }
        }
    }

    // --- Check tier ---
    $newTier = $payload['tier'] ?? $payload['member_tier'] ?? $payload['loyalty_tier'] ?? null;
    if ($newTier !== null && $newTier !== $current['member_tier']) {
        $setClauses[] = 'member_tier = ?';
        $params[]     = $newTier;
        $changes['tier'] = ['from' => $current['member_tier'], 'to' => $newTier];
    }

    if (empty($setClauses)) {
        logMessage($logFile, "✅ No changes — data already in sync");
        return [
            'event'     => 'member_sync_response',
            'member_id' => $memberId,
            'changes'   => 0,
            'message'   => 'Data already in sync',
        ];
    }

    // Apply updates
    $setClauses[] = 'updated_at = NOW()';
    $params[]     = $memberId;
    $sql = "UPDATE wallet SET " . implode(', ', $setClauses) . " WHERE member_id = ?";
    $conn->prepare($sql)->execute($params);

    logMessage($logFile, "✅ Sync response applied: " . json_encode($changes));

    return [
        'event'     => 'member_sync_response',
        'member_id' => $memberId,
        'changes'   => count($changes),
        'details'   => $changes,
    ];
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

try {
    // Get raw payload
    $rawPayload = file_get_contents('php://input');
    $sourceIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    
    logMessage($logFile, str_repeat('=', 80));
    logMessage($logFile, "Inbound MERCHANT webhook from {$sourceIp}");
    logMessage($logFile, "Payload: {$rawPayload}");
    
    // Parse JSON
    $payload = json_decode($rawPayload, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON: ' . json_last_error_msg());
    }
    
    // Get event type (support multiple formats)
    $eventType = $payload['event_type'] 
        ?? $payload['event'] 
        ?? $_SERVER['HTTP_X_EVENT_TYPE'] 
        ?? '';
    
    $requestId = $payload['request_id'] 
        ?? $_SERVER['HTTP_X_REQUEST_ID'] 
        ?? uniqid('mrc_', true);
    
    logMessage($logFile, "Event: {$eventType}, Request ID: {$requestId}");
    
    // Authenticate merchant (optional for test events)
    $merchant = null;
    if ($eventType !== 'test.connection' && $eventType !== 'test') {
        $merchant = authenticateMerchant($conn, $logFile);
        // Note: Not enforcing auth for now to allow easier integration
        // Uncomment below to require authentication:
        // if (!$merchant) {
        //     respond(['success' => false, 'error' => 'Authentication failed'], 401);
        // }
    }
    
    // Add merchant info to payload if authenticated
    if ($merchant) {
        $payload['merchant_id'] = $payload['merchant_id'] ?? $merchant['merchant_id'];
        $payload['merchant_name'] = $merchant['merchant_name'];
    }
    
    // Log to webhook_logs table (without 'source' column that may not exist)
    try {
        $stmt = $conn->prepare("
            INSERT INTO webhook_logs 
            (request_id, event_type, source_ip, payload, received_at)
            VALUES (?, ?, ?, ?, NOW())
        ");
        $stmt->execute([$requestId, $eventType, $sourceIp, $rawPayload]);
    } catch (PDOException $e) {
        // Table might not exist or have different schema - continue anyway
        logMessage($logFile, "⚠️ webhook_logs insert failed: " . $e->getMessage());
    }
    
    // Route to appropriate handler
    $result = match($eventType) {
        'points_received', 'points.received' => handlePointsReceived($conn, $payload, $requestId, $logFile),
        'points_adjusted', 'points.adjusted' => handlePointsAdjusted($conn, $payload, $requestId, $logFile),
        'member_updated', 'member.updated' => handleMemberUpdated($conn, $payload, $logFile),
        'tier_changed', 'tier.changed' => handleTierChanged($conn, $payload, $logFile),
        'member_enrolled', 'member.enrolled' => handleMemberEnrolled($conn, $payload, $logFile),
        'member_sync_request', 'member.sync_request' => handleMemberSyncRequest($conn, $payload, $logFile),
        'member_sync_response', 'member.sync_response' => handleMemberSyncResponse($conn, $payload, $logFile),
        'test.connection', 'test' => handleTestConnection($payload, $logFile),
        default => [
            'event' => $eventType,
            'message' => 'Event type not handled',
            'supported_events' => [
                'points_received',
                'points_adjusted',
                'member_updated',
                'tier_changed',
                'member_enrolled',
                'member_sync_request',
                'member_sync_response',
                'test.connection'
            ]
        ]
    };
    
    logMessage($logFile, "Response: " . json_encode($result));
    logMessage($logFile, str_repeat('-', 80));
    
    respond(array_merge([
        'success' => true,
        'request_id' => $requestId,
        'timestamp' => gmdate('c')
    ], $result));

} catch (Exception $e) {
    logMessage($logFile, "❌ ERROR: " . $e->getMessage());
    logMessage($logFile, str_repeat('-', 80));
    
    respond([
        'success' => false,
        'error' => $e->getMessage(),
        'request_id' => $requestId ?? uniqid('err_', true)
    ], 400);
}
