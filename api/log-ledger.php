<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
$merchantId = $input['merchant_id'] ?? null;
$broker = $input['broker'] ?? null;
$orderId = $input['order_id'] ?? null;
$clientTxId = $input['client_tx_id'] ?? null;
$externalRef = $input['external_ref'] ?? null;
$txType = $input['tx_type'] ?? null;
$amountPoints = $input['points'] ?? null;
$amountCash = $input['amount_cash'] ?? null;
$note = $input['note'] ?? null;
$memberTimezone = $input['member_timezone'] ?? 'America/New_York';

// Validate required fields
if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing member_id"
    ]);
    exit;
}

// Validate tx_type if not provided
if (!$txType) {
    // Try to infer from old 'action' field for backwards compatibility
    $action = $input['action'] ?? null;
    
    if ($action) {
        $actionLower = strtolower(trim($action));
        
        // Map common actions to tx_type (using actual database enum values)
        if (in_array($actionLower, ['earn', 'received', 'refresh', 'refresh points', 'update', 'points_received'])) {
            $txType = 'points_received';
        } elseif (in_array($actionLower, ['redeem', 'spend', 'redeem_points'])) {
            $txType = 'redeem_points';
        } elseif (in_array($actionLower, ['adjust', 'adjust_points', 'adjustment', 'correction'])) {
            $txType = 'adjust_points';
        } else {
            $txType = 'points_received'; // default
        }
    } else {
        $txType = 'points_received'; // default
    }
}

// Validate tx_type is one of the allowed enum values
$validTxTypes = ['points_received', 'redeem_points', 'adjust_points', 'cash_in', 'cash_out', 'cash_fee'];
if (!in_array($txType, $validTxTypes)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Invalid tx_type. Must be one of: " . implode(", ", $validTxTypes)
    ]);
    exit;
}

// Determine direction based on tx_type
$direction = 'inbound'; // default
if (in_array($txType, ['redeem_points', 'cash_out', 'cash_fee'])) {
    $direction = 'outbound';
}

// Determine channel
$channel = 'Merchant API'; // default for merchant-initiated transactions
if ($broker) {
    $channel = 'Broker API';
} elseif ($input['channel']) {
    $channel = $input['channel'];
}

// Validate channel is one of the allowed enum values
$validChannels = ['Plaid', 'ACH', 'Broker API', 'Merchant API', 'Card', 'Wire', 'Internal', 'Other'];
if (!in_array($channel, $validChannels)) {
    $channel = 'Other';
}

// Default status
$status = $input['status'] ?? 'confirmed';

try {
    // ✅ CRITICAL FIX: Check for duplicate client_tx_id BEFORE attempting insert
    if ($clientTxId) {
        $checkStmt = $conn->prepare("
            SELECT tx_id, client_tx_id, created_at 
            FROM transactions_ledger 
            WHERE client_tx_id = ?
            LIMIT 1
        ");
        $checkStmt->execute([$clientTxId]);
        $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        if ($existing) {
            // Transaction already exists - return success (idempotent behavior)
            echo json_encode([
                "success" => true,
                "duplicate" => true,
                "tx_id" => $existing['tx_id'],
                "client_tx_id" => $clientTxId,
                "message" => "Transaction already logged (duplicate prevented)",
                "original_created_at" => $existing['created_at']
            ]);
            exit;
        }
    }
    
    // No duplicate found - proceed with insert
    $stmt = $conn->prepare("
        INSERT INTO transactions_ledger (
            member_id,
            merchant_id,
            broker,
            order_id,
            client_tx_id,
            external_ref,
            tx_type,
            direction,
            channel,
            status,
            amount_points,
            amount_cash,
            note,
            member_timezone
        ) VALUES (
            :member_id,
            :merchant_id,
            :broker,
            :order_id,
            :client_tx_id,
            :external_ref,
            :tx_type,
            :direction,
            :channel,
            :status,
            :amount_points,
            :amount_cash,
            :note,
            :member_timezone
        )
    ");

    $stmt->execute([
        ':member_id' => $memberId,
        ':merchant_id' => $merchantId,
        ':broker' => $broker,
        ':order_id' => $orderId,
        ':client_tx_id' => $clientTxId,
        ':external_ref' => $externalRef,
        ':tx_type' => $txType,
        ':direction' => $direction,
        ':channel' => $channel,
        ':status' => $status,
        ':amount_points' => $amountPoints,
        ':amount_cash' => $amountCash,
        ':note' => $note,
        ':member_timezone' => $memberTimezone
    ]);

    $txId = $conn->lastInsertId();

    echo json_encode([
        "success" => true,
        "duplicate" => false,
        "tx_id" => $txId,
        "client_tx_id" => $clientTxId,
        "message" => "Transaction logged successfully"
    ]);

} catch (PDOException $e) {
    error_log("log-ledger.php error: " . $e->getMessage());
    
    // ✅ IMPROVED: Even with pre-check, handle race conditions at DB level
    if ($e->getCode() == 23000 && strpos($e->getMessage(), 'client_tx_id') !== false) {
        // Race condition - another request inserted between our check and insert
        // Fetch the winning transaction
        if ($clientTxId) {
            $checkStmt = $conn->prepare("
                SELECT tx_id, client_tx_id, created_at 
                FROM transactions_ledger 
                WHERE client_tx_id = ?
                LIMIT 1
            ");
            $checkStmt->execute([$clientTxId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existing) {
                // Return success with duplicate flag
                echo json_encode([
                    "success" => true,
                    "duplicate" => true,
                    "race_condition" => true,
                    "tx_id" => $existing['tx_id'],
                    "client_tx_id" => $clientTxId,
                    "message" => "Transaction already logged (duplicate prevented via race condition handling)",
                    "original_created_at" => $existing['created_at']
                ]);
                exit;
            }
        }
        
        // Couldn't find existing transaction - return generic duplicate error
        echo json_encode([
            "success" => false,
            "error" => "Duplicate transaction ID (race condition)"
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Database error: " . $e->getMessage()
        ]);
    }
}
