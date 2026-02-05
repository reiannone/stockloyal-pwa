<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// api/apply-pending-inbound.php
// ────────────────────────────────────────────────────────────
// Called after a new member creates their account.
// Checks pending_inbound for queued points and applies them
// to the newly created wallet + logs to transactions_ledger.
// ────────────────────────────────────────────────────────────

header("Content-Type: application/json");
require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true);
$memberId = trim($input['member_id'] ?? '');

if (!$memberId) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing member_id']);
    exit;
}

try {
    // ── 1. Find pending inbound records for this member ─────
    $stmt = $conn->prepare("
        SELECT * FROM pending_inbound 
        WHERE member_id = ? AND status = 'pending'
        ORDER BY created_at ASC
    ");
    $stmt->execute([$memberId]);
    $pendingRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($pendingRows)) {
        echo json_encode([
            'success' => true,
            'applied' => 0,
            'message' => 'No pending inbound records found',
        ]);
        exit;
    }

    // ── 2. Verify wallet exists ─────────────────────────────
    $stmt = $conn->prepare("SELECT member_id, points, cash_balance FROM wallet WHERE member_id = ? LIMIT 1");
    $stmt->execute([$memberId]);
    $wallet = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$wallet) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Wallet not found — account may not be fully created yet']);
        exit;
    }

    // ── 3. Apply each pending record ────────────────────────
    $applied = 0;
    $totalPoints = 0;
    $totalCash = 0.0;
    $lastTier = null;

    foreach ($pendingRows as $row) {
        $points       = (int) $row['points'];
        $cashBalance  = (float) $row['cash_balance'];
        $merchantId   = $row['merchant_id'];
        $tier         = $row['tier'] ?? null;
        $action       = $row['action'] ?? 'earn';
        $clientTxId   = $row['client_tx_id'];
        $convRate     = (float) ($row['conversion_rate'] ?? 0.01);

        // Update wallet (REPLACE with latest values, not cumulative add)
        $stmt = $conn->prepare("
            UPDATE wallet 
            SET points = ?, cash_balance = ?, merchant_id = ?, updated_at = NOW()
            WHERE member_id = ?
        ");
        $stmt->execute([$points, $cashBalance, $merchantId, $memberId]);

        // Update tier if provided
        if ($tier) {
            $stmt = $conn->prepare("UPDATE wallet SET member_tier = ?, updated_at = NOW() WHERE member_id = ?");
            $stmt->execute([$tier, $memberId]);
            $lastTier = $tier;
        }

        // Store conversion rate on wallet if column exists
        try {
            $stmt = $conn->prepare("UPDATE wallet SET conversion_rate = ? WHERE member_id = ?");
            $stmt->execute([$convRate, $memberId]);
        } catch (PDOException $e) {
            // Column may not exist — silently skip
        }

        // Map action to tx_type
        $txType = 'points_received';
        $a = strtolower(trim($action));
        if (in_array($a, ['adjust', 'adjust_points', 'adjustment', 'correction'], true)) {
            $txType = 'adjust_points';
        } elseif (in_array($a, ['redeem', 'redeem_points', 'spend'], true)) {
            $txType = 'redeem_points';
        }

        // Log to transactions_ledger (ck_amount_exclusive: only ONE amount field allowed)
        try {
            $note = "Points from merchant (applied post-registration)" . ($tier ? " - Tier: {$tier}" : '');
            $stmt = $conn->prepare("
                INSERT INTO transactions_ledger 
                    (member_id, merchant_id, tx_type, direction, channel, status,
                     amount_points, client_tx_id, note, member_timezone)
                VALUES 
                    (?, ?, ?, 'inbound', 'Internal', 'confirmed',
                     ?, ?, ?, 'America/New_York')
            ");
            $stmt->execute([$memberId, $merchantId, $txType, $points, $clientTxId, $note]);
        } catch (PDOException $e) {
            // Duplicate client_tx_id = already logged (idempotent)
            if (strpos($e->getMessage(), 'Duplicate entry') === false) {
                throw $e;
            }
        }

        // Mark as applied
        $stmt = $conn->prepare("
            UPDATE pending_inbound 
            SET status = 'applied', applied_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$row['id']]);

        $totalPoints = $points;  // REPLACE semantics, last one wins
        $totalCash   = $cashBalance;
        $applied++;
    }

    echo json_encode([
        'success'       => true,
        'applied'       => $applied,
        'member_id'     => $memberId,
        'points'        => $totalPoints,
        'cash_balance'  => $totalCash,
        'tier'          => $lastTier,
        'message'       => "Applied {$applied} pending inbound record(s)",
    ]);

} catch (PDOException $e) {
    error_log("[apply-pending-inbound] DB error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage(),
    ]);
} catch (Exception $e) {
    error_log("[apply-pending-inbound] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage(),
    ]);
}
