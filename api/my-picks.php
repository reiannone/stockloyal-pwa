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
 * my-picks.php
 * Fetch member's saved stock picks from member_stock_picks table
 * Returns symbols for StockPicker "My Picks" category display
 */

try {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    $memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : '';
    $limit = isset($input['limit']) ? min((int)$input['limit'], 100) : 50;

    if (empty($memberId)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid member_id"]);
        exit;
    }

    // Query from the junction table - active picks only
    $sql = "SELECT 
                symbol,
                allocation_pct,
                priority,
                created_at,
                updated_at
            FROM member_stock_picks
            WHERE member_id = :member_id AND is_active = 1
            ORDER BY priority DESC, created_at ASC
            LIMIT :lim";

    $stmt = $conn->prepare($sql);
    $stmt->bindValue(':member_id', $memberId, PDO::PARAM_STR);
    $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Format response to match expected structure in StockPicker.jsx
    $formattedRows = array_map(function($row) {
        return [
            'symbol' => $row['symbol'],
            'allocation_pct' => $row['allocation_pct'],
            'priority' => (int)$row['priority'],
            'created_at' => $row['created_at']
        ];
    }, $rows);

    echo json_encode([
        "success" => true,
        "rows" => $formattedRows,
        "count" => count($formattedRows)
    ]);

} catch (PDOException $e) {
    error_log("my-picks.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database error"]);
} catch (Exception $e) {
    error_log("my-picks.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error"]);
}

