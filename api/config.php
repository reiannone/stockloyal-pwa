<?php
// api/config.php

$dbHost = '127.0.0.1';
$dbName = 'stockloyal';
$dbUser = 'root';
$dbPass = '';

try {
    $conn = new PDO("mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $ex) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "DB connection failed: " . $ex->getMessage()]);
    exit;
}

// --- Encryption settings ---
// Replace these dummy values with secure random ones in production
// AES-256-CBC requires a 32-byte key and a 16-byte IV
if (!defined('ENCRYPTION_KEY')) {
    define('ENCRYPTION_KEY', '***REMOVED***'); // 32 chars
}
if (!defined('ENCRYPTION_IV')) {
    define('ENCRYPTION_IV', '***REMOVED***'); // 16 chars
}
