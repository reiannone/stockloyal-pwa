<?php 
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
$memberId     = $input['member_id']    ?? '';
$memberEmail  = $input['member_email'] ?? '';
$password     = $input['password']     ?? '';

error_log("create_member.php: Received JSON -> memberId=$memberId, memberEmail=$memberEmail");

if (!$memberId) {
    http_response_code(400);
    $msg = "Missing required field: member_id";
    error_log("create_member.php: $msg");
    echo json_encode([
        "success" => false,
        "error"   => $msg
    ]);
    exit;
}

if (!$memberEmail) {
    http_response_code(400);
    $msg = "Missing required field: member_email";
    error_log("create_member.php: $msg");
    echo json_encode([
        "success" => false,
        "error"   => $msg
    ]);
    exit;
}

// ✅ Only check password once both ID + Email are present
if (!$password) {
    http_response_code(400);
    $msg = "Missing required field: password";
    error_log("create_member.php: $msg");
    echo json_encode([
        "success" => false,
        "error"   => $msg
    ]);
    exit;
}

try {
    // 🔐 Use bcrypt one-way hashing for member login
    $memberPasswordHash = password_hash($password, PASSWORD_BCRYPT);

    $conn->beginTransaction();

    // ✅ Check if member_id already exists
    $checkIdSql = "SELECT COUNT(*) FROM wallet WHERE member_id = :member_id";
    $checkIdStmt = $conn->prepare($checkIdSql);
    $checkIdStmt->execute([':member_id' => $memberId]);

    error_log("create_member.php, check member id: $memberId");
    error_log("create_member.php, check member email: $memberEmail");

    if ($checkIdStmt->fetchColumn() > 0) {
        $conn->rollBack();
        $msg = "Member ID already exists: $memberId";
        error_log("create_member.php: $msg");
        echo json_encode(["success" => false, "error" => $msg]);
        exit;
    }

    // ✅ Check if member_email already exists
    $checkEmailSql = "SELECT COUNT(*) FROM wallet WHERE member_email = :member_email";
    $checkEmailStmt = $conn->prepare($checkEmailSql);
    $checkEmailStmt->execute([':member_email' => $memberEmail]);

    if ($checkEmailStmt->fetchColumn() > 0) {
        $conn->rollBack();
        $msg = "Email already exists: $memberEmail";
        error_log("create_member.php: $msg");
        echo json_encode(["success" => false, "error" => $msg]);
        exit;
    }

    // Insert new member
    $sql = "
        INSERT INTO wallet (member_id, member_email, member_password_hash, created_at, updated_at)
        VALUES (:member_id, :member_email, :member_password_hash, NOW(), NOW())
    ";
    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':member_id'           => $memberId,
        ':member_email'        => $memberEmail,
        ':member_password_hash'=> $memberPasswordHash
    ]);

    $conn->commit();

    error_log("create_member.php: Inserted new wallet row for member_id=$memberId");

    echo json_encode([
        "success"       => true,
        "member_id"     => $memberId,
        "member_email"  => $memberEmail
    ]);

} catch (Exception $e) {
    $conn->rollBack();
    $errMsg = "create_member.php error: " . $e->getMessage();
    error_log($errMsg);
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
