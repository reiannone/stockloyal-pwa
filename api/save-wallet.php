<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // contains $conn (PDO)

$input = json_decode(file_get_contents('php://input'), true);

// ✅ CRITICAL: Use member_id from the input data, NOT from localStorage
// This is the member being edited by the admin
$memberIdToUpdate = $input['member_id'] ?? null;

if (!$memberIdToUpdate) {
    echo json_encode(['success' => false, 'error' => 'member_id is required']);
    exit;
}

// Log what we're updating for debugging
error_log("save-wallet.php: Updating member_id = $memberIdToUpdate");
if (isset($input['member_tier'])) {
    error_log("save-wallet.php: Setting member_tier = " . $input['member_tier']);
}

try {
    // Build the UPDATE query dynamically based on provided fields
    $updates = [];
    $params = ['member_id' => $memberIdToUpdate];
    
    // ✅ FIXED: Separate fields for wallet vs members tables
    // Fields in wallet table
    $walletFields = [
        'member_email',
        'first_name',
        'middle_name',
        'last_name',
        'member_timezone',
        'member_tier',
        'merchant_id',
        'merchant_name',
        'broker',
        'broker_url',
        'points',
        'cash_balance',
        'portfolio_value',
        'sweep_percentage',
        'election_type'
    ];
    
    foreach ($walletFields as $field) {
        if (array_key_exists($field, $input)) {
            $updates[] = "$field = :$field";
            $params[$field] = $input[$field];
        }
    }
    
    // ✅ FIXED: Update wallet table
    if (!empty($updates)) {
        $sql = "UPDATE wallet SET " . implode(', ', $updates) . " WHERE member_id = :member_id";
        
        error_log("save-wallet.php SQL: $sql");
        error_log("save-wallet.php params: " . json_encode($params));
        
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        
        $rowsAffected = $stmt->rowCount();
        
        if ($rowsAffected === 0) {
            error_log("save-wallet.php: WARNING - No rows affected for member_id = $memberIdToUpdate");
            // Check if the record exists
            $checkStmt = $conn->prepare("SELECT COUNT(*) FROM wallet WHERE member_id = :member_id");
            $checkStmt->execute(['member_id' => $memberIdToUpdate]);
            $exists = (int) $checkStmt->fetchColumn();
            
            if ($exists === 0) {
                echo json_encode([
                    'success' => false, 
                    'error' => "Member record not found: $memberIdToUpdate"
                ]);
                exit;
            }
            // If record exists but no rows affected, values might be the same
        }
    }
    
    // ✅ Handle password update in wallet table
    $passwordUpdated = false;
    if (!empty($input['new_password'])) {
        $hashedPassword = password_hash($input['new_password'], PASSWORD_DEFAULT);
        
        // Update password in wallet table
        $pwdSql = "UPDATE wallet SET member_password_hash = :password WHERE member_id = :member_id";
        $pwdStmt = $conn->prepare($pwdSql);
        $pwdStmt->execute([
            'password' => $hashedPassword,
            'member_id' => $memberIdToUpdate
        ]);
        
        // Also update in members table for consistency
        try {
            $pwdSql2 = "UPDATE members SET password = :password WHERE member_id = :member_id";
            $pwdStmt2 = $conn->prepare($pwdSql2);
            $pwdStmt2->execute([
                'password' => $hashedPassword,
                'member_id' => $memberIdToUpdate
            ]);
        } catch (PDOException $e) {
            // Members table might not exist or have different structure
            error_log("save-wallet.php: Could not update members table: " . $e->getMessage());
        }
        
        $passwordUpdated = true;
        error_log("save-wallet.php: Updated password for $memberIdToUpdate");
    }
    
    echo json_encode([
        'success' => true,
        'member_id' => $memberIdToUpdate,
        'wallet_updated' => !empty($updates),
        'password_updated' => $passwordUpdated,
        'message' => 'Member data updated successfully'
    ]);
    
} catch (PDOException $e) {
    error_log("save-wallet.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
