<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

require_once 'config.php';

/**
 * save-member-pick.php
 * Add or update a member's stock pick (upsert on member_id + symbol)
 */

try {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    
    $memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id']) : '';
    $symbol = isset($input['symbol']) ? strtoupper(trim($input['symbol'])) : '';
    $allocationPct = isset($input['allocation_pct']) && $input['allocation_pct'] !== '' 
        ? (float)$input['allocation_pct'] 
        : null;
    $priority = isset($input['priority']) ? (int)$input['priority'] : 0;
    $isActive = isset($input['is_active']) ? (bool)$input['is_active'] : true;

    // Validation
    if (empty($memberId)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid member_id"]);
        exit;
    }

    if (empty($symbol) || strlen($symbol) > 20) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid symbol"]);
        exit;
    }

    // Validate allocation_pct if provided
    if ($allocationPct !== null && ($allocationPct < 0 || $allocationPct > 100)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Allocation must be between 0 and 100"]);
        exit;
    }

    // Check max picks limit (prevent abuse)
    $maxPicks = 50;
    $stmt = $conn->prepare("SELECT COUNT(*) FROM member_stock_picks WHERE member_id = :member_id AND is_active = 1");
    $stmt->execute([':member_id' => $memberId]);
    $currentCount = (int)$stmt->fetchColumn();

    // Check if this symbol already exists for member
    $stmt = $conn->prepare("SELECT id FROM member_stock_picks WHERE member_id = :member_id AND symbol = :symbol");
    $stmt->execute([':member_id' => $memberId, ':symbol' => $symbol]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing && $currentCount >= $maxPicks) {
        http_response_code(400);
        echo json_encode([
            "success" => false, 
            "error" => "Maximum of {$maxPicks} active picks allowed"
        ]);
        exit;
    }

    // Upsert: INSERT ... ON DUPLICATE KEY UPDATE
    $sql = "INSERT INTO member_stock_picks 
                (member_id, symbol, allocation_pct, priority, is_active, created_at, updated_at)
            VALUES 
                (:member_id, :symbol, :allocation_pct, :priority, :is_active, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                allocation_pct = VALUES(allocation_pct),
                priority = VALUES(priority),
                is_active = VALUES(is_active),
                updated_at = NOW()";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':member_id' => $memberId,
        ':symbol' => $symbol,
        ':allocation_pct' => $allocationPct,
        ':priority' => $priority,
        ':is_active' => $isActive ? 1 : 0
    ]);

    $pickId = $existing ? (int)$existing['id'] : (int)$conn->lastInsertId();
    $action = $existing ? 'updated' : 'created';

    echo json_encode([
        "success" => true,
        "action" => $action,
        "pick_id" => $pickId,
        "symbol" => $symbol,
        "message" => "Pick {$action} successfully"
    ]);

} catch (PDOException $e) {
    error_log("save-member-pick.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database error"]);
} catch (Exception $e) {
    error_log("save-member-pick.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error"]);
}

