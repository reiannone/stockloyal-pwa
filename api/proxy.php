<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// ======================================================================
// api/proxy.php
// Unified Yahoo Finance proxy for:
//  - Screeners (via ?scrId=most_actives)
//  - Symbol search (via POST {"symbol":"AAPL"})
//  - Multi-symbol quote lookup (via POST {"symbol":"AAPL,MSFT"})
//  - ✅ NEW: Multi-symbol quote lookup (via POST {"symbols":["AAPL","MSFT"]})
// ======================================================================

// header("Access-Control-Allow-Origin: *");
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
    L("Warning: JSON decode failed: " . substr($raw, 0, 200));
}

// $scrId  = isset($_GET['scrId']) ? trim($_GET['scrId']) : null;
$scrId = isset($_GET['scrId'])
    ? trim($_GET['scrId'])
    : (is_array($post) && !empty($post['scrId']) ? trim($post['scrId']) : null);

// Existing: symbol can be "AAPL" or "AAPL,MSFT"
$symbol = (is_array($post) && !empty($post['symbol'])) ? trim((string)$post['symbol']) : null;

// ✅ NEW: also support symbols array: {"symbols":["AAPL","MSFT"]}
if ((!$symbol || $symbol === '') && is_array($post) && !empty($post['symbols']) && is_array($post['symbols'])) {
    $clean = [];
    foreach ($post['symbols'] as $s) {
        $s = strtoupper(trim((string)$s));
        if ($s === '' || strlen($s) > 16) continue;
        // Allow A-Z, 0-9, dot, dash, caret, equals (covers many Yahoo tickers)
        if (!preg_match('/^[A-Z0-9\.\-\^\=]+$/', $s)) continue;
        $clean[] = $s;
        if (count($clean) >= 100) break; // cap for safety
    }
    $clean = array_values(array_unique($clean));
    if (!empty($clean)) {
        $symbol = implode(',', $clean);
    }
}

// ✅ Add offset parameter for pagination (default 0)
$offset = isset($_GET['offset'])
    ? (int)$_GET['offset']
    : (is_array($post) && isset($post['offset']) ? (int)$post['offset'] : 0);

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
$curlTimeout = 20;
$cacheDir = __DIR__ . "/cache";
@mkdir($cacheDir, 0755);

$curl = curl_init();

try {
    // -----------------------------------------------------------
    // 🔹 MULTI-SYMBOL OR SINGLE SYMBOL LOOKUP
    // -----------------------------------------------------------
    if ($symbol) {
        $symbols = array_filter(array_map('trim', explode(',', strtoupper($symbol))));
        $symbolKey = implode(',', $symbols);
        $cacheFile = $cacheDir . "/quote_" . md5($symbolKey) . ".json";

        // Return cached if < 60 seconds old
        if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 60) {
            header("X-Proxy-Cache: HIT");
            echo file_get_contents($cacheFile);
            exit;
        }

        if (count($symbols) >= 1) {
            // --- Multi-symbol quote API (also works for single symbol) ---
            $url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" . urlencode($symbolKey);
            L("multi-symbol fetch: {$url}");

            curl_setopt_array($curl, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_USERAGENT => $ua,
                CURLOPT_TIMEOUT => $curlTimeout,
                CURLOPT_HTTPHEADER => [
                    'Accept: application/json',
                    'Accept-Language: en-US,en;q=0.9',
                ]
            ]);

            $resp = curl_exec($curl);
            $http = curl_getinfo($curl, CURLINFO_HTTP_CODE);

            if ($resp === false || $http !== 200) {
                L("Quote API failed with HTTP {$http}, trying chart fallback");
                // Fall through to chart-based fallback below
            } else {
                $data = json_decode($resp, true);
                $results = $data['quoteResponse']['result'] ?? [];

                if (!empty($results)) {
                    $out = [
                        "success" => true,
                        "count"   => count($results),
                        "data"    => array_map(function ($q) {
                            // Calculate change percentage from price and previous close if not directly available
                            $price = $q['regularMarketPrice'] ?? null;
                            $prevClose = $q['regularMarketPreviousClose'] ?? $q['previousClose'] ?? null;

                            // Try to get change percent directly first
                            $changePercent = $q['regularMarketChangePercent'] ?? null;

                            // If not available, calculate it
                            if ($changePercent === null && $price !== null && $prevClose !== null && $prevClose > 0) {
                                $changePercent = (($price - $prevClose) / $prevClose) * 100;
                            }

                            // Also check for regularMarketChange and calculate from that
                            if ($changePercent === null && isset($q['regularMarketChange']) && $prevClose !== null && $prevClose > 0) {
                                $changePercent = ($q['regularMarketChange'] / $prevClose) * 100;
                            }

                            return [
                                "symbol"    => $q['symbol'],
                                "name"      => $q['shortName'] ?? $q['longName'] ?? $q['symbol'],
                                "price"     => $price,
                                "change"    => $changePercent !== null ? round((float)$changePercent, 2) : 0,
                                "currency"  => $q['currency'] ?? "USD",
                                "prevClose" => $prevClose,
                            ];
                        }, $results)
                    ];

                    @file_put_contents($cacheFile, json_encode($out));
                    echo json_encode($out);
                    exit;
                }
            }

            // --- Fallback: Use chart API for each symbol ---
            L("Using chart API fallback for symbols: {$symbolKey}");
            $chartResults = [];

            foreach ($symbols as $sym) {
                $chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/{$sym}?interval=1d&range=5d";
                L("chart fetch: {$chartUrl}");

                curl_setopt_array($curl, [
                    CURLOPT_URL => $chartUrl,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_USERAGENT => $ua,
                    CURLOPT_TIMEOUT => $curlTimeout
                ]);

                $chartResp = curl_exec($curl);
                $price = $change = $name = null;
                $prevClose = null;

                if ($chartResp) {
                    $cj = json_decode($chartResp, true);
                    $meta = $cj['chart']['result'][0]['meta'] ?? null;
                    if ($meta) {
                        $price = $meta['regularMarketPrice'] ?? null;
                        $prevClose = $meta['chartPreviousClose'] ?? $meta['previousClose'] ?? null;
                        $name = $meta['shortName'] ?? $meta['longName'] ?? $sym;

                        if ($price !== null && $prevClose !== null && $prevClose > 0) {
                            $change = (($price - $prevClose) / $prevClose) * 100;
                        }
                    }
                }

                $chartResults[] = [
                    "symbol"    => $sym,
                    "name"      => $name ?? $sym,
                    "price"     => $price !== null ? (float)$price : null,
                    "change"    => $change !== null ? round((float)$change, 2) : 0,
                    "currency"  => "USD",
                    "prevClose" => $prevClose,
                ];
            }

            $out = [
                "success" => true,
                "count"   => count($chartResults),
                "data"    => $chartResults
            ];

            @file_put_contents($cacheFile, json_encode($out));
            echo json_encode($out);
            exit;
        }
    }

    // -----------------------------------------------------------
    // 🔹 SCREENER FETCH
    // -----------------------------------------------------------
    $scr = $scrId ?: 'most_actives';

    // ✅ Include offset in cache key
    $cacheFile = $cacheDir . "/cache_" . preg_replace('/[^a-z0-9_-]/i', '_', $scr) . "_offset{$offset}.json";
    $cacheTime = 300;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTime) {
        header("X-Proxy-Cache: HIT");
        echo file_get_contents($cacheFile);
        exit;
    }

    // ✅ Yahoo Finance uses 'start' parameter for pagination, not 'offset'
    $url = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=" . urlencode($scr) . "&count=25&start={$offset}&lang=en&region=US";
    L("screener fetch: $url (start={$offset}, count=25)");

    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => $ua,
        CURLOPT_TIMEOUT => $curlTimeout
    ]);

    $resp = curl_exec($curl);
    $http = curl_getinfo($curl, CURLINFO_HTTP_CODE);

    if ($resp === false || $http !== 200) {
        if (file_exists($cacheFile)) {
            header("X-Proxy-Cache: STALE");
            echo file_get_contents($cacheFile);
            exit;
        }
        echo json_encode(["success" => false, "error" => "Yahoo Proxy screener request failed", "http" => $http]);
        exit;
    }

    @file_put_contents($cacheFile, $resp);
    header("X-Proxy-Cache: MISS");
    echo $resp;
    exit;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
    exit;
} finally {
    if ($curl) curl_close($curl);
}
