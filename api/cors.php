<?php
// api/cors.php (include in each endpoint or via a common bootstrap)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
  'https://*.amplifyapp.com',
  'https://app.stockloyal.com',
  'http://localhost:5173'
];
if ($origin && array_reduce($allowed, fn($ok,$p)=>$ok||fnmatch($p,$origin), false)) {
  header("Access-Control-Allow-Origin: $origin");
  header('Access-Control-Allow-Credentials: true');
  header('Vary: Origin');
}
if ($_SERVER['REQUEST_METHOD']==='OPTIONS') {
  header('Access-Control-Allow-Methods: GET,POST,OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  exit;
}
