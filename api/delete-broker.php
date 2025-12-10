<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

// api/delete-broker.php
// Delete broker_master record by broker_id

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode([
            "success" => false,
            "error"   => "Method not allowed",
        ]);
        exit;
    }

    $raw = file_get_contents("php://input");
    $input = json_decode($raw, true);

    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Invalid JSON payload",
        ]);
        exit;
    }

    $broker_id = trim($input['broker_id'] ?? '');

    if ($broker_id === '') {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "broker_id is required",
        ]);
        exit;
    }

    $sql = "DELETE FROM broker_master WHERE broker_id = :broker_id";
    $stmt = $conn->prepare($sql);
    $stmt->bindValue(':broker_id', $broker_id, PDO::PARAM_STR);
    $stmt->execute();

    $rowCount = $stmt->rowCount();

    if ($rowCount > 0) {
        echo json_encode([
            "success" => true,
            "message" => "Broker deleted",
            "broker_id" => $broker_id,
        ]);
    } else {
        echo json_encode([
            "success" => false,
            "error"   => "Broker not found",
        ]);
    }

} catch (Exception $e) {
    error_log("delete-broker.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage(),
    ]);
}
