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
 * remove-member-pick.php
 * Remove a member's stock pick (soft delete by default, hard delete optional)
 */

try {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    
    $memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id']) : '';
    $symbol = isset($input['symbol']) ? strtoupper(trim($input['symbol'])) : '';
    $hardDelete = isset($input['hard_delete']) ? (bool)$input['hard_delete'] : false;

    // Validation
    if (empty($memberId)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid member_id"]);
        exit;
    }

    if (empty($symbol)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Symbol required"]);
        exit;
    }

    if ($hardDelete) {
        // Permanent delete
        $sql = "DELETE FROM member_stock_picks WHERE member_id = :member_id AND symbol = :symbol";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':member_id' => $memberId, ':symbol' => $symbol]);
        $action = 'deleted';
    } else {
        // Soft delete (set is_active = 0)
        $sql = "UPDATE member_stock_picks 
                SET is_active = 0, updated_at = NOW() 
                WHERE member_id = :member_id AND symbol = :symbol";
        $stmt = $conn->prepare($sql);
        $stmt->execute([':member_id' => $memberId, ':symbol' => $symbol]);
        $action = 'deactivated';
    }

    $affected = $stmt->rowCount();

    if ($affected === 0) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error" => "Pick not found"
        ]);
        exit;
    }

    echo json_encode([
        "success" => true,
        "action" => $action,
        "symbol" => $symbol,
        "message" => "Pick {$action} successfully"
    ]);

} catch (PDOException $e) {
    error_log("remove-member-pick.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database error"]);
} catch (Exception $e) {
    error_log("remove-member-pick.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error"]);
}

