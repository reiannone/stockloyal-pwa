<?php
declare(strict_types=1); 
// api/config.php

// --------------------------------------------------
// 1. Pick the correct env file
// --------------------------------------------------

// Decide environment from APP_ENV (preferred) or fallback
$appEnv = getenv('APP_ENV') ?: 'production';

// Explicit choice
if ($appEnv === 'development') {
    $envFile = __DIR__ . '/';
} else {
    $envFile = __DIR__ . '/';
}

// --------------------------------------------------
// 2. Load environment variables
// --------------------------------------------------
if (!file_exists($envFile)) {
    error_log("[config.php] : " . $envFile);
    http_response_code(500);
    die(json_encode([
        "success" => false,
        "error"   => "Server misconfigured (missing env)"
    ]));
}

$lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
foreach ($lines as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] === '#') continue;
    if (strpos($line, '=') === false) continue;
    list($name, $value) = array_map('trim', explode('=', $line, 2));
    $_ENV[$name] = $value;
}

error_log("[config.php] Loaded env file: " . basename($envFile));

// --------------------------------------------------
// 3. Debug endpoint (only when explicitly requested)
// --------------------------------------------------
if ($appEnv === 'development' && isset($_GET['debug']) && $_GET['debug'] == '1') {
    header("Content-Type: application/json");
    echo json_encode([
        "success"   => true,
        "env_file"  => basename($envFile),
        "db_host"   => $_ENV['DB_HOST'] ?? 'not set',
        "db_user"   => $_ENV['DB_USER'] ?? 'not set'
    ]);
    exit;
}

// --------------------------------------------------
// 4. Database connection
// --------------------------------------------------
$dbHost = $_ENV['DB_HOST'] ?? '127.0.0.1';
$dbName = $_ENV['DB_NAME'] ?? '';
$dbUser = $_ENV['DB_USER'] ?? '';
$dbPass = $_ENV['DB_PASS'] ?? '';
$dbPort = $_ENV['DB_PORT'] ?? '3306';

try {
    $dsn = "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4";
    $conn = new PDO($dsn, $dbUser, $dbPass);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $ex) {
    error_log("[config.php] DB connection failed: " . $ex->getMessage());
    http_response_code(500);
    die(json_encode([
        "success" => false,
        "error"   => "Database connection failed"
    ]));
}

// --------------------------------------------------
// 5. Encryption settings
// --------------------------------------------------
if (!defined('ENCRYPTION_KEY')) {
    define('ENCRYPTION_KEY', $_ENV['ENCRYPTION_KEY'] ?? 'changeme32charstringchangeme32char');
}
if (!defined('ENCRYPTION_IV')) {
    define('ENCRYPTION_IV', $_ENV['ENCRYPTION_IV'] ?? 'changeme16charIV');
}
