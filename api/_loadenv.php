<?php
// api/_loadenv.php
declare(strict_types=1);

$appEnv = getenv('APP_ENV');
if ($appEnv === false || $appEnv === '') $appEnv = 'production';

$envFile = __DIR__ . ($appEnv === 'development' ? '/.env' : '/.env.production');

if (!is_file($envFile)) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(500);
    echo json_encode(["success"=>false,"error"=>"Missing env file: $envFile"]);
    exit;
}

foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] === '#') continue;
    if (strpos($line, '=') === false) continue;
    [$k, $v] = array_map('trim', explode('=', $line, 2));
    $_ENV[$k] = $v;
}
