<?php
declare(strict_types=1);

/**
 * simulate-merchant-funding.php
 *
 * SANDBOX ONLY — Simulates merchant ACH payment to the StockLoyal IB sweep account.
 *
 * Two actions:
 *   1. Deposits funds into the Alpaca firm sweep account via Transfer API
 *   2. Marks approved orders as paid (paid_flag = 1) so they advance to journal stage
 *
 * Input:
 *   action:      "preview"  — show what would be funded (dry run)
 *                "fund"     — execute funding + mark paid
 *   merchant_id: optional   — filter to specific merchant
 *   amount:      optional   — override amount to deposit (defaults to total of approved unpaid orders)
 *
 * Output: { success, funded_amount, orders_marked, transfer_id, sweep_balance, ... }
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/BrokerAdapterFactory.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input      = json_decode(file_get_contents('php://input'), true) ?: [];
$action     = trim($input['action'] ?? 'preview');
$merchantId = trim($input['merchant_id'] ?? '');
$overrideAmt = isset($input['amount']) ? (float)$input['amount'] : null;

try {
    // ── 1. Find approved orders awaiting merchant payment ──
    $sql = "
        SELECT o.order_id, o.member_id, o.merchant_id, o.broker, o.symbol,
               o.amount, o.paid_flag, o.status,
               COALESCE(m.merchant_name, o.merchant_id) AS merchant_name
        FROM orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        WHERE LOWER(o.status) = 'approved'
          AND (o.paid_flag = 0 OR o.paid_flag IS NULL)
    ";
    $params = [];
    if ($merchantId) {
        $sql .= " AND o.merchant_id = ?";
        $params[] = $merchantId;
    }
    $sql .= " ORDER BY o.merchant_id, o.member_id";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── 2. Summarize by merchant ──
    $byMerchant = [];
    $totalAmount = 0.0;
    foreach ($orders as $o) {
        $mid = $o['merchant_id'];
        if (!isset($byMerchant[$mid])) {
            $byMerchant[$mid] = [
                'merchant_id'   => $mid,
                'merchant_name' => $o['merchant_name'],
                'order_count'   => 0,
                'total_amount'  => 0.0,
                'members'       => [],
            ];
        }
        $byMerchant[$mid]['order_count']++;
        $byMerchant[$mid]['total_amount'] += (float)$o['amount'];
        $byMerchant[$mid]['members'][$o['member_id']] = true;
        $totalAmount += (float)$o['amount'];
    }

    // Format member counts
    foreach ($byMerchant as &$m) {
        $m['member_count'] = count($m['members']);
        unset($m['members']);
        $m['total_amount'] = round($m['total_amount'], 2);
    }
    unset($m);

    $fundAmount = $overrideAmt !== null ? round($overrideAmt, 2) : round($totalAmount, 2);

    // ── PREVIEW MODE ──
    if ($action === 'preview') {
        // Also get current sweep balance
        $sweepBalance = getSweepBalance($conn, $merchantId ?: 'merchant001');

        echo json_encode([
            'success'        => true,
            'action'         => 'preview',
            'orders_pending' => count($orders),
            'total_due'      => round($totalAmount, 2),
            'fund_amount'    => $fundAmount,
            'sweep_balance'  => $sweepBalance,
            'by_merchant'    => array_values($byMerchant),
        ]);
        exit;
    }

    // ── FUND MODE ──
    if ($action !== 'fund') {
        echo json_encode(['success' => false, 'error' => "Invalid action. Use 'preview' or 'fund'."]);
        exit;
    }

    if (count($orders) === 0 && $overrideAmt === null) {
        echo json_encode([
            'success' => true,
            'message' => 'No unpaid approved orders found. Nothing to fund.',
            'orders_marked' => 0,
            'funded_amount' => 0,
        ]);
        exit;
    }

    // ── 3. Fund Alpaca firm sweep account via Transfer API (sandbox instant) ──
    $transferResult = null;
    if ($fundAmount > 0) {
        $transferResult = fundSweepAccount($conn, $fundAmount, $merchantId ?: 'merchant001');
    }

    // ── 4. Mark orders as paid ──
    $markedCount = 0;
    if (count($orders) > 0) {
        $orderIds = array_column($orders, 'order_id');
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));

        $updateStmt = $conn->prepare("
            UPDATE orders
            SET paid_flag = 1, updated_at = NOW()
            WHERE order_id IN ({$placeholders})
              AND LOWER(status) = 'approved'
              AND (paid_flag = 0 OR paid_flag IS NULL)
        ");
        $updateStmt->execute($orderIds);
        $markedCount = $updateStmt->rowCount();
    }

    // ── 5. Get updated sweep balance ──
    $newBalance = getSweepBalance($conn, $merchantId ?: 'merchant001');

    echo json_encode([
        'success'        => true,
        'action'         => 'fund',
        'funded_amount'  => $fundAmount,
        'orders_marked'  => $markedCount,
        'transfer'       => $transferResult,
        'sweep_balance'  => $newBalance,
        'by_merchant'    => array_values($byMerchant),
    ]);

} catch (Exception $e) {
    error_log("[simulate-merchant-funding] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}


// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fund the Alpaca firm sweep account via Transfer API (sandbox instant deposit).
 */
function fundSweepAccount(PDO $conn, float $amount, string $merchantId): array
{
    try {
        require_once __DIR__ . '/SecretManager.php';

        // Get broker config for this merchant
        $cfgStmt = $conn->prepare("
            SELECT sweep_account_id, broker_api_key_path, broker_api_secret_path
            FROM merchant_broker_config
            WHERE merchant_id = ? AND is_active = 1
            LIMIT 1
        ");
        $cfgStmt->execute([$merchantId]);
        $cfg = $cfgStmt->fetch(PDO::FETCH_ASSOC);

        $firmAccountId = $cfg['sweep_account_id'] ?? '';
        if (empty($firmAccountId)) {
            $firmAccountId = $_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? getenv('ALPACA_FIRM_ACCOUNT_ID') ?: '';
        }
        if (empty($firmAccountId)) {
            return ['success' => false, 'error' => 'No firm sweep account ID configured'];
        }

        // Resolve API credentials from SecretManager
        
        $apiKey    = '';
        $apiSecret = '';

        if (!empty($cfg['broker_api_key_path'])) {
            $apiKey = SecretManager::get($cfg['broker_api_key_path']) ?: '';
        }
        if (!empty($cfg['broker_api_secret_path'])) {
            $apiSecret = SecretManager::get($cfg['broker_api_secret_path']) ?: '';
        }

        // Fallback to ENV
        if (empty($apiKey)) {
            $apiKey = $_ENV['ALPACA_BROKER_API_KEY'] ?? getenv('ALPACA_BROKER_API_KEY') ?: '';
        }
        if (empty($apiSecret)) {
            $apiSecret = $_ENV['ALPACA_BROKER_API_SECRET'] ?? getenv('ALPACA_BROKER_API_SECRET') ?: '';
        }

        if (empty($apiKey) || empty($apiSecret)) {
            return ['success' => false, 'error' => 'Broker API credentials not found'];
        }

        $baseUrl = $_ENV['ALPACA_BROKER_BASE_URL'] ?? getenv('ALPACA_BROKER_BASE_URL')
            ?: 'https://broker-api.sandbox.alpaca.markets';

        // Sandbox Transfer API: instant deposit
        $transferUrl = $baseUrl . '/v1/accounts/' . urlencode($firmAccountId) . '/transfers';

        $payload = [
            'transfer_type' => 'wire',
            'amount'        => number_format($amount, 2, '.', ''),
            'direction'     => 'INCOMING',
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $transferUrl,
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_USERPWD        => $apiKey . ':' . $apiSecret,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_TIMEOUT        => 30,
        ]);

        $resp     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            return ['success' => false, 'error' => "cURL error: $curlErr"];
        }

        $data = json_decode($resp, true) ?: [];

        if ($httpCode >= 200 && $httpCode < 300) {
            return [
                'success'     => true,
                'transfer_id' => $data['id'] ?? null,
                'status'      => $data['status'] ?? 'COMPLETE',
                'amount'      => $amount,
                'account_id'  => $firmAccountId,
            ];
        }

        $errMsg = $data['message'] ?? $data['error'] ?? "HTTP $httpCode";
        return ['success' => false, 'error' => $errMsg, 'http_code' => $httpCode];

    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Get current cash balance of the firm sweep account.
 */
function getSweepBalance(PDO $conn, string $merchantId): ?float
{
    try {
        $adapter = BrokerAdapterFactory::forMerchant($conn, $merchantId, 'Alpaca');
        $alpaca  = $adapter->getApi();

        $firmAccountId = null;
        $cfgStmt = $conn->prepare("
            SELECT sweep_account_id FROM merchant_broker_config
            WHERE merchant_id = ? AND is_active = 1 LIMIT 1
        ");
        $cfgStmt->execute([$merchantId]);
        $cfg = $cfgStmt->fetch(PDO::FETCH_ASSOC);
        $firmAccountId = $cfg['sweep_account_id'] ?? null;

        if (empty($firmAccountId)) {
            $firmAccountId = $_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? getenv('ALPACA_FIRM_ACCOUNT_ID') ?: '';
        }

        if (empty($firmAccountId)) return null;

        $result = $alpaca->getTradingAccount($firmAccountId);
        if ($result['success']) {
            return (float)($result['data']['cash'] ?? 0);
        }
        return null;
    } catch (Exception $e) {
        error_log("[simulate-merchant-funding] getSweepBalance error: " . $e->getMessage());
        return null;
    }
}
