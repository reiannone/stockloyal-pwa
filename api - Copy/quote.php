<?php
// api/quote.php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
require_once 'config.php';

$symbol = $_GET['symbol'] ?? null;
if (!$symbol) {
    http_response_code(400);
    echo json_encode(["error" => "Missing 'symbol'"]);
    exit;
}

// Mock price—replace with real integration as needed
$price = rand(100, 1000) + (rand() / getrandmax());
echo json_encode(["symbol" => strtoupper($symbol), "price" => round($price, 2)]);
