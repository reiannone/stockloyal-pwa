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
 * get-sweep-picks.php
 * For batch/sweep processing: Returns active picks with calculated allocations
 * Used by monthly sweep and reinvestment batch jobs
 */

try {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    
    $memberId = isset($input['member_id']) ? trim((string)$input['member_id']) : '';
    $sweepAmount = isset($input['sweep_amount']) ? (float)$input['sweep_amount'] : 0;

    // Validation
    if (empty($memberId)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid member_id"]);
        exit;
    }

    // Get active picks ordered by priority
    $sql = "SELECT 
                id,
                symbol,
                allocation_pct,
                priority
            FROM member_stock_picks
            WHERE member_id = :member_id AND is_active = 1
            ORDER BY priority DESC, created_at ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute([':member_id' => $memberId]);
    $picks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($picks)) {
        echo json_encode([
            "success" => true,
            "picks" => [],
            "count" => 0,
            "has_picks" => false,
            "message" => "No active picks found for member"
        ]);
        exit;
    }

    // Calculate allocations
    $hasCustomAllocation = false;
    $totalCustom = 0.0;
    
    foreach ($picks as $pick) {
        if ($pick['allocation_pct'] !== null) {
            $hasCustomAllocation = true;
            $totalCustom += (float)$pick['allocation_pct'];
        }
    }

    // Build response with calculated amounts
    $result = [];
    $count = count($picks);
    
    foreach ($picks as $pick) {
        $allocation = 0.0;
        $amount = null;

        if ($hasCustomAllocation) {
            // Use custom allocation (normalize to 100% if total != 100)
            $pct = (float)($pick['allocation_pct'] ?? 0);
            if ($totalCustom > 0 && $totalCustom != 100) {
                // Normalize
                $allocation = ($pct / $totalCustom) * 100;
            } else {
                $allocation = $pct;
            }
        } else {
            // Equal split
            $allocation = 100.0 / $count;
        }

        // Calculate dollar amount if sweep_amount provided
        if ($sweepAmount > 0) {
            $amount = round(($allocation / 100) * $sweepAmount, 2);
        }

        $result[] = [
            'pick_id' => (int)$pick['id'],
            'symbol' => $pick['symbol'],
            'allocation_pct' => round($allocation, 2),
            'priority' => (int)$pick['priority'],
            'amount' => $amount
        ];
    }

    echo json_encode([
        "success" => true,
        "picks" => $result,
        "count" => $count,
        "has_picks" => true,
        "has_custom_allocation" => $hasCustomAllocation,
        "sweep_amount" => $sweepAmount > 0 ? $sweepAmount : null,
        "total_amount" => $sweepAmount > 0 ? array_sum(array_column($result, 'amount')) : null
    ]);

} catch (PDOException $e) {
    error_log("get-sweep-picks.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database error"]);
} catch (Exception $e) {
    error_log("get-sweep-picks.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error"]);
}
