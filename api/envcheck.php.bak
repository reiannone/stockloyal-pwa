<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$appEnv = getenv('APP_ENV') ?: '';
$envFile = __DIR__ . ($appEnv === 'development' ? '/' : '/');

echo json_encode([
  'APP_ENV' => $appEnv,
  'using_env_file' => $envFile,
  'DB_HOST' => getenv('DB_HOST') ?: '(not set)',
  'DB_NAME' => getenv('DB_NAME') ?: '(not set)',
  'DB_USER' => getenv('DB_USER') ?: '(not set)',
  'DB_PORT' => getenv('DB_PORT') ?: '(not set)',
  'DB_SSL_MODE' => getenv('DB_SSL_MODE') ?: '(not set)',
], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
