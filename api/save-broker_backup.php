<?php
declare(strict_types=1);
// api/save-broker.php

// Allow cross-origin requests and preflight (CORS) handling
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true);
$memberId = $input['member_id'] ?? null;
$broker = $input['broker'] ?? null;

// Example test values (remove or replace in production)
$memberId = "testmember5";
$broker = "Public";
$memberName = "testname5";
$points = 2016;
$cash_balance = 50.25;
$portfolio_value = 1234.56;
$created_at = date("Y-m-d H:i:s");

if (!$memberId || !$broker) {
    http_response_code(400);
    echo json_encode(["error" => "Missing required fields: member_id and broker"]);
    exit;
}

try {
    // Step 1: Check if member already exists
    $checkSql = "SELECT COUNT(*) FROM wallet WHERE member_id = :memberid";
    $checkStmt = $conn->prepare($checkSql);
    $checkStmt->execute([':memberid' => $memberId]);
    $exists = $checkStmt->fetchColumn() > 0;

    if ($exists) {
        // Step 2A: Update existing record
        $sql = "
            UPDATE wallet
            SET name = :name,
                points = :points,
                cash_balance = :cash_balance,
                portfolio_value = :portfolio_value,
                broker = :broker
            WHERE member_id = :memberid
        ";
    } else {
        // Step 2B: Insert new record
        $sql = "
            INSERT INTO wallet (member_id, name, points, cash_balance, portfolio_value, broker, created_at)
            VALUES (:memberid, :name, :points, :cash_balance, :portfolio_value, :broker, :created_at)
        ";
    }

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':memberid'        => $memberId,
        ':name'            => $memberName,
        ':points'          => $points,
        ':cash_balance'    => $cash_balance,
        ':portfolio_value' => $portfolio_value,
        ':broker'          => $broker,
        ':created_at'      => $created_at
    ]);

    echo json_encode(["success" => true, "updated" => $exists]);
}
catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => "Server error: " . $e->getMessage()]);
}
