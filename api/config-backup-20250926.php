<?php
// api/config.php

declare(strict_types=1);

// --- 1) Decide environment (explicit via APP_ENV) ---
$appEnv = getenv('APP_ENV');
if ($appEnv === false || $appEnv === '') {
    $appEnv = 'production';
}
error_log("[config.php] APP_ENV={$appEnv}");

$envFile = __DIR__ . ($appEnv === 'development' ? '/.env' : '/.env.production');

// --- 2) Load environment variables ---
if (!is_file($envFile)) {
    error_log("[config.php] Missing env file: {$envFile}");
    http_response_code(500);
    echo json_encode(["success"=>false, "error"=>"Server misconfigured (missing env)"]);
    exit;
}

foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] === '#') continue;
    if (strpos($line, '=') === false) continue;
    [$name, $value] = array_map('trim', explode('=', $line, 2));
    $_ENV[$name] = $value;
}
error_log("[config.php] Loaded env file: " . basename($envFile));

// --- 3) Debug (only if explicitly requested & in dev) ---
if ($appEnv === 'development' && isset($_GET['debug']) && $_GET['debug'] === '1') {
    header('Content-Type: application/json');
    echo json_encode([
        "success"  => true,
        "env_file" => basename($envFile),
        "db_host"  => $_ENV['DB_HOST'] ?? 'not set',
        "db_user"  => $_ENV['DB_USER'] ?? 'not set',
    ]);
    exit;
}

// --- 4) Database connection ---
$dbHost = $_ENV['DB_HOST'] ?? '127.0.0.1';
$dbName = $_ENV['DB_NAME'] ?? '';
$dbUser = $_ENV['DB_USER'] ?? '';
$dbPass = $_ENV['DB_PASS'] ?? '';
$dbPort = $_ENV['DB_PORT'] ?? '3306';

try {
    $dsn  = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";
    $conn = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $ex) {
    error_log("[config.php] DB connection failed: " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(["success"=>false, "error"=>"DB connection failed: " . $ex->getMessage()]);
    exit;
}

// --- 5) Encryption settings ---
if (!defined('ENCRYPTION_KEY')) {
    define('ENCRYPTION_KEY', $_ENV['ENCRYPTION_KEY'] ?? 'changeme32charstringchangeme32char');
}
if (!defined('ENCRYPTION_IV')) {
    define('ENCRYPTION_IV', $_ENV['ENCRYPTION_IV'] ?? 'changeme16charIV');
}
