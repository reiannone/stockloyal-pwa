<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// my-picks.php
// Returns the list of symbols this specific member has previously purchased
// Ordered by number of times purchased (most frequent first)

header("Content-Type: application/json");

require_once "config.php"; // provides $conn as PDO instance

$input = json_decode(file_get_contents("php://input"), true);
$member_id = $input['member_id'] ?? null;
$limit = isset($input['limit']) ? (int)$input['limit'] : 50;

if (!$member_id) {
    echo json_encode(["success" => false, "error" => "member_id is required"]);
    exit;
}

// Clamp limit
if ($limit < 1) $limit = 1;
if ($limit > 100) $limit = 100;

try {
    // Get member's purchased symbols from orders table
    // Aggregates by symbol and counts purchases, ordered by most purchased first
    $stmt = $conn->prepare("
        SELECT 
            symbol,
            COUNT(*) as purchases,
            MAX(placed_at) as last_purchased
        FROM orders
        WHERE member_id = ?
          AND symbol IS NOT NULL
          AND symbol != ''
          AND status IN ('completed', 'confirmed', 'pending', 'Pending', 'executed', 'placed')
        GROUP BY symbol
        ORDER BY purchases DESC, last_purchased DESC
        LIMIT " . (int)$limit . "
    ");
    $stmt->execute([$member_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "success" => true,
        "member_id" => $member_id,
        "count" => count($rows),
        "rows" => $rows
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
