<?php
// Allow only known origins (add any others you need)
$allowedOrigins = [
  'http://localhost:5173',
  'https://localhost:5173',
  'https://app.stockloyal.com',
  'https://stockloyal.com',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin"); // <-- not *
    header('Vary: Origin');                         // let caches vary by Origin
    header('Access-Control-Allow-Credentials: true');
} else {
    // Optionally, don’t set ACAO at all, or set your prod app domain.
    // header('Access-Control-Allow-Origin: https://app.stockloyal.com');
}

// Allow typical methods/headers
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400'); // cache preflight for a day

// Handle preflight quickly
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
