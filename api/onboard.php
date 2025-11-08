<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/onboard.php

// Allow cross-origin requests and specify JSON response type
// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// Include the shared database configuration
require_once 'config.php';

// Read the JSON payload sent from the frontend
$input = json_decode(file_get_contents("php://input"), true);

// Extract the 'name' field
$name = $input['name'] ?? null;

// Validate input
if (!$name) {
    http_response_code(400);
    echo json_encode(["error" => "Missing 'name' field"]);
    exit;
}

try {
    // Prepare the SQL statement
    $sql = "INSERT INTO members (name, created_at) VALUES (:name, NOW())";
    $stmt = $conn->prepare($sql);
    $stmt->bindParam(':name', $name);

    // Execute insertion
    if ($stmt->execute()) {
        $memberId = $conn->lastInsertId();
        echo json_encode(["success" => true, "member_id" => $memberId]);
    } else {
        throw new Exception("Database insertion failed");
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server error: " . $e->getMessage()]);
}
