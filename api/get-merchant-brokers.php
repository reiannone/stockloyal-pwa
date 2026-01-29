<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// get-merchant-brokers.php
// Returns the list of broker IDs assigned to a specific merchant

header("Content-Type: application/json");

require_once "config.php"; // provides $conn as PDO instance

$input = json_decode(file_get_contents("php://input"), true);
$merchant_id = $input['merchant_id'] ?? null;

if (!$merchant_id) {
    echo json_encode(["success" => false, "error" => "merchant_id is required"]);
    exit;
}

try {
    // Get all broker IDs assigned to this merchant
    $stmt = $conn->prepare("
        SELECT broker_id 
        FROM merchant_brokers 
        WHERE merchant_id = ?
        ORDER BY broker_id
    ");
    $stmt->execute([$merchant_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode([
        "success" => true,
        "merchant_id" => $merchant_id,
        "broker_ids" => $rows
    ]);

} catch (PDOException $e) {
    // Table might not exist yet - return empty array
    if (strpos($e->getMessage(), "doesn't exist") !== false) {
        echo json_encode([
            "success" => true,
            "merchant_id" => $merchant_id,
            "broker_ids" => [],
            "note" => "merchant_brokers table not yet created"
        ]);
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
    }
}
