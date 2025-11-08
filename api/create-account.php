<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/create-account.php

// Enable PHP error reporting for local development (disable in production)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

// Parse incoming request
$input = json_decode(file_get_contents('php://input'), true);
$memberId = trim($input['member_id'] ?? '');
$password = $input['password'] ?? '';

if (!$memberId || !$password) {
    http_response_code(400);
    $msg = "Missing required fields: member_id={$memberId}, password=" . ($password ? '***' : '');
    error_log("create-account.php: $msg");
    echo json_encode(["success" => false, "error" => $msg]);
    exit;
}

try {
    // Check if user already exists
    $stmt = $conn->prepare("SELECT COUNT(*) FROM wallet WHERE member_id = :member_id");
    $stmt->execute([':member_id' => $memberId]);

    if ($stmt->fetchColumn() > 0) {
        $msg = "Member ID '{$memberId}' already exists";
        error_log("create-account.php: $msg");
        http_response_code(409);
        echo json_encode(["success" => false, "error" => $msg]);
        exit;
    }
} catch (Exception $e) {
    $err = "Error checking existing user: " . $e->getMessage();
    error_log("create-account.php: $err");
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $err]);
    exit;
}

// Hash password securely
$passwordHash = password_hash($password, PASSWORD_BCRYPT);
$createdAt = date('Y-m-d H:i:s');

try {
    $conn->beginTransaction();

    // 1. Insert into wallet
    $sqlWallet = "INSERT INTO wallet (member_id, password_hash, created_at, broker)
                  VALUES (:member_id, :password_hash, :created_at, :broker)";
    $stmtWallet = $conn->prepare($sqlWallet);
    $stmtWallet->execute([
        ':member_id'    => $memberId,
        ':password_hash'=> $passwordHash,
        ':created_at'   => $createdAt,
        ':broker'       => 'unlinked'
    ]);
    error_log("create-account.php: wallet row created for {$memberId}");

    // 2. Insert broker_credentials stub
    $sqlCreds = "INSERT INTO broker_credentials (member_id, broker, username, encrypted_password, updated_at)
                 VALUES (:member_id, 'unlinked', '', '', NOW())";
    $stmtCreds = $conn->prepare($sqlCreds);
    $stmtCreds->execute([ ':member_id' => $memberId ]);
    error_log("create-account.php: broker_credentials stub created for {$memberId}");

    $conn->commit();

    // ✅ Always return success + member_id
    echo json_encode([
        "success"   => true,
        "member_id" => $memberId
    ]);
} catch (Exception $e) {
    $conn->rollBack();
    $err = "Server error: " . $e->getMessage();
    error_log("create-account.php: $err");
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $err]);
}
