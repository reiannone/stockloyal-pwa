<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// ===========================================
// api/symbol-lookup.php
// Yahoo Finance single-symbol lookup
// with retry, caching, and fallback
// ===========================================

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS, GET");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

// Health check
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['ping'])) {
    echo json_encode(['ok' => true, 'msg' => 'symbol-lookup reachable']);
    exit;
}

// Parse input
$raw = @file_get_contents("php://input");
$input = json_decode($raw, true);
$symbol = strtoupper(trim($input['symbol'] ?? ($_POST['symbol'] ?? '')));
if (!$symbol) {
    echo json_encode(["success" => false, "error" => "Missing symbol"]);
    exit;
}

// Cache setup (2 minutes)
$cacheDir = __DIR__ . "/cache";
if (!is_dir($cacheDir)) mkdir($cacheDir, 0777, true);
$cacheFile = $cacheDir . "/quote_" . md5($symbol) . ".json";
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 120) {
    echo file_get_contents($cacheFile);
    exit;
}

// --- Helper for Yahoo request ---
function fetchYahoo($url, $headers, $retries = 3) {
    for ($i = 0; $i < $retries; $i++) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        $response = curl_exec($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($http === 200 && $response) return [$response, $http];
        if ($http === 429) usleep(pow(2, $i) * 500000); // backoff 0.5s,1s,2s
    }
    return [null, $http ?? 0];
}

// --- Primary endpoint ---
$url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" . urlencode($symbol);
$headers = [
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept: application/json, text/javascript, */*; q=0.01",
    "Accept-Language: en-US,en;q=0.9",
    "Referer: https://finance.yahoo.com/",
    "Cookie: A1=dummy; B=dummy;"
];
[$response, $http] = fetchYahoo($url, $headers);

if (!$response || $http !== 200) {
    // fallback to /v8/chart
    $chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/{$symbol}?interval=1d&range=1d";
    [$chartResp, $chartHttp] = fetchYahoo($chartUrl, $headers);
    if (!$chartResp || $chartHttp !== 200) {
        echo json_encode([
            "success" => false,
            "error"   => "Yahoo API failed",
            "details" => "HTTP $http"
        ]);
        exit;
    }

    $chartData = json_decode($chartResp, true);
    $meta = $chartData['chart']['result'][0]['meta'] ?? null;
    if (!$meta) {
        echo json_encode(["success" => false, "error" => "Symbol not found"]);
        exit;
    }
    $price = $meta['regularMarketPrice'] ?? null;
    $prev  = $meta['previousClose'] ?? null;
    $change = ($price && $prev) ? (($price - $prev) / $prev) * 100 : 0;

    $out = [
        "success" => true,
        "symbol"  => $symbol,
        "name"    => $meta['symbol'] ?? $symbol,
        "price"   => round($price, 2),
        "change"  => round($change, 2)
    ];
    file_put_contents($cacheFile, json_encode($out));
    echo json_encode($out);
    exit;
}

// Decode normal quote
$data = json_decode($response, true);
$q = $data['quoteResponse']['result'][0] ?? null;
if (!$q) {
    echo json_encode(["success" => false, "error" => "Symbol not found"]);
    exit;
}

$out = [
    "success" => true,
    "symbol"  => $q['symbol'],
    "name"    => $q['shortName'] ?? $q['longName'] ?? $symbol,
    "price"   => $q['regularMarketPrice'] ?? null,
    "change"  => $q['regularMarketChangePercent'] ?? 0,
];

file_put_contents($cacheFile, json_encode($out));
echo json_encode($out);
