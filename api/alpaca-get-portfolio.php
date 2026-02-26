<?php
/**
 * alpaca-get-portfolio.php
 * ─────────────────────────────────────────────────────────────────
 * Returns live portfolio data from Alpaca Broker API:
 *   - Account info (cash, buying power, equity, day P&L)
 *   - Positions with mark-to-market values, unrealized P&L, daily %
 *   - Portfolio summary totals
 *
 * POST { member_id }
 * ─────────────────────────────────────────────────────────────────
 */
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

$input    = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId = strtolower(trim((string)($input['member_id'] ?? '')));

if (!$memberId) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Missing member_id"]);
    exit;
}

try {
    // ── 1. Look up Alpaca account from broker_credentials ──
    $stmt = $conn->prepare("
        SELECT broker_account_id, broker_account_status
        FROM broker_credentials
        WHERE member_id = :mid AND LOWER(broker) = 'alpaca'
          AND broker_account_id IS NOT NULL
        LIMIT 1
    ");
    $stmt->execute([':mid' => $memberId]);
    $cred = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$cred || empty($cred['broker_account_id'])) {
        echo json_encode([
            "success" => false,
            "error"   => "No Alpaca brokerage account linked. Complete onboarding first."
        ]);
        exit;
    }

    $accountId = $cred['broker_account_id'];
    $alpaca    = new AlpacaBrokerAPI();

    // ── 2. Fetch trading account (cash, equity, buying power) ──
    $acctResult = $alpaca->getTradingAccount($accountId);
    if (!$acctResult['success']) {
        echo json_encode([
            "success" => false,
            "error"   => "Alpaca account error: " . ($acctResult['error'] ?? 'Unknown'),
        ]);
        exit;
    }
    $acct = $acctResult['data'];

    // ── 3. Fetch open positions ──
    $posResult = $alpaca->getPositions($accountId);
    if (!$posResult['success']) {
        echo json_encode([
            "success" => false,
            "error"   => "Failed to fetch positions: " . ($posResult['error'] ?? 'Unknown'),
        ]);
        exit;
    }
    $rawPositions = $posResult['data'] ?? [];

    // ── 4. Build position rows (compatible with Portfolio.jsx field names) ──
    $positions      = [];
    $totalMarketVal = 0.0;
    $totalCostBasis = 0.0;
    $totalUnrealPL  = 0.0;
    $totalDayPL     = 0.0;

    foreach ($rawPositions as $pos) {
        $qty           = (float)($pos['qty'] ?? 0);
        $avgEntry      = (float)($pos['avg_entry_price'] ?? 0);
        $currentPrice  = (float)($pos['current_price'] ?? 0);
        $marketVal     = (float)($pos['market_value'] ?? 0);
        $costBasis     = (float)($pos['cost_basis'] ?? 0);
        $unrealPL      = (float)($pos['unrealized_pl'] ?? 0);
        $unrealPLpct   = (float)($pos['unrealized_plpc'] ?? 0);        // decimal 0.05 = 5%
        $changeToday   = (float)($pos['change_today'] ?? 0);           // decimal
        $unrealDayPL   = (float)($pos['unrealized_intraday_pl'] ?? 0);
        $unrealDayPLpc = (float)($pos['unrealized_intraday_plpc'] ?? 0);

        $positions[] = [
            // Identity
            'symbol'            => $pos['symbol'] ?? '',
            'stock_name'        => $pos['symbol'] ?? '',   // Alpaca doesn't return company name
            'asset_id'          => $pos['asset_id'] ?? '',
            'asset_class'       => $pos['asset_class'] ?? 'us_equity',
            'side'              => $pos['side'] ?? 'long',

            // Quantity & Prices
            'qty'               => $qty,
            'total_shares'      => $qty,                   // backward compat
            'avg_entry_price'   => $avgEntry,
            'current_price'     => $currentPrice,

            // Values
            'market_value'      => $marketVal,
            'current_value'     => $marketVal,             // backward compat
            'cost_basis'        => $costBasis,

            // Overall P&L (since purchase)
            'unrealized_pl'     => round($unrealPL, 2),
            'unrealized_pl_pct' => round($unrealPLpct * 100, 2),

            // Intraday P&L
            'daily_change'      => round($changeToday * 100, 2),
            'intraday_pl'       => round($unrealDayPL, 2),
            'intraday_pl_pct'   => round($unrealDayPLpc * 100, 2),
        ];

        $totalMarketVal += $marketVal;
        $totalCostBasis += $costBasis;
        $totalUnrealPL  += $unrealPL;
        $totalDayPL     += $unrealDayPL;
    }

    // ── 5. Day P&L from account level ──
    $equity     = (float)($acct['equity'] ?? 0);
    $lastEquity = (float)($acct['last_equity'] ?? 0);
    $dayPLacct  = $equity - $lastEquity;

    // ── 6. Response ──
    echo json_encode([
        "success"         => true,
        "source"          => "alpaca_live",

        "account"         => [
            "account_id"      => $accountId,
            "status"          => $acct['status'] ?? 'unknown',
            "cash"            => (float)($acct['cash'] ?? 0),
            "buying_power"    => (float)($acct['buying_power'] ?? 0),
            "equity"          => $equity,
            "portfolio_value" => (float)($acct['portfolio_value'] ?? 0),
            "last_equity"     => $lastEquity,
            "day_pl"          => round($dayPLacct, 2),
            "day_pl_pct"      => $lastEquity > 0
                ? round(($dayPLacct / $lastEquity) * 100, 2)
                : 0,
            "currency"        => $acct['currency'] ?? 'USD',
        ],

        // "orders" key for backward compat with Portfolio.jsx
        "orders"              => $positions,
        "portfolio_value"     => round($totalMarketVal, 2),
        "total_cost_basis"    => round($totalCostBasis, 2),
        "total_unrealized_pl" => round($totalUnrealPL, 2),
        "total_day_pl"        => round($totalDayPL, 2),
        "positions_count"     => count($positions),
    ]);

} catch (Exception $e) {
    error_log("[alpaca-get-portfolio] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error: " . $e->getMessage()]);
}
