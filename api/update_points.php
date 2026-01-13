<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");
require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents("php://input"), true);
$memberId = isset($input['member_id']) ? trim($input['member_id']) : '';
$points = isset($input['points']) ? (int)$input['points'] : null;
$cashBalance = isset($input['cash_balance']) ? (float)$input['cash_balance'] : null;

// ✅ NEW: Action determines whether to add or replace
$action = isset($input['action']) ? trim($input['action']) : 'add'; // Default: add

if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "member_id is required"
    ]);
    exit;
}

try {
    // Build UPDATE query based on action
    if ($action === 'replace' || $action === 'set') {
        // ✅ REPLACE mode: Set exact values (for URL updates)
        $updateParts = [];
        $params = [':member_id' => $memberId];
        
        if ($points !== null) {
            $updateParts[] = "points = :points";
            $params[':points'] = $points;
        }
        
        if ($cashBalance !== null) {
            $updateParts[] = "cash_balance = :cash_balance";
            $params[':cash_balance'] = $cashBalance;
        }
        
        if (empty($updateParts)) {
            http_response_code(400);
            echo json_encode([
                "success" => false,
                "error" => "No values to update"
            ]);
            exit;
        }
        
        $sql = "UPDATE wallet SET " . implode(", ", $updateParts) . ", updated_at = NOW() WHERE member_id = :member_id";
        
    } else {
        // ✅ ADD mode: Increment existing values (for transactions)
        $updateParts = [];
        $params = [':member_id' => $memberId];
        
        if ($points !== null) {
            $updateParts[] = "points = points + :points";
            $params[':points'] = $points;
        }
        
        if ($cashBalance !== null) {
            $updateParts[] = "cash_balance = cash_balance + :cash_balance";
            $params[':cash_balance'] = $cashBalance;
        }
        
        if (empty($updateParts)) {
            http_response_code(400);
            echo json_encode([
                "success" => false,
                "error" => "No values to update"
            ]);
            exit;
        }
        
        $sql = "UPDATE wallet SET " . implode(", ", $updateParts) . ", updated_at = NOW() WHERE member_id = :member_id";
    }
    
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    
    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error" => "Member not found or no changes made"
        ]);
        exit;
    }
    
    // Fetch updated wallet
    $fetchStmt = $conn->prepare("
        SELECT points, cash_balance, portfolio_value 
        FROM wallet 
        WHERE member_id = :member_id
    ");
    $fetchStmt->execute([':member_id' => $memberId]);
    $wallet = $fetchStmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        "success" => true,
        "message" => "Wallet updated successfully",
        "action" => $action,
        "member_id" => $memberId,
        "points" => (int)$wallet['points'],
        "cash_balance" => (float)$wallet['cash_balance'],
        "portfolio_value" => (float)$wallet['portfolio_value']
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Database error: " . $e->getMessage()
    ]);
}
