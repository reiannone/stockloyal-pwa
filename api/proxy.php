<?php
// api/proxy.php - screener + search-friendly symbol lookup
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

function L($msg) { error_log("[proxy.php] " . $msg); }

$raw = file_get_contents("php://input");
$post = $raw ? json_decode($raw, true) : null;
if ($raw && $post === null) {
    L("Warning: JSON decode failed for POST body: " . substr($raw,0,400));
}

$scrId = isset($_GET['scrId']) ? trim($_GET['scrId']) : null;
$symbol = is_array($post) && !empty($post['symbol']) ? trim($post['symbol']) : null;

$ua = "Mozilla/5.0 (StockLoyal Proxy; +http://localhost)";
$curlTimeout = 20;
$curl = curl_init();

try {
    // --- SYMBOL LOOKUP (prefer search endpoint to avoid /v7/quote 401) ---
    if ($symbol) {
        $q = urlencode($symbol);
        $searchUrl = "https://query1.finance.yahoo.com/v1/finance/search?q={$q}&lang=en-US&region=US&quotesCount=1";
        L("symbol search: {$symbol} -> {$searchUrl}");

        curl_setopt($curl, CURLOPT_URL, $searchUrl);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($curl, CURLOPT_USERAGENT, $ua);
        curl_setopt($curl, CURLOPT_TIMEOUT, $curlTimeout);

        $resp = curl_exec($curl);
        $http = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $cerr = curl_error($curl);
        L("search curl HTTP code: $http, curl_error: " . ($cerr ?: '<none>'));
        L("search response preview: " . substr($resp ?? '', 0, 800));

        if ($resp === false) {
            http_response_code(502);
            echo json_encode(["success" => false, "error" => "Upstream request failed", "details" => $cerr]);
            exit;
        }

        // If search didn't produce JSON or returned HTML, bail with useful message
        $trim = ltrim($resp);
        if (strpos($trim, "<") === 0) {
            http_response_code(502);
            echo json_encode(["success" => false, "error" => "Upstream returned HTML (likely blocked)", "http_code" => $http, "preview" => substr($resp,0,800)]);
            exit;
        }

        // parse JSON and map sensible fields
        $j = json_decode($resp, true);
        if (!$j) {
            http_response_code(502);
            echo json_encode(["success" => false, "error" => "Upstream returned invalid JSON", "preview" => substr($resp,0,800)]);
            exit;
        }

        // prefer `quotes` array (search endpoint) or `finance.result.quotes`
        $quotes = $j['quotes'] ?? ($j['finance']['result'][0]['quotes'] ?? null) ?? null;
        if (empty($quotes)) {
            // no quotes -> return not found
            http_response_code(404);
            echo json_encode(["success" => false, "error" => "Symbol not found (search returned no quotes)"]);
            exit;
        }

        $q0 = $quotes[0];

        // robust extraction of name/price/change
        $outSymbol = $q0['symbol'] ?? ($q0['id'] ?? $symbol);
        $name = $q0['shortname'] ?? $q0['longname'] ?? $q0['name'] ?? ($q0['title'] ?? $outSymbol);

        // price fields vary by endpoint; try several possibilities
        $price = null;
        $possiblePriceKeys = [
            'regularMarketPrice','regularMarketPreviousClose','mid','lastPrice','price','regularMarketPrice.raw'
        ];
        foreach ($possiblePriceKeys as $k) {
            if (isset($q0[$k]) && is_numeric($q0[$k])) { $price = $q0[$k]; break; }
            // support nested/raw style (sometimes value in ['regularMarketPrice']['raw'])
            if (is_array($q0) && isset($q0['regularMarketPrice']) && is_array($q0['regularMarketPrice']) && isset($q0['regularMarketPrice']['raw'])) {
                $price = $q0['regularMarketPrice']['raw'];
                break;
            }
        }

        // some search results include 'score' or 'exch' — for now we only return symbol/name/price/change
        $change = null;
        if (isset($q0['regularMarketChangePercent'])) $change = $q0['regularMarketChangePercent'];
        if ($change === null && isset($q0['regularMarketChangePercentRaw'])) $change = $q0['regularMarketChangePercentRaw'];

        // return normalized object
        echo json_encode([
            "success" => true,
            "symbol"  => $outSymbol,
            "name"    => $name,
            "price"   => ($price !== null ? floatval($price) : null),
            "change"  => ($change !== null ? floatval($change) : 0),
            "raw"     => $j  // optional: include full search response for debugging (remove in prod if desired)
        ]);
        exit;
    }

    // --- SCREENER / category fetch (existing behaviour) ---
    $scr = $scrId ?: 'most_actives';
    $cacheDir = __DIR__ . "/cache";
    @mkdir($cacheDir, 0755);
    $cacheFile = $cacheDir . "/cache_" . preg_replace('/[^a-z0-9_-]/i', '_', $scr) . ".json";
    $cacheTime = 300;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTime) {
        L("serve cached screener for $scr");
        header("X-Proxy-Cache: HIT");
        echo file_get_contents($cacheFile);
        exit;
    }

    $url = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=" . urlencode($scr) . "&count=50&lang=en&region=US";
    L("screener fetch: $url");

    curl_setopt($curl, CURLOPT_URL, $url);
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($curl, CURLOPT_USERAGENT, $ua);
    curl_setopt($curl, CURLOPT_TIMEOUT, $curlTimeout);

    $resp = curl_exec($curl);
    $http = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $cerr = curl_error($curl);

    L("screener curl HTTP code: $http, curl_error: " . ($cerr ?: '<none>'));
    L("screener response preview: " . substr($resp ?? '', 0, 800));

    if ($resp === false) {
        http_response_code(502);
        echo json_encode(["success" => false, "error" => "Upstream request failed", "details" => $cerr]);
        exit;
    }
    if ($http !== 200) {
        if (file_exists($cacheFile)) {
            L("Yahoo screener returned $http -> serve stale cache");
            header("X-Proxy-Cache: STALE");
            echo file_get_contents($cacheFile);
            exit;
        }
        http_response_code(502);
        echo json_encode(["success" => false, "error" => "Yahoo returned HTTP $http", "body_preview" => substr($resp,0,800)]);
        exit;
    }

    @file_put_contents($cacheFile, $resp);
    header("X-Proxy-Cache: MISS");
    echo $resp;
    exit;

} catch (Exception $e) {
    L("Exception: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error", "message" => $e->getMessage()]);
    exit;
} finally {
    if ($curl) curl_close($curl);
}
