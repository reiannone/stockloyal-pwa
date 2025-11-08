<?php
// api/_loadenv.php
// Purpose: populate $_ENV for DB/app config. No headers, no output, no CORS here.

// 0) Helper: load a simple KEY=VALUE file into $_ENV
function __load_dotenv_file(string $path): void {
    if (!is_file($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        [$k, $v] = array_map('trim', explode('=', $line, 2));
        // Strip surrounding quotes
        if ((str_starts_with($v, '"') && str_ends_with($v, '"')) ||
            (str_starts_with($v, "'") && str_ends_with($v, "'"))) {
            $v = substr($v, 1, -1);
        }
        $_ENV[$k] = $v;
    }
}

// 1) Server bootstrap (Lightsail/EC2)
// Prefer a PHP file that sets variables like $DB_HOST, $DB_NAME, etc.
// (You already have ~/stockloyal_bootstrap.php on the server.)
$serverBootstrap = '/home/bitnami/stockloyal_bootstrap.php';
if (is_file($serverBootstrap)) {
    /** @noinspection PhpIncludeInspection */
    require_once $serverBootstrap;

    // Mirror common vars to $_ENV if they were defined by the bootstrap
    foreach ([
        'DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASS',
        'APP_ENV','APP_ORIGIN','RDS_CA','MYSQL_ATTR_SSL_CA'
    ] as $k) {
        if (isset($$k)) { $_ENV[$k] = (string)($$k); }
    }
    // Done for server case
    return;
}

// 2) Local dev: load .env.development if APP_ENV=development, else .env.production
$appEnv = getenv('APP_ENV');
if ($appEnv === false || $appEnv === '') $appEnv = 'production';
$envPath = __DIR__ . ($appEnv === 'development' ? '/.env.development' : '/.env.production');
if (!is_file($envPath)) {
    // Fallback: try plain .env if specific file is missing
    $envPath = __DIR__ . '/.env';
}
__load_dotenv_file($envPath);

// 3) Ensure APP_ENV at least exists
$_ENV['APP_ENV'] = $_ENV['APP_ENV'] ?? $appEnv;
