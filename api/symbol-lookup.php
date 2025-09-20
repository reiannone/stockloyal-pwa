<?php
// api/symbol-lookup.php
// Yahoo Finance symbol lookup with cookie + caching

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS, GET");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

// Health check
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['ping'])) {
    echo json_encode(['ok' => true, 'msg' => 'api is reachable']);
    exit;
}

// Read input
$raw = @file_get_contents("php://input");
$input = json_decode($raw, true);
$symbol = strtoupper(trim($input['symbol'] ?? ''));
if (!$symbol && isset($_POST['symbol'])) {
    $symbol = strtoupper(trim($_POST['symbol']));
}
if (!$symbol) {
    echo json_encode(["success" => false, "error" => "Missing symbol"]);
    exit;
}

// Cache setup (1 minute)
$cacheDir = __DIR__ . "/cache";
if (!is_dir($cacheDir)) mkdir($cacheDir, 0777, true);
$cacheFile = $cacheDir . "/quote_" . md5($symbol) . ".json";
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 60) {
    echo file_get_contents($cacheFile);
    exit;
}

$url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" . urlencode($symbol);

// Headers
$headers = [
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Accept: application/json, text/javascript, */*; q=0.01",
    "Accept-Language: en-US,en;q=0.9",
    "Referer: https://finance.yahoo.com/",
    // ✅ Optional cookie string — update if Yahoo blocks you again
    "Cookie: A1=dummy; B=dummy;"
];

// cURL request
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_ENCODING, "");
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    echo json_encode([
        "success" => false,
        "error"   => "Yahoo API failed",
        "details" => $curlErr ?: "HTTP $httpCode"
    ]);
    exit;
}

// Decode response
$data = json_decode($response, true);
$quote = $data['quoteResponse']['result'][0] ?? null;

if (!$quote) {
    echo json_encode(["success" => false, "error" => "Symbol not found"]);
    exit;
}

// Normalized response
$out = [
    "success" => true,
    "symbol"  => $quote['symbol'],
    "name"    => $quote['shortName'] ?? $quote['longName'] ?? $quote['symbol'],
    "price"   => $quote['regularMarketPrice'] ?? null,
    "change"  => $quote['regularMarketChangePercent'] ?? 0,
];

file_put_contents($cacheFile, json_encode($out)); // save to cache
echo json_encode($out);
