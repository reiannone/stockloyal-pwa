<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/store-broker-credentials.php

// Enable PHP error reporting for local development (disable in production)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Force PHP logs to a known file (XAMPP on Windows)
ini_set('log_errors', 1);
ini_set('error_log', 'C:/xampp/php/logs/php_error_log');

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

error_log("store-broker-credentials.php: STARTED");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

// ✅ Read JSON input
$input      = json_decode(file_get_contents("php://input"), true);
$broker     = $input['broker']      ?? '';
$brokerUrl  = $input['broker_url']  ?? '';   // <-- new
$username   = $input['username']    ?? '';
$password   = $input['password']    ?? '';
$memberId   = strtolower(trim((string)($input['member_id'] ?? '')));

error_log("store-broker-credentials.php: Received JSON -> broker=$broker, brokerUrl=$brokerUrl, username=$username, memberId=$memberId");

if (!$broker || !$username || !$password || !$memberId) {
    http_response_code(400);
    $msg = "Missing required fields: broker=$broker, username=$username, password=" . ($password ? '***' : '') . ", memberId=$memberId";
    error_log("store-broker-credentials.php: $msg");
    echo json_encode(["success" => false, "error" => $msg]);
    exit;
}

try {
    // Encrypt password
    $encrypted = openssl_encrypt($password, 'AES-256-CBC', ENCRYPTION_KEY, 0, ENCRYPTION_IV);

    $conn->beginTransaction();

    // 1. Insert/Update broker_credentials
    $sqlCreds = "INSERT INTO broker_credentials (member_id, broker, username, encrypted_password, updated_at)
                 VALUES (:member_id, :broker, :username, :enc_pass, NOW())
                 ON DUPLICATE KEY UPDATE 
                   broker = VALUES(broker), 
                   username = VALUES(username),
                   encrypted_password = VALUES(encrypted_password),
                   updated_at = NOW()";
    $stmt1 = $conn->prepare($sqlCreds);
    $stmt1->execute([
        ':member_id' => $memberId,
        ':broker'    => $broker,
        ':username'  => $username,
        ':enc_pass'  => $encrypted
    ]);
    error_log("store-broker-credentials.php: broker_credentials row upserted for $memberId with broker=$broker");

    // 2. Update broker + broker_url column in wallet
    $sqlWallet = "UPDATE wallet 
                  SET broker = :broker, broker_url = :broker_url, updated_at = NOW() 
                  WHERE member_id = :member_id";
    $stmt2 = $conn->prepare($sqlWallet);
    $stmt2->execute([
        ':broker'     => $broker,
        ':broker_url' => $brokerUrl,
        ':member_id'  => $memberId
    ]);
    $rowCount = $stmt2->rowCount();
    error_log("store-broker-credentials.php: wallet update affected rows = $rowCount for member_id=$memberId");

    if ($rowCount === 0) {
        error_log("store-broker-credentials.php: No wallet row matched for member_id=$memberId");
    }

    $conn->commit();

    // ✅ Always return success + member_id
    echo json_encode([
        "success"   => true,
        "member_id" => $memberId
    ]);

} catch (Exception $e) {
    $conn->rollBack();
    $errMsg = "Server error: " . $e->getMessage();
    error_log("store-broker-credentials.php: $errMsg");
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $errMsg]);
}
