<?php
// api/cors.php
declare(strict_types=1);

// Defensive: clear any prior headers added by framework/server
foreach ([
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Credentials',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers',
  'Access-Control-Max-Age',
  'Access-Control-Expose-Headers',
] as $h) { header_remove($h); }

// Allow only known origins (no wildcards when using credentials)
$allowedOrigins = [
  'http://localhost:5173',
  'https://localhost:5173',
  'https://app.stockloyal.com',
  'https://stockloyal.com', // ok if your app sometimes runs on apex then redirects
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$isAllowed = in_array($origin, $allowedOrigins, true);

if ($isAllowed) {
  header("Access-Control-Allow-Origin: {$origin}");
  header('Access-Control-Allow-Credentials: true'); // needed for cookies/auth
  header('Vary: Origin'); // so caches split by Origin
}

// Methods you support
$allowedMethods = 'GET, POST, OPTIONS';

// Allow requested headers precisely (safer than hardcoding *)
$reqHeaders = $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? '';
$allowedHeaders = $reqHeaders ?: 'Content-Type, Authorization, X-Requested-With';

header("Access-Control-Allow-Methods: {$allowedMethods}");
header("Access-Control-Allow-Headers: {$allowedHeaders}");
header('Access-Control-Max-Age: 86400'); // cache preflight 24h

// Optional: expose any custom response headers your frontend needs to read
header('Access-Control-Expose-Headers: X-Request-Id, X-RateLimit-Remaining');

// Short-circuit preflight early
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  // If origin not allowed, still return 204 (quiet) but without ACAO to avoid leaking
  http_response_code(204);
  exit;
}
