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
 * get-member-picks.php
 * Fetch member's saved stock picks for StockPicker display and batch processing
 */

try {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    $memberId = isset($input['member_id']) ? trim((string)$input['member_id']) : '';
    $activeOnly = isset($input['active_only']) ? (bool)$input['active_only'] : true;
    $limit = isset($input['limit']) ? min((int)$input['limit'], 100) : 50;

    if (empty($memberId)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid member_id"]);
        exit;
    }

    $sql = "SELECT 
                id,
                symbol,
                allocation_pct,
                priority,
                is_active,
                created_at,
                updated_at
            FROM member_stock_picks
            WHERE member_id = :member_id";
    
    if ($activeOnly) {
        $sql .= " AND is_active = 1";
    }
    
    $sql .= " ORDER BY priority DESC, created_at ASC LIMIT :lim";

    $stmt = $conn->prepare($sql);
    $stmt->bindValue(':member_id', $memberId, PDO::PARAM_STR);
    $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $picks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Calculate total allocation for validation
    $totalAllocation = 0.0;
    $hasCustomAllocation = false;
    foreach ($picks as $pick) {
        if ($pick['allocation_pct'] !== null) {
            $hasCustomAllocation = true;
            $totalAllocation += (float)$pick['allocation_pct'];
        }
    }

    echo json_encode([
        "success" => true,
        "picks" => $picks,
        "count" => count($picks),
        "total_allocation" => $hasCustomAllocation ? round($totalAllocation, 2) : null,
        "has_custom_allocation" => $hasCustomAllocation
    ]);

} catch (PDOException $e) {
    error_log("get-member-picks.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database error"]);
} catch (Exception $e) {
    error_log("get-member-picks.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error"]);
}
