<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// api/demo-inbound.php
// ────────────────────────────────────────────────────────────
// Webhook-style endpoint that simulates a merchant sending
// member + points data to StockLoyal.
//
// For EXISTING members: updates wallet, logs ledger, returns redirect URL.
// For NEW members:      queues in pending_inbound, returns redirect URL.
//
// The frontend (DemoLaunch) calls this instead of opening a
// URL with query params, keeping wallet logic server-side.
// ────────────────────────────────────────────────────────────

header("Content-Type: application/json");
require_once 'config.php';

// ── Parse JSON payload ──────────────────────────────────────
$input = json_decode(file_get_contents("php://input"), true);

$merchantId = trim($input['merchant_id'] ?? '');
$memberId   = strtolower(trim((string)($input['member_id'] ?? '')));
$points     = (int) ($input['points']     ?? 0);
$tier       = trim($input['tier']         ?? '');
$action     = trim($input['action']       ?? 'earn');

// Validate required fields
if (!$merchantId || !$memberId) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing merchant_id or member_id']);
    exit;
}
if ($points <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Points must be a positive number']);
    exit;
}

// ── Idempotency key ─────────────────────────────────────────
$clientTxId = "demo_{$memberId}_{$merchantId}_" . time() . '_' . bin2hex(random_bytes(4));

try {
    // ── 1. Fetch merchant + resolve conversion rate ─────────
    $stmt = $conn->prepare("SELECT * FROM merchant WHERE merchant_id = ? LIMIT 1");
    $stmt->execute([$merchantId]);
    $merchant = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$merchant) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Merchant not found']);
        exit;
    }

    // Base conversion rate
    $conversionRate = (float) ($merchant['conversion_rate'] ?? 0);
    if ($conversionRate <= 0) $conversionRate = 0.01;

    // Tier-specific rate override
    if ($tier) {
        for ($i = 1; $i <= 6; $i++) {
            $tierName = $merchant["tier{$i}_name"] ?? '';
            if ($tierName && strtolower($tierName) === strtolower($tier)) {
                $tierRate = (float) ($merchant["tier{$i}_conversion_rate"] ?? 0);
                if ($tierRate > 0) {
                    $conversionRate = $tierRate;
                }
                break;
            }
        }
    }

    // Compute cash balance (cents-accurate rounding)
    $cashBalance = round($points * $conversionRate, 2);

    // ── 2. Check if member has a wallet ─────────────────────
    $stmt = $conn->prepare("SELECT member_id, points, cash_balance, member_tier FROM wallet WHERE member_id = ? LIMIT 1");
    $stmt->execute([$memberId]);
    $wallet = $stmt->fetch(PDO::FETCH_ASSOC);

    $memberExists = ($wallet !== false);

    if ($memberExists) {
        // ── EXISTING MEMBER: Update wallet + log ledger ─────
        $previousPoints = (int) ($wallet['points'] ?? 0);
        $previousCash   = (float) ($wallet['cash_balance'] ?? 0);

        // Update wallet points and cash_balance (REPLACE, not add)
        $stmt = $conn->prepare("
            UPDATE wallet 
            SET points = ?, cash_balance = ?, updated_at = NOW()
            WHERE member_id = ?
        ");
        $stmt->execute([$points, $cashBalance, $memberId]);

        // Update tier if provided
        if ($tier) {
            $stmt = $conn->prepare("UPDATE wallet SET member_tier = ?, updated_at = NOW() WHERE member_id = ?");
            $stmt->execute([$tier, $memberId]);
        }

        // Map action to ledger tx_type
        $txType = mapActionToTxType($action);

        // Log to transactions_ledger (ck_amount_exclusive: only ONE amount field allowed)
        $stmt = $conn->prepare("
            INSERT INTO transactions_ledger 
                (member_id, merchant_id, tx_type, direction, channel, status,
                 amount_points, client_tx_id, note, member_timezone)
            VALUES 
                (?, ?, ?, 'inbound', 'Internal', 'confirmed',
                 ?, ?, ?, ?)
        ");
        $note = "Points from merchant" . ($tier ? " - Tier: {$tier}" : '');
        $memberTimezone = 'America/New_York';
        $stmt->execute([$memberId, $merchantId, $txType, $points, $clientTxId, $note, $memberTimezone]);

        echo json_encode([
            'success'         => true,
            'member_exists'   => true,
            'member_id'       => $memberId,
            'merchant_id'     => $merchantId,
            'points'          => $points,
            'cash_balance'    => $cashBalance,
            'conversion_rate' => $conversionRate,
            'tier'            => $tier ?: null,
            'previous_points' => $previousPoints,
            'previous_cash'   => $previousCash,
            'client_tx_id'    => $clientTxId,
            'redirect_url'    => buildRedirectUrl($memberId, $merchantId),
        ]);

    } else {
        // ── NEW MEMBER: Queue in pending_inbound ────────────
        $stmt = $conn->prepare("
            INSERT INTO pending_inbound 
                (member_id, merchant_id, points, cash_balance, conversion_rate, tier, action, client_tx_id, status)
            VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ");
        $stmt->execute([
            $memberId, $merchantId, $points, $cashBalance,
            $conversionRate, $tier ?: null, $action, $clientTxId,
        ]);

        echo json_encode([
            'success'         => true,
            'member_exists'   => false,
            'member_id'       => $memberId,
            'merchant_id'     => $merchantId,
            'points'          => $points,
            'cash_balance'    => $cashBalance,
            'conversion_rate' => $conversionRate,
            'tier'            => $tier ?: null,
            'queued'          => true,
            'client_tx_id'    => $clientTxId,
            'redirect_url'    => buildRedirectUrl($memberId, $merchantId),
        ]);
    }

} catch (PDOException $e) {
    error_log("[demo-inbound] DB error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage(),
    ]);
} catch (Exception $e) {
    error_log("[demo-inbound] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage(),
    ]);
}

// ── Helpers ─────────────────────────────────────────────────

function mapActionToTxType(string $action): string {
    $a = strtolower(trim($action));
    if (in_array($a, ['adjust', 'adjust_points', 'adjustment', 'correction'], true)) {
        return 'adjust_points';
    }
    if (in_array($a, ['redeem', 'redeem_points', 'spend'], true)) {
        return 'redeem_points';
    }
    return 'points_received'; // default for earn, refresh, etc.
}

function buildRedirectUrl(string $memberId, string $merchantId): string {
    // Minimal params — wallet data is already server-side
    $params = http_build_query([
        'member_id'   => $memberId,
        'merchant_id' => $merchantId,
    ]);
    // The frontend origin is determined by the caller;
    // we return a relative path the caller can prepend to.
    return "/?" . $params;
}
