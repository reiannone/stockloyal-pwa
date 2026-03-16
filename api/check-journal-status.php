<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

// Use alpaca-broker-config.php so credentials resolve through SecretManager
// (same path as journal-sweep.php uses). Raw getenv() returns empty strings
// when secrets come from AWS SecretManager rather than shell environment.
require_once __DIR__ . '/alpaca-broker-config.php';

$input       = json_decode(file_get_contents('php://input'), true) ?? [];
$journal_ids = $input['journal_ids'] ?? [];

if (empty($journal_ids) || !is_array($journal_ids)) {
    echo json_encode(['success' => false, 'error' => 'No journal_ids provided']);
    exit;
}

// BROKER_API_KEY, BROKER_API_SECRET, BROKER_BASE_URL are now defined
// constants resolved via SecretManager — same credentials journal-sweep.php uses.
$alpacaKey    = BROKER_API_KEY;
$alpacaSecret = BROKER_API_SECRET;
$baseUrl      = BROKER_BASE_URL;
$auth         = base64_encode("{$alpacaKey}:{$alpacaSecret}");

$statuses        = [];
$errors          = [];
$updatedMerchants = []; // track merchants that need cycle counter resync

foreach ($journal_ids as $journalId) {
    $journalId = trim((string) $journalId);
    if (!$journalId) continue;

    $url = "{$baseUrl}/v1/journals/{$journalId}";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Basic {$auth}",
            "Accept: application/json",
        ],
        CURLOPT_TIMEOUT        => 10,
    ]);

    $body     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        $errors[] = "Journal {$journalId}: HTTP {$httpCode}";
        continue;
    }

    $data   = json_decode($body, true);
    $status = strtolower($data['status'] ?? 'unknown');
    $statuses[$journalId] = $status;

    if ($status === 'executed') {
        // ── Update orders: set both status and journal_status ──────────
        // Must include 'funded' in the WHERE clause to catch orders that
        // already had status set by a prior journal run but whose
        // journal_status was never written as 'executed'.
        try {
            $stmt = $conn->prepare("
                UPDATE orders
                SET status         = 'funded',
                    journal_status = 'executed'
                WHERE alpaca_journal_id = ?
                  AND status IN ('approved', 'journaled', 'funded')
            ");
            $stmt->execute([$journalId]);

            // Collect the merchant_ids affected so we can resync cycle counts
            $merStmt = $conn->prepare("
                SELECT DISTINCT merchant_id
                FROM orders
                WHERE alpaca_journal_id = ?
            ");
            $merStmt->execute([$journalId]);
            foreach ($merStmt->fetchAll(PDO::FETCH_COLUMN) as $mid) {
                if ($mid) $updatedMerchants[$mid] = true;
            }

        } catch (Exception $e) {
            error_log("check-journal-status.php DB update error: " . $e->getMessage());
        }

    } elseif ($status === 'canceled' || $status === 'rejected') {
        // Mark journal as failed so the admin can see it clearly
        try {
            $stmt = $conn->prepare("
                UPDATE orders
                SET journal_status = ?
                WHERE alpaca_journal_id = ?
                  AND status IN ('approved', 'journaled', 'funded')
            ");
            $stmt->execute([$status, $journalId]);
        } catch (Exception $e) {
            error_log("check-journal-status.php DB update (cancel/reject) error: " . $e->getMessage());
        }
    }
}

// ─── Resync pipeline_cycles counters for every affected merchant ──────────────
// This keeps the sweep guard's "funded orders" count accurate after
// check-journal-status confirms journals have executed at Alpaca.
foreach (array_keys($updatedMerchants) as $merchantId) {
    resyncCycleCounts($conn, (string) $merchantId);
}

echo json_encode([
    'success'  => true,
    'statuses' => $statuses,
    'errors'   => $errors,
]);


/* ═══════════════════════════════════════════════════════════════════════
   RESYNC PIPELINE CYCLE COUNTS FOR A MERCHANT
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Resyncs the denormalised counter columns on pipeline_cycles for the
 * most-recent open/locked cycle belonging to $merchantId.
 *
 * Kept in sync with the identical copy in journal-sweep.php.
 * If you change the counter columns here, update that file too.
 */
function resyncCycleCounts(PDO $conn, string $merchantId): void
{
    try {
        $cycleStmt = $conn->prepare("
            SELECT id, batch_id
            FROM pipeline_cycles
            WHERE merchant_id_str = ?
              AND status IN ('open', 'locked')
            ORDER BY created_at DESC
            LIMIT 1
        ");
        $cycleStmt->execute([$merchantId]);
        $cycle = $cycleStmt->fetch(PDO::FETCH_ASSOC);

        if (!$cycle || !$cycle['batch_id']) {
            return; // no active cycle for this merchant — nothing to resync
        }

        $cycleId = (int) $cycle['id'];
        $batchId = $cycle['batch_id'];

        $counts = $conn->prepare("
            SELECT
                COUNT(*)                                                                     AS orders_total,
                COUNT(DISTINCT member_id)                                                    AS baskets_total,
                SUM(status = 'approved')                                                     AS orders_approved,
                SUM(status = 'funded')                                                       AS orders_funded,
                SUM(status IN ('placed','submitted','confirmed','executed'))                  AS orders_placed,
                SUM(status IN ('submitted','confirmed','executed'))                           AS orders_submitted,
                SUM(status = 'settled')                                                      AS orders_settled,
                SUM(status = 'failed')                                                       AS orders_failed,
                SUM(status = 'cancelled')                                                    AS orders_cancelled,
                COALESCE(SUM(amount), 0)                                                     AS amount_total,
                COALESCE(SUM(CASE WHEN status IN ('funded','placed','submitted','confirmed','executed','settled')
                                  THEN amount END), 0)                                       AS amount_funded,
                COALESCE(SUM(CASE WHEN status = 'settled' THEN amount END), 0)               AS amount_settled
            FROM orders
            WHERE batch_id = ?
        ");
        $counts->execute([$batchId]);
        $c = $counts->fetch(PDO::FETCH_ASSOC);

        $upd = $conn->prepare("
            UPDATE pipeline_cycles SET
                orders_total     = ?,
                baskets_total    = ?,
                orders_approved  = ?,
                orders_funded    = ?,
                orders_placed    = ?,
                orders_submitted = ?,
                orders_settled   = ?,
                orders_failed    = ?,
                orders_cancelled = ?,
                amount_total     = ?,
                amount_funded    = ?,
                amount_settled   = ?,
                updated_at       = NOW()
            WHERE id = ?
        ");
        $upd->execute([
            (int)   $c['orders_total'],
            (int)   $c['baskets_total'],
            (int)   $c['orders_approved'],
            (int)   $c['orders_funded'],
            (int)   $c['orders_placed'],
            (int)   $c['orders_submitted'],
            (int)   $c['orders_settled'],
            (int)   $c['orders_failed'],
            (int)   $c['orders_cancelled'],
            (float) $c['amount_total'],
            (float) $c['amount_funded'],
            (float) $c['amount_settled'],
            $cycleId,
        ]);

        error_log("check-journal-status.php resyncCycleCounts cycle_id=$cycleId merchant=$merchantId " .
            "orders_funded={$c['orders_funded']}");

    } catch (Exception $e) {
        error_log("check-journal-status.php resyncCycleCounts error for merchant $merchantId: " . $e->getMessage());
    }
}
