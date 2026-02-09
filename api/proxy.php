<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$cacheDir = "/tmp/stockloyal_cache";
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
$curlTimeout = 10;
$curl = null;

function L($msg) { error_log("[proxy.php] $msg"); }

try {
    $curl = curl_init();

    // =============================================
    // MODE 1: SEARCH BY NAME (autocomplete)
    // POST { "search": "Apple" }
    // =============================================
    if (!empty($input['search'])) {
        $query = trim((string)$input['search']);
        L("search query: $query");

        $url = "https://query1.finance.yahoo.com/v1/finance/search?q=" . urlencode($query) . "&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query";

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
            L("search failed with HTTP $http");
            echo json_encode(["success" => false, "error" => "Yahoo search failed", "http" => $http, "quotes" => []]);
            exit;
        }

        $data = json_decode($resp, true);
        $quotes = $data['quotes'] ?? [];
        
        L("search returned " . count($quotes) . " results");
        echo json_encode(["success" => true, "quotes" => $quotes]);
        exit;
    }

    // =============================================
    // MODE 2: SYMBOL LOOKUP (single or CSV list)
    // POST { "symbol": "AAPL" } or { "symbol": "AAPL,MSFT,GOOGL" }
    // =============================================
    if (!empty($input['symbol'])) {
        $symbols = strtoupper(trim((string)$input['symbol']));
        L("multi-symbol fetch: https://query1.finance.yahoo.com/v7/finance/quote?symbols=$symbols");

        // Try v7 quote API first
        $url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" . urlencode($symbols);

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

        // If v7 fails with 401, fall back to chart API
        if ($http === 401 || $resp === false) {
            L("Quote API failed with HTTP $http, trying chart fallback");
            
            $symbolList = explode(',', $symbols);
            $results = [];
            
            L("Using chart API fallback for symbols: $symbols");
            
            foreach ($symbolList as $sym) {
                $sym = trim($sym);
                if (empty($sym)) continue;
                
                $chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/{$sym}?interval=1d&range=5d";
                L("chart fetch: $chartUrl");
                
                curl_setopt_array($curl, [
                    CURLOPT_URL => $chartUrl,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_USERAGENT => $ua,
                    CURLOPT_TIMEOUT => $curlTimeout
                ]);
                
                $chartResp = curl_exec($curl);
                $chartHttp = curl_getinfo($curl, CURLINFO_HTTP_CODE);
                
                if ($chartResp !== false && $chartHttp === 200) {
                    $chartData = json_decode($chartResp, true);
                    $meta = $chartData['chart']['result'][0]['meta'] ?? null;
                    
                    if ($meta) {
                        $price = $meta['regularMarketPrice'] ?? null;
                        $prevClose = $meta['chartPreviousClose'] ?? $meta['previousClose'] ?? null;
                        $change = 0;
                        
                        if ($price && $prevClose && $prevClose > 0) {
                            $change = (($price - $prevClose) / $prevClose) * 100;
                        }
                        
                        $results[] = [
                            "symbol" => $sym,
                            "name" => $meta['shortName'] ?? $meta['longName'] ?? $sym,
                            "price" => $price,
                            "change" => round($change, 2),
                            "regularMarketPrice" => $price,
                            "regularMarketChangePercent" => round($change, 2)
                        ];
                    }
                }
            }
            
            echo json_encode(["success" => true, "data" => $results]);
            exit;
        }

        // v7 API succeeded
        $data = json_decode($resp, true);
        $quotes = $data['quoteResponse']['result'] ?? [];
        
        // Normalize the response
        $results = [];
        foreach ($quotes as $q) {
            $price = $q['regularMarketPrice'] ?? $q['postMarketPrice'] ?? $q['preMarketPrice'] ?? null;
            $change = $q['regularMarketChangePercent'] ?? 0;
            
            // If change is missing, calculate from previous close
            if ($change == 0 && $price && isset($q['regularMarketPreviousClose']) && $q['regularMarketPreviousClose'] > 0) {
                $prevClose = $q['regularMarketPreviousClose'];
                $change = (($price - $prevClose) / $prevClose) * 100;
            }
            
            $results[] = [
                "symbol" => $q['symbol'] ?? '',
                "name" => $q['shortName'] ?? $q['longName'] ?? $q['symbol'] ?? '',
                "price" => $price,
                "change" => round($change, 2),
                "regularMarketPrice" => $price,
                "regularMarketChangePercent" => round($change, 2),
                "shortName" => $q['shortName'] ?? '',
                "longName" => $q['longName'] ?? ''
            ];
        }

        echo json_encode(["success" => true, "data" => $results]);
        exit;
    }

    // =============================================
    // MODE 3: SCREENER (predefined lists)
    // POST { "scrId": "most_actives" }
    // =============================================
    $scr = isset($input['scrId']) ? trim((string)$input['scrId']) : 'most_actives';
    $offset = isset($input['offset']) ? max(0, (int)$input['offset']) : 0;
    $count = isset($input['count']) ? min(50, max(1, (int)$input['count'])) : 25;

    $cacheFile = $cacheDir . "/cache_" . preg_replace('/[^a-z0-9_-]/i', '_', $scr) . "_" . $offset . ".json";
    $cacheTime = 300;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTime) {
        header("X-Proxy-Cache: HIT");
        echo file_get_contents($cacheFile);
        exit;
    }

    $url = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=" . urlencode($scr) . "&count=" . $count . "&start=" . $offset . "&lang=en&region=US";
    L("screener fetch: $url (start=$offset, count=$count)");

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
