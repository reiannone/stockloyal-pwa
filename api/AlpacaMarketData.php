<?php
// api/AlpacaMarketData.php
// Market data via Alpaca snapshots & broker assets API
// Screener endpoints are Trading-API-only, so we use snapshot-based sorting instead
declare(strict_types=1);

class AlpacaMarketData
{
    private string $dataUrl;   // data API (snapshots, quotes)
    private string $brokerUrl; // broker API (assets list)
    private string $dataKey;
    private string $dataSecret;
    private string $brokerKey;
    private string $brokerSecret;

    // ~120 heavily-traded US equities (S&P 500 + popular mid-caps)
    // Used as the universe for Most Active / Gainers / Losers categories
    public const STOCK_UNIVERSE = [
        // Mega-cap tech
        'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AVGO','ORCL','ADBE',
        'CRM','AMD','INTC','NFLX','CSCO','QCOM','TXN','IBM','NOW','UBER',
        'SHOP','SQ','SNAP','COIN','PLTR','MRVL','MU','ANET','PANW','CRWD',
        // Finance
        'JPM','BAC','WFC','GS','MS','C','BLK','SCHW','AXP','V',
        'MA','PYPL','COF','USB','PNC',
        // Healthcare
        'UNH','JNJ','LLY','PFE','ABBV','MRK','TMO','ABT','BMY','AMGN',
        'GILD','ISRG','MDT','CVS','CI',
        // Consumer
        'WMT','COST','HD','MCD','NKE','SBUX','TGT','LOW','TJX','ABNB',
        'DIS','CMCSA','PEP','KO','PG',
        // Industrial / Energy
        'XOM','CVX','COP','SLB','EOG','BA','CAT','HON','UPS','GE',
        'RTX','DE','LMT','MMM','FDX',
        // ETFs
        'SPY','QQQ','IWM','DIA','ARKK','VTI','VOO',
        // Popular / trending
        'RIVN','LCID','NIO','F','GM','SOFI','HOOD','RBLX','U','DKNG',
        'ARM','SMCI','MSTR','RDDT','IONQ','RGTI','LUNR',
    ];

    public function __construct()
    {
        require_once __DIR__ . '/_loadenv.php';

        // Trading/Data API keys (PK...) — for data.alpaca.markets (snapshots, quotes)
        $this->dataKey      = $_ENV['ALPACA_DATA_API_KEY']      ?? '';
        $this->dataSecret   = $_ENV['ALPACA_DATA_API_SECRET']   ?? '';

        // Broker API keys (CK...) — for broker-api (assets, accounts, orders)
        $this->brokerKey    = $_ENV['ALPACA_BROKER_API_KEY']    ?? '';
        $this->brokerSecret = $_ENV['ALPACA_BROKER_API_SECRET'] ?? '';
        $this->brokerUrl    = $_ENV['ALPACA_BROKER_BASE_URL']   ?? 'https://broker-api.sandbox.alpaca.markets';

        // Data API — same URL for sandbox and live
        $this->dataUrl = $_ENV['ALPACA_DATA_BASE_URL'] ?? 'https://data.alpaca.markets';

        if (empty($this->dataKey) || empty($this->dataSecret)) {
            throw new \RuntimeException('Alpaca Data API credentials not configured (ALPACA_DATA_API_KEY / ALPACA_DATA_API_SECRET)');
        }
        if (empty($this->brokerKey) || empty($this->brokerSecret)) {
            throw new \RuntimeException('Alpaca Broker API credentials not configured (ALPACA_BROKER_API_KEY / ALPACA_BROKER_API_SECRET)');
        }
    }

    // ─── HTTP ────────────────────────────────────────────────

    /** Data API request — uses Trading API keys (APCA headers) for data.alpaca.markets */
    private function dataRequest(string $endpoint, array $params = []): array
    {
        $url = rtrim($this->dataUrl, '/') . $endpoint;
        if ($params) {
            $url .= '?' . http_build_query($params);
        }
        return $this->httpGet($url, [
            'Accept: application/json',
            'APCA-API-KEY-ID: ' . $this->dataKey,
            'APCA-API-SECRET-KEY: ' . $this->dataSecret,
        ]);
    }

    /** Broker API request — uses Broker API keys (Basic auth) for broker-api.*.alpaca.markets */
    private function brokerRequest(string $endpoint, array $params = []): array
    {
        $url = rtrim($this->brokerUrl, '/') . $endpoint;
        if ($params) {
            $url .= '?' . http_build_query($params);
        }
        return $this->httpGet($url, [
            'Accept: application/json',
            'Authorization: Basic ' . base64_encode($this->brokerKey . ':' . $this->brokerSecret),
        ]);
    }

    private function httpGet(string $url, array $headers): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_HTTPHEADER     => $headers,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            return ['success' => false, 'error' => "cURL: {$error}", 'http_code' => 0];
        }

        $decoded = json_decode($response, true) ?? [];

        if ($httpCode >= 200 && $httpCode < 300) {
            return ['success' => true, 'http_code' => $httpCode, 'data' => $decoded];
        }

        return [
            'success'   => false,
            'http_code' => $httpCode,
            'error'     => $decoded['message'] ?? $decoded['error'] ?? "HTTP {$httpCode}",
            'data'      => $decoded,
        ];
    }

    // ─── Snapshots / Quotes ──────────────────────────────────

    /**
     * Get stock snapshots for multiple symbols (auto-batched if >180).
     */
    public function getStockSnapshots(array $symbols): array
    {
        if (empty($symbols)) {
            return ['success' => true, 'data' => []];
        }

        $allData = [];
        $chunks = array_chunk($symbols, 180);

        foreach ($chunks as $chunk) {
            $resp = $this->dataRequest('/v2/stocks/snapshots', [
                'symbols' => implode(',', $chunk),
                'feed'    => 'iex',
            ]);
            if ($resp['success'] && is_array($resp['data'])) {
                $allData = array_merge($allData, $resp['data']);
            } else {
                return $resp;
            }
        }

        return ['success' => true, 'data' => $allData];
    }

    /**
     * Get crypto snapshots for multiple symbols.
     * @param array $symbols ['BTC/USD', 'ETH/USD', ...]
     */
    public function getCryptoSnapshots(array $symbols): array
    {
        if (empty($symbols)) {
            return ['success' => true, 'data' => []];
        }

        return $this->dataRequest('/v1beta3/crypto/us/snapshots', [
            'symbols' => implode(',', $symbols),
        ]);
    }

    // ─── Universe-based categories (replaces screener) ───────

    /**
     * Fetch snapshots for the full stock universe and return sorted results.
     *
     * @param string $sortBy 'volume', 'trades', 'gainers', 'losers'
     * @param int $top Number of results to return
     * @return array Sorted, enriched stock list
     */
    public function getUniverseSorted(string $sortBy = 'volume', int $top = 20): array
    {
        $resp = $this->getStockSnapshots(self::STOCK_UNIVERSE);
        if (!$resp['success']) {
            return $resp;
        }

        $snapshots = $resp['data'];
        $normalized = self::normalizeSnapshots($snapshots);

        // Load asset names (cached)
        $names = $this->getCachedAssetNames();

        // Attach names
        foreach ($normalized as $sym => &$q) {
            $q['name'] = $names[$sym] ?? $sym;
        }
        unset($q);

        // Convert to list and sort
        $list = array_values($normalized);

        switch ($sortBy) {
            case 'volume':
                usort($list, fn($a, $b) => ($b['volume'] ?? 0) <=> ($a['volume'] ?? 0));
                break;

            case 'trades':
                usort($list, fn($a, $b) => ($b['trade_count'] ?? 0) <=> ($a['trade_count'] ?? 0));
                break;

            case 'gainers':
                // Only positive change, sorted descending
                $list = array_values(array_filter($list, fn($q) => ($q['change'] ?? 0) > 0));
                usort($list, fn($a, $b) => ($b['change'] ?? 0) <=> ($a['change'] ?? 0));
                break;

            case 'losers':
                // Only negative change, sorted ascending (most negative first)
                $list = array_values(array_filter($list, fn($q) => ($q['change'] ?? 0) < 0));
                usort($list, fn($a, $b) => ($a['change'] ?? 0) <=> ($b['change'] ?? 0));
                break;
        }

        return [
            'success' => true,
            'data'    => array_slice($list, 0, $top),
        ];
    }

    // ─── Assets ──────────────────────────────────────────────

    public function getAssets(string $assetClass = 'us_equity', ?string $exchange = null): array
    {
        $params = [
            'status'      => 'active',
            'asset_class' => $assetClass,
        ];
        if ($exchange) {
            $params['exchange'] = $exchange;
        }
        return $this->brokerRequest('/v1/assets', $params);
    }

    public function getAsset(string $symbol): array
    {
        return $this->brokerRequest('/v1/assets/' . urlencode($symbol));
    }

    /**
     * Search assets by name/symbol substring.
     */
    public function searchAssets(string $query, int $limit = 15): array
    {
        // Try direct symbol lookup first
        $direct = $this->getAsset(strtoupper($query));
        if ($direct['success'] && !empty($direct['data']['symbol'])) {
            $asset = $direct['data'];
            if (($asset['status'] ?? '') === 'active' && ($asset['tradable'] ?? false)) {
                return ['success' => true, 'data' => [$asset]];
            }
        }

        // Fall back to cached listing + filter
        $cacheDir  = '/tmp/stockloyal_cache';
        $cacheFile = $cacheDir . '/alpaca_assets_us_equity.json';
        $cacheTime = 3600;

        if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

        $assets = null;
        if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTime) {
            $assets = json_decode(file_get_contents($cacheFile), true);
        }

        if (!$assets) {
            $result = $this->getAssets('us_equity');
            if (!$result['success'] || !is_array($result['data'])) {
                return ['success' => false, 'error' => 'Failed to load assets', 'data' => []];
            }
            $assets = $result['data'];
            @file_put_contents($cacheFile, json_encode($assets));
        }

        $q = strtoupper($query);
        $matches = [];
        foreach ($assets as $a) {
            if (
                ($a['status'] ?? '') === 'active' &&
                ($a['tradable'] ?? false) &&
                (
                    stripos($a['symbol'] ?? '', $q) !== false ||
                    stripos($a['name'] ?? '', $q) !== false
                )
            ) {
                $matches[] = $a;
                if (count($matches) >= $limit) break;
            }
        }

        usort($matches, function ($a, $b) use ($q) {
            $aSymbol = strtoupper($a['symbol'] ?? '');
            $bSymbol = strtoupper($b['symbol'] ?? '');

            if ($aSymbol === $q && $bSymbol !== $q) return -1;
            if ($bSymbol === $q && $aSymbol !== $q) return 1;

            $aStarts = str_starts_with($aSymbol, $q);
            $bStarts = str_starts_with($bSymbol, $q);
            if ($aStarts && !$bStarts) return -1;
            if ($bStarts && !$aStarts) return 1;

            return strcmp($aSymbol, $bSymbol);
        });

        return ['success' => true, 'data' => $matches];
    }

    // ─── Helpers ─────────────────────────────────────────────

    /**
     * Cached asset name map (symbol → name). Built from full asset list, 6-hour TTL.
     */
    private function getCachedAssetNames(): array
    {
        $cacheDir  = '/tmp/stockloyal_cache';
        $cacheFile = $cacheDir . '/alpaca_asset_names.json';
        $cacheTime = 21600; // 6 hours

        if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);

        if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTime) {
            $names = json_decode(file_get_contents($cacheFile), true);
            if (is_array($names) && !empty($names)) return $names;
        }

        $result = $this->getAssets('us_equity');
        if (!$result['success'] || !is_array($result['data'])) {
            return [];
        }

        $names = [];
        foreach ($result['data'] as $a) {
            $sym = $a['symbol'] ?? '';
            if ($sym) $names[$sym] = $a['name'] ?? $sym;
        }

        @file_put_contents($cacheFile, json_encode($names));
        return $names;
    }

    /**
     * Normalize stock snapshot data into simple quote format.
     */
    public static function normalizeSnapshots(array $snapshots): array
    {
        $results = [];
        foreach ($snapshots as $symbol => $snap) {
            $latestTrade = $snap['latestTrade'] ?? [];
            $prevBar     = $snap['prevDailyBar'] ?? [];
            $dailyBar    = $snap['dailyBar'] ?? [];

            $price     = $latestTrade['p'] ?? $dailyBar['c'] ?? null;
            $prevClose = $prevBar['c'] ?? null;
            $change    = 0;

            if ($price && $prevClose && $prevClose > 0) {
                $change = round((($price - $prevClose) / $prevClose) * 100, 2);
            }

            $results[$symbol] = [
                'symbol'      => $symbol,
                'price'       => $price,
                'change'      => $change,
                'volume'      => $dailyBar['v'] ?? null,
                'trade_count' => $dailyBar['n'] ?? null,
            ];
        }
        return $results;
    }

    /**
     * Normalize crypto snapshot data.
     */
    public static function normalizeCryptoSnapshots(array $snapshots): array
    {
        $results = [];
        foreach ($snapshots as $symbol => $snap) {
            $latestTrade = $snap['latestTrade'] ?? [];
            $dailyBar    = $snap['dailyBar'] ?? [];
            $prevBar     = $snap['prevDailyBar'] ?? [];

            $price     = $latestTrade['p'] ?? $dailyBar['c'] ?? null;
            $prevClose = $prevBar['c'] ?? null;
            $change    = 0;

            if ($price && $prevClose && $prevClose > 0) {
                $change = round((($price - $prevClose) / $prevClose) * 100, 2);
            }

            $displaySymbol = str_replace('/', '-', $symbol);

            $results[$displaySymbol] = [
                'symbol' => $displaySymbol,
                'price'  => $price,
                'change' => $change,
                'volume' => $dailyBar['v'] ?? null,
            ];
        }
        return $results;
    }
}
