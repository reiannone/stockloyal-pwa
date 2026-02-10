<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;

if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing member_id"
    ]);
    exit;
}

try {
    // Get current portfolio_value from wallet for comparison
    $currentStmt = $conn->prepare("
        SELECT portfolio_value 
        FROM wallet 
        WHERE member_id = :member_id
    ");
    $currentStmt->execute([":member_id" => $memberId]);
    $currentWallet = $currentStmt->fetch(PDO::FETCH_ASSOC);
    $oldPortfolioValue = (float)($currentWallet['portfolio_value'] ?? 0);

    // ── Trigger sell → sold via broker-receiver webhook ──────────────────────
    // If this member has any orders with status = 'sell', call the broker
    // webhook to transition them to 'sold' before calculating portfolio value.
    $sellCheckStmt = $conn->prepare("
        SELECT order_id 
        FROM orders 
        WHERE member_id = :member_id 
          AND status = 'sell'
    ");
    $sellCheckStmt->execute([":member_id" => $memberId]);
    $sellOrderIds = $sellCheckStmt->fetchAll(PDO::FETCH_COLUMN);

    if (!empty($sellOrderIds)) {
        $webhookUrl = 'https://api.stockloyal.com/api/broker-receiver.php';

        // In local/dev environment, use localhost
        if (strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost') !== false) {
            $webhookUrl = 'http://localhost/api/broker-receiver.php';
        }

        $webhookPayload = json_encode([
            'event_type' => 'order.sold',
            'member_id'  => $memberId,
            'order_ids'  => $sellOrderIds,
            'source'     => 'update-portfolio-value',
        ]);

        $ch = curl_init($webhookUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $webhookPayload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Event-Type: order.sold',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
        ]);
        $webhookResponse = curl_exec($ch);
        $webhookHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $webhookError    = curl_error($ch);
        curl_close($ch);

        if ($webhookHttpCode === 200) {
            $webhookResult = json_decode($webhookResponse, true);
            error_log("update-portfolio-value.php: sell→sold webhook OK for {$memberId}: "
                      . ($webhookResult['orders_updated'] ?? 0) . " orders updated");
        } else {
            error_log("update-portfolio-value.php: sell→sold webhook failed for {$memberId}: "
                      . "HTTP {$webhookHttpCode}, error: {$webhookError}");
        }
    }

    // ── Calculate portfolio value ─────────────────────────────────────────────
    // Only include settled, confirmed, and executed orders (NOT sell or sold)
    $holdingsStmt = $conn->prepare("
        SELECT 
            symbol,
            SUM(COALESCE(executed_shares, shares)) as total_shares,
            SUM(COALESCE(executed_amount, amount)) as total_cost
        FROM orders
        WHERE member_id = :member_id
          AND status IN ('settled', 'confirmed', 'executed')
        GROUP BY symbol
        HAVING SUM(COALESCE(executed_shares, shares)) > 0
    ");
    $holdingsStmt->execute([":member_id" => $memberId]);
    $holdings = $holdingsStmt->fetchAll(PDO::FETCH_ASSOC);
    
    $totalPortfolioValue = 0;
    $useMarketPrices = true;
    
    // Try to get real-time market value using Yahoo Finance
    foreach ($holdings as $holding) {
        $symbol = $holding['symbol'];
        $shares = (float)$holding['total_shares'];
        $costBasis = (float)$holding['total_cost'];
        
        // Attempt to fetch current price from Yahoo Finance
        try {
            $yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/{$symbol}?interval=1d&range=1d";
            $context = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'header' => 'User-Agent: Mozilla/5.0',
                    'timeout' => 3
                ]
            ]);
            
            $yahooResponse = @file_get_contents($yahooUrl, false, $context);
            
            if ($yahooResponse) {
                $yahooData = json_decode($yahooResponse, true);
                $currentPrice = $yahooData['chart']['result'][0]['meta']['regularMarketPrice'] ?? null;
                
                if ($currentPrice && $currentPrice > 0) {
                    // Use real-time market value
                    $totalPortfolioValue += ($shares * $currentPrice);
                } else {
                    // Fallback to cost basis for this holding
                    $totalPortfolioValue += $costBasis;
                    $useMarketPrices = false;
                }
            } else {
                // API failed, use cost basis
                $totalPortfolioValue += $costBasis;
                $useMarketPrices = false;
            }
        } catch (Exception $e) {
            // On error, use cost basis
            $totalPortfolioValue += $costBasis;
            $useMarketPrices = false;
        }
    }
    
    // If no holdings found or all API calls failed, fallback to simple sum
    if (count($holdings) === 0 || !$useMarketPrices) {
        $fallbackStmt = $conn->prepare("
            SELECT COALESCE(SUM(COALESCE(executed_amount, amount)), 0) as total_amount
            FROM orders
            WHERE member_id = :member_id
              AND status IN ('settled', 'confirmed', 'executed')
        ");
        $fallbackStmt->execute([":member_id" => $memberId]);
        $fallbackResult = $fallbackStmt->fetch(PDO::FETCH_ASSOC);
        $totalPortfolioValue = (float)$fallbackResult['total_amount'];
    }
    
    // Save the calculated portfolio_value back to the wallet table
    $updateStmt = $conn->prepare("
        UPDATE wallet 
        SET portfolio_value = :portfolio_value
        WHERE member_id = :member_id
    ");
    $updateStmt->execute([
        ':portfolio_value' => $totalPortfolioValue,
        ':member_id' => $memberId
    ]);

    // Check if value changed significantly (more than $0.01)
    $valueChanged = abs($totalPortfolioValue - $oldPortfolioValue) > 0.01;

    echo json_encode([
        "success" => true,
        "portfolio_value" => (float)$totalPortfolioValue,
        "old_value" => $oldPortfolioValue,
        "value_changed" => $valueChanged,
        "orders_sold" => count($sellOrderIds ?? []),
    ]);

} catch (Exception $e) {
    error_log("update-portfolio-value.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Server error: " . $e->getMessage()
    ]);
}
