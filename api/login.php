<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/login.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

error_log("login.php: REQUEST_METHOD = " . $_SERVER['REQUEST_METHOD']);
error_log("login.php: CONTENT_TYPE = " . ($_SERVER['CONTENT_TYPE'] ?? 'none'));
error_log("login.php: POST = " . print_r($_POST, true));

$input = json_decode(file_get_contents("php://input"), true);
$memberId = trim($input['member_id'] ?? "");
$password = $input['password'] ?? "";

error_log("login.php: memberId = " . $memberId);
error_log("login.php: password = " . $password);

// ✅ Ensure memberId is provided
if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Member ID is required"
    ]);
    exit;
}

try {
    $stmt = $conn->prepare("
        SELECT member_id, member_email, member_password_hash 
        FROM wallet 
        WHERE member_id = :member_id 
        LIMIT 1
    ");
    $stmt->execute([':member_id' => $memberId]);
    $user = $stmt->fetch();

    if (!$user) {
        // ❌ Case 1: member not found
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error"   => "No account found for this Member ID"
        ]);
        exit;
    }

    if (!$password) {
        // ❌ Case 2: password missing (but member exists)
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Password is required"
        ]);
        exit;
    }

    if (password_verify($password, $user['member_password_hash'])) {
        // ✅ Case 3: success
        $update = $conn->prepare("
            UPDATE wallet 
            SET last_login = NOW() 
            WHERE member_id = :member_id
        ");
        $update->execute([':member_id' => $memberId]);

        http_response_code(200);
        echo json_encode([
            "success"      => true,
            "member_id"    => $user['member_id'],
            "member_email" => $user['member_email'] ?? null
        ]);
    } else {
        // 🚫 Case 4: bad password
        http_response_code(401);
        echo json_encode([
            "success" => false,
            "error"   => "Invalid password"
        ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
