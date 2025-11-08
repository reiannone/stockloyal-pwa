<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$symbol = $_GET['symbol'] ?? null;
$scrId  = $_GET['scrId'] ?? null;

// --- Health check (no params) ---
if (!$symbol && !$scrId) {
    echo json_encode([
        'ok'  => true,
        'msg' => 'api is reachable'
    ]);
    exit;
}

// --- Symbol lookup ---
if ($symbol) {
    $url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" . urlencode($symbol);
    $resp = @file_get_contents($url);
    if ($resp === false) {
        http_response_code(500);
        echo json_encode([
            'ok' => false,
            'error' => 'Failed to fetch symbol'
        ]);
        exit;
    }
    echo $resp;
    exit;
}

// --- Category (scrId) lookup ---
if ($scrId) {
    $url = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=$scrId&count=10";
    $resp = @file_get_contents($url);
    if ($resp === false) {
        http_response_code(500);
        echo json_encode([
            'ok' => false,
            'error' => 'Failed to fetch category'
        ]);
        exit;
    }
    echo $resp;
    exit;
}
