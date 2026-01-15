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

$memberId = $input['member_id'] ?? null;
$points = $input['points'] ?? null;
$cashBalance = $input['cash_balance'] ?? null;
$action = strtolower(trim($input['action'] ?? 'replace'));

if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing member_id"
    ]);
    exit;
}

if ($points === null && $cashBalance === null) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing points or cash_balance"
    ]);
    exit;
}

try {
    // First check if wallet exists
    $checkStmt = $conn->prepare("SELECT points, cash_balance FROM wallet WHERE member_id = :member_id");
    $checkStmt->execute([':member_id' => $memberId]);
    $existingWallet = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$existingWallet) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error" => "Wallet not found for member_id: " . $memberId
        ]);
        exit;
    }

    $currentPoints = (int)$existingWallet['points'];
    $currentCash = (float)$existingWallet['cash_balance'];

    // Calculate new values based on action
    $newPoints = $currentPoints;
    $newCash = $currentCash;

    switch ($action) {
        case 'add':
            // Add to existing values
            if ($points !== null) $newPoints = $currentPoints + (int)$points;
            if ($cashBalance !== null) $newCash = $currentCash + (float)$cashBalance;
            break;
            
        case 'subtract':
            // Subtract from existing values
            if ($points !== null) $newPoints = max(0, $currentPoints - (int)$points);
            if ($cashBalance !== null) $newCash = max(0, $currentCash - (float)$cashBalance);
            break;
            
        case 'replace':
        default:
            // Replace existing values (default behavior)
            if ($points !== null) $newPoints = (int)$points;
            if ($cashBalance !== null) $newCash = (float)$cashBalance;
            break;
    }

    // Update the wallet
    $updateStmt = $conn->prepare("
        UPDATE wallet 
        SET points = :points,
            cash_balance = :cash_balance
        WHERE member_id = :member_id
    ");

    $updateStmt->execute([
        ':points' => $newPoints,
        ':cash_balance' => $newCash,
        ':member_id' => $memberId
    ]);

    echo json_encode([
        "success" => true,
        "message" => "Points and cash balance updated successfully",
        "action" => $action,
        "previous" => [
            "points" => $currentPoints,
            "cash_balance" => $currentCash
        ],
        "new" => [
            "points" => $newPoints,
            "cash_balance" => $newCash
        ]
    ]);

} catch (PDOException $e) {
    error_log("update_points.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Database error: " . $e->getMessage()
    ]);
}
