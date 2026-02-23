<?php
declare(strict_types=1);

/**
 * alpaca-market-data.php — Market Data Proxy for StockPicker
 *
 * Replaces Yahoo Finance proxy.php for category browsing and quote enrichment.
 * All data from Alpaca — every symbol returned is guaranteed tradable.
 *
 * Modes:
 *   POST { "action": "screener", "category": "most_active" }   → Top stocks by category
 *   POST { "action": "quotes",   "symbols": "AAPL,MSFT,..." }  → Price enrichment
 *   POST { "action": "search",   "query": "Apple" }             → Symbol/name search
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

// Load AlpacaMarketData AFTER CORS headers are set
require_once __DIR__ . '/AlpacaMarketData.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$action = $input['action'] ?? '';

function L(string $msg): void { error_log("[alpaca-market-data] {$msg}"); }

// ── Cache helpers ────────────────────────────────────────────
$cacheDir = '/tmp/stockloyal_cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

function getCache(string $key, int $ttl): ?string {
    global $cacheDir;
    $f = $cacheDir . '/amd_' . preg_replace('/[^a-z0-9_-]/i', '_', $key) . '.json';
    if (file_exists($f) && (time() - filemtime($f)) < $ttl) {
        return file_get_contents($f);
    }
    return null;
}

function setCache(string $key, string $data): void {
    global $cacheDir;
    $f = $cacheDir . '/amd_' . preg_replace('/[^a-z0-9_-]/i', '_', $key) . '.json';
    @file_put_contents($f, $data);
}

try {
    $alpaca = new AlpacaMarketData();

    // =================================================================
    // SCREENER — category-based stock lists
    // POST { "action": "screener", "category": "most_active" }
    // =================================================================
    if ($action === 'screener') {
        $category = $input['category'] ?? 'most_active';
        $top      = min(50, max(5, (int)($input['top'] ?? 20)));

        L("screener: category={$category} top={$top}");

        // Check cache (5 min for screeners)
        $cacheKey = "screener_{$category}_{$top}";
        $cached = getCache($cacheKey, 300);
        if ($cached) {
            header("X-Cache: HIT");
            echo $cached;
            exit;
        }

        $results = [];

        // Map category → sort key for universe-based approach
        $sortMap = [
            'most_active'  => 'volume',
            'most_traded'  => 'trades',
            'day_gainers'  => 'gainers',
            'day_losers'   => 'losers',
        ];

        switch ($category) {
            // ── Stock categories: snapshot-based sorting on curated universe ──
            case 'most_active':
            case 'most_traded':
            case 'day_gainers':
            case 'day_losers':
                $sortBy = $sortMap[$category];
                $resp = $alpaca->getUniverseSorted($sortBy, $top);
                if (!$resp['success']) {
                    throw new \Exception('Alpaca universe fetch failed: ' . ($resp['error'] ?? 'unknown'));
                }
                $results = $resp['data'];
                break;

            // ── Crypto ──
            case 'crypto':
                // Curated top crypto pairs tradable on Alpaca
                $cryptoSymbols = [
                    'BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'AVAX/USD',
                    'LINK/USD', 'DOT/USD', 'UNI/USD', 'AAVE/USD', 'LTC/USD',
                    'BCH/USD', 'SHIB/USD', 'ADA/USD', 'XRP/USD', 'MATIC/USD',
                    'ATOM/USD', 'NEAR/USD', 'FIL/USD', 'MKR/USD', 'CRV/USD',
                ];

                $cryptoNames = [
                    'BTC/USD' => 'Bitcoin',         'ETH/USD' => 'Ethereum',
                    'SOL/USD' => 'Solana',           'DOGE/USD' => 'Dogecoin',
                    'AVAX/USD' => 'Avalanche',       'LINK/USD' => 'Chainlink',
                    'DOT/USD' => 'Polkadot',         'UNI/USD' => 'Uniswap',
                    'AAVE/USD' => 'Aave',            'LTC/USD' => 'Litecoin',
                    'BCH/USD' => 'Bitcoin Cash',     'SHIB/USD' => 'Shiba Inu',
                    'ADA/USD' => 'Cardano',          'XRP/USD' => 'XRP',
                    'MATIC/USD' => 'Polygon',        'ATOM/USD' => 'Cosmos',
                    'NEAR/USD' => 'NEAR Protocol',   'FIL/USD' => 'Filecoin',
                    'MKR/USD' => 'Maker',            'CRV/USD' => 'Curve DAO',
                ];

                $resp = $alpaca->getCryptoSnapshots($cryptoSymbols);
                if ($resp['success'] && is_array($resp['data'])) {
                    $snapshots = $resp['data']['snapshots'] ?? $resp['data'];
                    $normalized = AlpacaMarketData::normalizeCryptoSnapshots($snapshots);
                    
                    foreach ($cryptoSymbols as $sym) {
                        $displaySym = str_replace('/', '-', $sym);
                        $n = $normalized[$displaySym] ?? [];
                        if ($n) {
                            $results[] = [
                                'symbol' => $displaySym,
                                'name'   => $cryptoNames[$sym] ?? $displaySym,
                                'price'  => $n['price'] ?? null,
                                'change' => $n['change'] ?? 0,
                            ];
                        }
                    }
                } else {
                    // Fallback: just list symbols without prices
                    foreach ($cryptoSymbols as $sym) {
                        $displaySym = str_replace('/', '-', $sym);
                        $results[] = [
                            'symbol' => $displaySym,
                            'name'   => $cryptoNames[$sym] ?? $displaySym,
                            'price'  => null,
                            'change' => 0,
                        ];
                    }
                }
                break;

            // ── ETFs ──
            case 'etfs':
                $etfSymbols = [
                    'SPY','QQQ','IWM','DIA','VTI','VOO','ARKK','VGT','SCHD',
                    'XLF','XLE','XLK','XLV','XLI','XLP','XLY','XLU','XLRE',
                    'IYR','GLD','SLV','TLT','HYG','LQD','IBIT','ETHE',
                    'VWO','EFA','IEMG','VEA','ARKW','ARKG','SOXL','TQQQ',
                ];

                $etfNames = [
                    'SPY'  => 'SPDR S&P 500 ETF',
                    'QQQ'  => 'Invesco QQQ Trust (Nasdaq 100)',
                    'IWM'  => 'iShares Russell 2000 ETF',
                    'DIA'  => 'SPDR Dow Jones Industrial ETF',
                    'VTI'  => 'Vanguard Total Stock Market ETF',
                    'VOO'  => 'Vanguard S&P 500 ETF',
                    'ARKK' => 'ARK Innovation ETF',
                    'VGT'  => 'Vanguard Information Technology ETF',
                    'SCHD' => 'Schwab US Dividend Equity ETF',
                    'XLF'  => 'Financial Select Sector SPDR',
                    'XLE'  => 'Energy Select Sector SPDR',
                    'XLK'  => 'Technology Select Sector SPDR',
                    'XLV'  => 'Health Care Select Sector SPDR',
                    'XLI'  => 'Industrial Select Sector SPDR',
                    'XLP'  => 'Consumer Staples Select SPDR',
                    'XLY'  => 'Consumer Discretionary Select SPDR',
                    'XLU'  => 'Utilities Select Sector SPDR',
                    'XLRE' => 'Real Estate Select Sector SPDR',
                    'IYR'  => 'iShares US Real Estate ETF',
                    'GLD'  => 'SPDR Gold Shares',
                    'SLV'  => 'iShares Silver Trust',
                    'TLT'  => 'iShares 20+ Year Treasury Bond ETF',
                    'HYG'  => 'iShares High Yield Corporate Bond ETF',
                    'LQD'  => 'iShares Investment Grade Corporate Bond ETF',
                    'IBIT' => 'iShares Bitcoin Trust ETF',
                    'ETHE' => 'Grayscale Ethereum Trust ETF',
                    'VWO'  => 'Vanguard FTSE Emerging Markets ETF',
                    'EFA'  => 'iShares MSCI EAFE ETF',
                    'IEMG' => 'iShares Core MSCI Emerging Markets ETF',
                    'VEA'  => 'Vanguard FTSE Developed Markets ETF',
                    'ARKW' => 'ARK Next Generation Internet ETF',
                    'ARKG' => 'ARK Genomic Revolution ETF',
                    'SOXL' => 'Direxion Semiconductor Bull 3X ETF',
                    'TQQQ' => 'ProShares UltraPro QQQ 3X ETF',
                ];

                $resp = $alpaca->getStockSnapshots($etfSymbols);
                if ($resp['success'] && is_array($resp['data'])) {
                    $normalized = AlpacaMarketData::normalizeSnapshots($resp['data']);
                    // Sort by volume descending
                    $list = array_values($normalized);
                    usort($list, fn($a, $b) => ($b['volume'] ?? 0) <=> ($a['volume'] ?? 0));

                    foreach ($list as $q) {
                        $sym = $q['symbol'];
                        $results[] = [
                            'symbol' => $sym,
                            'name'   => $etfNames[$sym] ?? $sym,
                            'price'  => $q['price'] ?? null,
                            'change' => $q['change'] ?? 0,
                            'volume' => $q['volume'] ?? null,
                        ];
                    }
                } else {
                    foreach ($etfSymbols as $sym) {
                        $results[] = [
                            'symbol' => $sym,
                            'name'   => $etfNames[$sym] ?? $sym,
                            'price'  => null,
                            'change' => 0,
                        ];
                    }
                }
                break;

            default:
                echo json_encode(['success' => false, 'error' => "Unknown category: {$category}"]);
                exit;
        }

        $output = json_encode(['success' => true, 'data' => $results, 'category' => $category]);
        setCache($cacheKey, $output);
        header("X-Cache: MISS");
        echo $output;
        exit;
    }

    // =================================================================
    // QUOTES — price enrichment for symbol lists
    // POST { "action": "quotes", "symbols": "AAPL,MSFT,GOOGL" }
    // =================================================================
    if ($action === 'quotes') {
        $symbolStr = strtoupper(trim((string)($input['symbols'] ?? '')));
        if (empty($symbolStr)) {
            echo json_encode(['success' => false, 'error' => 'Missing symbols']);
            exit;
        }

        $symbols = array_filter(array_map('trim', explode(',', $symbolStr)));
        L("quotes: " . count($symbols) . " symbols");

        // Separate crypto from equity
        $cryptoSymbols  = [];
        $equitySymbols  = [];
        foreach ($symbols as $sym) {
            if (preg_match('/^[A-Z]{2,6}[-\/]USD$/i', $sym)) {
                // Normalize to slash format for API
                $cryptoSymbols[] = str_replace('-', '/', strtoupper($sym));
            } else {
                $equitySymbols[] = strtoupper($sym);
            }
        }

        $allQuotes = [];

        // Fetch equity snapshots
        if (!empty($equitySymbols)) {
            $snapResp = $alpaca->getStockSnapshots($equitySymbols);
            if ($snapResp['success'] && is_array($snapResp['data'])) {
                $normalized = AlpacaMarketData::normalizeSnapshots($snapResp['data']);
                foreach ($normalized as $sym => $q) {
                    $allQuotes[] = $q;
                }
            }
        }

        // Fetch crypto snapshots
        if (!empty($cryptoSymbols)) {
            $cryptoResp = $alpaca->getCryptoSnapshots($cryptoSymbols);
            if ($cryptoResp['success'] && is_array($cryptoResp['data'])) {
                $snapData = $cryptoResp['data']['snapshots'] ?? $cryptoResp['data'];
                $normalized = AlpacaMarketData::normalizeCryptoSnapshots($snapData);
                foreach ($normalized as $sym => $q) {
                    $allQuotes[] = $q;
                }
            }
        }

        // Add asset names via broker asset lookup (batch by looking up individually)
        // Only for symbols that don't already have a name
        foreach ($allQuotes as &$q) {
            if (empty($q['name']) || $q['name'] === $q['symbol']) {
                $assetResp = $alpaca->getAsset($q['symbol']);
                if ($assetResp['success'] && !empty($assetResp['data']['name'])) {
                    $q['name'] = $assetResp['data']['name'];
                }
            }
        }
        unset($q);

        echo json_encode(['success' => true, 'data' => $allQuotes]);
        exit;
    }

    // =================================================================
    // SEARCH — symbol/name search
    // POST { "action": "search", "query": "Apple" }
    // =================================================================
    if ($action === 'search') {
        $query = trim((string)($input['query'] ?? ''));
        if (empty($query)) {
            echo json_encode(['success' => false, 'error' => 'Missing query']);
            exit;
        }

        L("search: query={$query}");

        $result = $alpaca->searchAssets($query, 15);
        if (!$result['success']) {
            echo json_encode(['success' => false, 'error' => $result['error'] ?? 'Search failed', 'data' => []]);
            exit;
        }

        $assets  = $result['data'];
        $symbols = array_column($assets, 'symbol');

        // Enrich with prices
        $enriched = [];
        if (!empty($symbols)) {
            $snapResp = $alpaca->getStockSnapshots($symbols);
            if ($snapResp['success'] && is_array($snapResp['data'])) {
                $enriched = AlpacaMarketData::normalizeSnapshots($snapResp['data']);
            }
        }

        $results = [];
        foreach ($assets as $a) {
            $sym = $a['symbol'] ?? '';
            $e   = $enriched[$sym] ?? [];
            $results[] = [
                'symbol'       => $sym,
                'name'         => $a['name'] ?? $sym,
                'price'        => $e['price'] ?? null,
                'change'       => $e['change'] ?? 0,
                'exchange'     => $a['exchange'] ?? '',
                'tradable'     => $a['tradable'] ?? false,
                'fractionable' => $a['fractionable'] ?? false,
            ];
        }

        echo json_encode(['success' => true, 'data' => $results]);
        exit;
    }

    // =================================================================
    // UNKNOWN ACTION
    // =================================================================
    echo json_encode([
        'success' => false,
        'error'   => 'Unknown action. Use: screener, quotes, or search',
    ]);

} catch (\Exception $e) {
    L("ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

// end of file
