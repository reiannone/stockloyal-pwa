<?php
require_once __DIR__ . '/cors.php';
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/create_member.php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

ini_set('log_errors', 1);
ini_set('error_log', 'C:/xampp/php/logs/php_error_log');

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

error_log("create_member.php: STARTED");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // $conn is PDO + ENCRYPTION_KEY/IV

$input        = json_decode(file_get_contents("php://input"), true);
$memberId     = trim($input['member_id']    ?? '');
$memberEmail  = trim($input['member_email'] ?? '');
$password     = $input['password']          ?? '';

error_log("create_member.php: Received JSON -> memberId=$memberId, memberEmail=$memberEmail");

if (!$memberId) {
    http_response_code(400);
    $msg = "Missing required field: member_id";
    error_log("create_member.php: $msg");
    echo json_encode(["success" => false, "error" => $msg]);
    exit;
}

if (!$memberEmail) {
    http_response_code(400);
    $msg = "Missing required field: member_email";
    error_log("create_member.php: $msg");
    echo json_encode(["success" => false, "error" => $msg]);
    exit;
}

if (!$password) {
    http_response_code(400);
    $msg = "Missing required field: password";
    error_log("create_member.php: $msg");
    echo json_encode(["success" => false, "error" => $msg]);
    exit;
}

// ✅ Enforce basic password policy
if (strlen($password) < 8) {
    http_response_code(400);
    $msg = "Password must be at least 8 characters long";
    error_log("create_member.php: $msg");
    echo json_encode(["success" => false, "error" => $msg]);
    exit;
}

try {
    // 🔐 Use PASSWORD_DEFAULT (bcrypt now, Argon2 in future PHP releases)
    $memberPasswordHash = password_hash($password, PASSWORD_DEFAULT);

    $conn->beginTransaction();

    // ✅ Check if member_id already exists
    $checkIdStmt = $conn->prepare("SELECT COUNT(*) FROM wallet WHERE member_id = :member_id");
    $checkIdStmt->execute([':member_id' => $memberId]);

    if ($checkIdStmt->fetchColumn() > 0) {
        $conn->rollBack();
        $msg = "Member ID already exists: $memberId";
        error_log("create_member.php: $msg");
        echo json_encode(["success" => false, "error" => $msg]);
        exit;
    }

    // ✅ Check if member_email already exists
    $checkEmailStmt = $conn->prepare("SELECT COUNT(*) FROM wallet WHERE member_email = :member_email");
    $checkEmailStmt->execute([':member_email' => $memberEmail]);

    if ($checkEmailStmt->fetchColumn() > 0) {
        $conn->rollBack();
        $msg = "Email already exists: $memberEmail";
        error_log("create_member.php: $msg");
        echo json_encode(["success" => false, "error" => $msg]);
        exit;
    }

    // ✅ Insert new member row
    $stmt = $conn->prepare("
        INSERT INTO wallet (
            member_id, 
            member_email, 
            member_password_hash, 
            created_at, 
            updated_at
        ) VALUES (
            :member_id, 
            :member_email, 
            :member_password_hash, 
            NOW(), 
            NOW()
        )
    ");

    $stmt->execute([
        ':member_id'            => $memberId,
        ':member_email'         => $memberEmail,
        ':member_password_hash' => $memberPasswordHash
    ]);

    $conn->commit();

    error_log("create_member.php: Inserted new wallet row for member_id=$memberId");

    echo json_encode([
        "success"      => true,
        "member_id"    => $memberId,
        "member_email" => $memberEmail
    ]);

} catch (Exception $e) {
    $conn->rollBack();
    $errMsg = "create_member.php error: " . $e->getMessage();
    error_log($errMsg);
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
