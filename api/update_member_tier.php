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
$memberTier = $input['member_tier'] ?? null;

if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing member_id"
    ]);
    exit;
}

if (!$memberTier) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing member_tier"
    ]);
    exit;
}

try {
    // Check if wallet exists
    $checkStmt = $conn->prepare("SELECT member_tier FROM wallet WHERE member_id = :member_id");
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

    $oldTier = $existingWallet['member_tier'];

    // Update the tier
    $updateStmt = $conn->prepare("
        UPDATE wallet 
        SET member_tier = :member_tier
        WHERE member_id = :member_id
    ");

    $updateStmt->execute([
        ':member_tier' => $memberTier,
        ':member_id' => $memberId
    ]);

    echo json_encode([
        "success" => true,
        "message" => "Member tier updated successfully",
        "old_tier" => $oldTier,
        "new_tier" => $memberTier
    ]);

} catch (PDOException $e) {
    error_log("update_member_tier.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Database error: " . $e->getMessage()
    ]);
}
