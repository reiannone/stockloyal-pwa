<?php
declare(strict_types=1);

/**
 * request-member-sync.php
 *
 * Outbound request to merchant to sync a member's current points and tier.
 * Called by the Wallet on every load / refresh.
 *
 * Flow:
 *   1. Look up the member's wallet → get merchant_id
 *   2. Look up the merchant → get webhook_url
 *   3. POST a member_sync_request to the merchant's webhook_url
 *   4. If the merchant responds synchronously with points / tier:
 *        → update the wallet table + recalculate cash_balance
 *        → log any points delta to transactions_ledger
 *   5. Return fresh data to the frontend
 *   6. If the merchant can't respond in time, it may call back
 *      asynchronously to merchant-receiver.php (member_sync_response)
 *
 * Endpoint: https://api.stockloyal.com/api/request-member-sync.php
 */

// ============================================================================
// CORS + method guard
// ============================================================================

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

$logDir  = '/var/www/html/stockloyal-pwa/logs';
$logFile = $logDir . '/member-sync.log';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}

function logSync(string $logFile, string $msg): void
{
    file_put_contents($logFile, "[" . gmdate('Y-m-d H:i:s') . "] {$msg}\n", FILE_APPEND);
}

function respond(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

try {
    $conn = new PDO(
        "mysql:host=stockloyal-db.ctms60ci403w.us-east-2.rds.amazonaws.com;dbname=stockloyal;charset=utf8mb4",
        'admin',
        'StockLoyal2025!',
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    error_log("request-member-sync.php: DB connect failed: " . $e->getMessage());
    respond(['success' => false, 'error' => 'Database connection failed'], 500);
}

// ============================================================================
// PARSE INPUT
// ============================================================================

$input    = json_decode(file_get_contents('php://input'), true);
$memberId = $input['member_id'] ?? null;

if (!$memberId) {
    respond(['success' => false, 'error' => 'Missing member_id'], 400);
}

logSync($logFile, str_repeat('=', 70));
logSync($logFile, "Sync request for member: {$memberId}");

// ============================================================================
// MAIN LOGIC
// ============================================================================

try {
    // ------------------------------------------------------------------
    // 1.  Get the member's current wallet row
    // ------------------------------------------------------------------
    $walletStmt = $conn->prepare("
        SELECT member_id, merchant_id, points, member_tier,
               cash_balance, member_timezone, updated_at
        FROM   wallet
        WHERE  member_id = ?
        LIMIT  1
    ");
    $walletStmt->execute([$memberId]);
    $wallet = $walletStmt->fetch();

    if (!$wallet) {
        logSync($logFile, "⚠️ Wallet not found for {$memberId}");
        respond(['success' => false, 'error' => 'Member wallet not found'], 404);
    }

    $merchantId = $wallet['merchant_id'] ?? null;

    if (!$merchantId) {
        logSync($logFile, "No merchant linked — returning DB data");
        respond([
            'success'      => true,
            'synced'       => false,
            'reason'       => 'no_merchant',
            'points'       => (int) $wallet['points'],
            'member_tier'  => $wallet['member_tier'],
            'cash_balance' => $wallet['cash_balance'],
        ]);
    }

    // ------------------------------------------------------------------
    // 2.  Look up the merchant's webhook_url
    // ------------------------------------------------------------------
    $merchantStmt = $conn->prepare("
        SELECT merchant_id, merchant_name, webhook_url, api_key, conversion_rate
        FROM   merchant
        WHERE  merchant_id = ?
        LIMIT  1
    ");
    $merchantStmt->execute([$merchantId]);
    $merchant = $merchantStmt->fetch();

    if (!$merchant || empty(trim($merchant['webhook_url'] ?? ''))) {
        logSync($logFile, "Merchant {$merchantId} has no webhook_url — returning DB data");
        respond([
            'success'      => true,
            'synced'       => false,
            'reason'       => 'no_webhook_url',
            'points'       => (int) $wallet['points'],
            'member_tier'  => $wallet['member_tier'],
            'cash_balance' => $wallet['cash_balance'],
        ]);
    }

    // ------------------------------------------------------------------
    // 3.  Send outbound sync request to the merchant
    // ------------------------------------------------------------------
    $requestId       = 'sync_' . uniqid('', true);
    $outboundPayload = json_encode([
        'event_type'       => 'member_sync_request',
        'request_id'       => $requestId,
        'member_id'        => $memberId,
        'merchant_id'      => $merchantId,
        'requested_fields' => ['points', 'tier'],
        'callback_url'     => 'https://api.stockloyal.com/api/merchant-receiver.php',
        'timestamp'        => gmdate('c'),
    ]);

    logSync($logFile, "→ POST {$merchant['webhook_url']}  payload={$outboundPayload}");

    $ch = curl_init($merchant['webhook_url']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $outboundPayload,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Event-Type: member_sync_request',
            'X-Request-Id: ' . $requestId,
            'X-Source: StockLoyal',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response  = curl_exec($ch);
    $httpCode  = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        logSync($logFile, "⚠️ cURL error: {$curlError}");
    }

    // ------------------------------------------------------------------
    // 4.  Process the merchant's response (if synchronous)
    // ------------------------------------------------------------------
    $synced          = false;
    $pointsUpdated   = false;
    $tierUpdated     = false;
    $newPoints       = (int) $wallet['points'];
    $newTier         = $wallet['member_tier'];
    $newCashBalance  = $wallet['cash_balance'];
    $conversionRate  = (float) ($merchant['conversion_rate'] ?? 0);

    if ($httpCode >= 200 && $httpCode < 300 && $response) {
        $merchantResponse = json_decode($response, true);
        logSync($logFile, "← Merchant HTTP {$httpCode}: {$response}");

        if (is_array($merchantResponse) && ($merchantResponse['success'] ?? false)) {

            // --- points ---
            $mPoints = $merchantResponse['points']
                    ?? $merchantResponse['available_points']
                    ?? $merchantResponse['point_balance']
                    ?? null;
            if ($mPoints !== null) {
                $mPoints = (int) $mPoints;
                if ($mPoints !== (int) $wallet['points']) {
                    $newPoints     = $mPoints;
                    $pointsUpdated = true;
                }
            }

            // --- tier ---
            $mTier = $merchantResponse['tier']
                  ?? $merchantResponse['member_tier']
                  ?? $merchantResponse['loyalty_tier']
                  ?? null;
            if ($mTier !== null && $mTier !== $wallet['member_tier']) {
                $newTier     = $mTier;
                $tierUpdated = true;
            }

            // --- persist changes ---
            if ($pointsUpdated || $tierUpdated) {
                $setClauses = ['updated_at = NOW()'];
                $params     = [];

                if ($pointsUpdated) {
                    $setClauses[] = 'points = ?';
                    $params[]     = $newPoints;

                    if ($conversionRate > 0) {
                        $newCashBalance = number_format($newPoints * $conversionRate, 2, '.', '');
                        $setClauses[]   = 'cash_balance = ?';
                        $params[]       = $newCashBalance;
                    }
                }

                if ($tierUpdated) {
                    $setClauses[] = 'member_tier = ?';
                    $params[]     = $newTier;
                }

                $params[] = $memberId;
                $sql = "UPDATE wallet SET " . implode(', ', $setClauses) . " WHERE member_id = ?";
                $conn->prepare($sql)->execute($params);

                logSync($logFile, "✅ Wallet updated: points={$newPoints}, tier={$newTier}, cash={$newCashBalance}");

                // Log points delta to ledger
                if ($pointsUpdated) {
                    $diff      = $newPoints - (int) $wallet['points'];
                    $direction = $diff > 0 ? 'inbound' : 'outbound';
                    $txType    = $diff > 0 ? 'merchant_sync_credit' : 'merchant_sync_debit';

                    try {
                        $conn->prepare("
                            INSERT INTO transactions_ledger
                              (member_id, merchant_id, client_tx_id, tx_type, direction,
                               channel, status, amount_points, note, member_timezone)
                            VALUES (?, ?, ?, ?, ?, 'Merchant Sync', 'confirmed', ?, ?, ?)
                        ")->execute([
                            $memberId,
                            $merchantId,
                            $requestId,
                            $txType,
                            $direction,
                            abs($diff),
                            "Merchant sync: {$wallet['points']} → {$newPoints} (from {$merchant['merchant_name']})",
                            $wallet['member_timezone'] ?? 'America/New_York',
                        ]);
                        logSync($logFile, "✅ Ledger entry: {$txType} {$diff} pts");
                    } catch (PDOException $e) {
                        logSync($logFile, "⚠️ Ledger insert failed: " . $e->getMessage());
                    }
                }

                $synced = true;
            } else {
                logSync($logFile, "✅ Data already in sync — no changes");
                $synced = true;
            }
        } else {
            logSync($logFile, "⚠️ Merchant response missing success flag or invalid");
        }
    } else {
        logSync($logFile, "⚠️ Merchant unreachable or non-2xx (HTTP {$httpCode}) — returning DB data");
    }

    // ------------------------------------------------------------------
    // 5.  Return result to frontend
    // ------------------------------------------------------------------
    logSync($logFile, str_repeat('-', 70));

    respond([
        'success'         => true,
        'synced'          => $synced,
        'points'          => $newPoints,
        'member_tier'     => $newTier,
        'cash_balance'    => $newCashBalance,
        'points_changed'  => $pointsUpdated,
        'tier_changed'    => $tierUpdated,
        'previous_points' => (int) $wallet['points'],
        'previous_tier'   => $wallet['member_tier'],
        'request_id'      => $requestId,
    ]);

} catch (Exception $e) {
    logSync($logFile, "❌ ERROR: " . $e->getMessage());
    respond(['success' => false, 'error' => $e->getMessage()], 500);
}
