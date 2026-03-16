<?php
declare(strict_types=1);

/**
 * journal-sweep.php
 *
 * Journals funds from StockLoyal firm/sweep account → individual member
 * Alpaca brokerage accounts using the Alpaca Broker API /v1/journals endpoint.
 *
 * Actions:
 *   journal      – Journal selected members (member_ids array)
 *   journal_all  – Journal all eligible members
 *   status       – Check journal status by alpaca_journal_id
 *
 * Flow:
 *   1. Find settled orders not yet journaled (grouped by member)
 *   2. For each member:
 *      a. Ensure member has an Alpaca account (create if needed)
 *      b. Calculate total amount to journal
 *      c. POST /v1/journals with JNLC entry from firm → member
 *      d. Update orders: status = 'funded', journal_status = 'completed', journaled_at = NOW()
 *   3. Resync pipeline_cycles denormalised counters for affected merchants
 *   4. Return summary
 *
 * Prerequisites:
 *   - Orders must be status = 'approved' with paid_flag = 1 (merchant has paid)
 *   - Members must have broker_account_id (or will be auto-provisioned)
 *   - Firm sweep account must have sufficient balance
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/alpaca-broker-config.php';
require_once __DIR__ . '/BrokerAdapterFactory.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── Parse input ──────────────────────────────────────────────────────
$input  = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';

try {
    switch ($action) {
        case 'journal':
            $memberIds = $input['member_ids'] ?? [];
            if (empty($memberIds)) {
                throw new Exception('No member_ids provided');
            }
            echo json_encode(runJournal($conn, $memberIds));
            break;

        case 'journal_all':
            echo json_encode(runJournal($conn, null)); // null = all eligible
            break;

        case 'status':
            $journalId = $input['journal_id'] ?? '';
            echo json_encode(checkJournalStatus($journalId));
            break;

        default:
            throw new Exception("Invalid action: $action");
    }
} catch (Exception $e) {
    brokerLog("JOURNAL-SWEEP ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN JOURNAL FUNCTION
   ═══════════════════════════════════════════════════════════════════════ */

function runJournal(PDO $conn, ?array $memberIds): array
{
    brokerLog("JOURNAL-SWEEP: Starting journal process" .
        ($memberIds ? " for " . count($memberIds) . " members" : " for ALL eligible"));

    // ─── 1. Get eligible orders (approved + paid, not yet funded) ──────
    $sql = "
        SELECT
            o.order_id,
            o.member_id,
            o.merchant_id,
            o.basket_id,
            o.broker,
            o.symbol,
            o.amount,
            bc.broker_account_id,
            bc.broker_account_status,
            m.first_name,
            m.last_name,
            m.member_email
        FROM orders o
        LEFT JOIN wallet m ON o.member_id = m.member_id
        LEFT JOIN broker_credentials bc ON o.member_id = bc.member_id AND o.broker = bc.broker
        WHERE o.status = 'approved'
          AND o.paid_flag = 1
    ";

    if ($memberIds !== null && count($memberIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($memberIds), '?'));
        $sql .= " AND o.member_id IN ($placeholders)";
    }
    $sql .= " ORDER BY o.member_id, o.order_id";

    $stmt = $conn->prepare($sql);
    if ($memberIds !== null && count($memberIds) > 0) {
        $stmt->execute($memberIds);
    } else {
        $stmt->execute();
    }
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($orders)) {
        return [
            'success'          => true,
            'message'          => 'No eligible orders to journal',
            'members_funded'   => 0,
            'journals_created' => 0,
            'total_journaled'  => 0,
        ];
    }

    // ─── 2. Group orders by member ────────────────────────────────────
    $memberGroups = [];
    foreach ($orders as $o) {
        $mid = $o['member_id'];
        if (!isset($memberGroups[$mid])) {
            $memberGroups[$mid] = [
                'member_id'          => $mid,
                'broker'             => $o['broker'],
                'merchant_id'        => $o['merchant_id'],
                'broker_account_id'  => $o['broker_account_id'],
                'broker_status'      => $o['broker_account_status'],
                'name'               => trim(($o['first_name'] ?? '') . ' ' . ($o['last_name'] ?? '')),
                'member_email'       => $o['member_email'],
                'total_amount'       => 0.0,
                'order_ids'          => [],
            ];
        }
        $memberGroups[$mid]['total_amount'] += (float) $o['amount'];
        $memberGroups[$mid]['order_ids'][]   = (int) $o['order_id'];
    }

    // ─── 3. Process each member ───────────────────────────────────────
    $results         = [];
    $membersFunded   = 0;
    $journalsCreated = 0;
    $totalJournaled  = 0.0;
    $errors          = [];
    $affectedMerchants = [];

    foreach ($memberGroups as $mid => $group) {
        try {
            // 3a. Ensure Alpaca account exists
            $alpacaAccountId = $group['broker_account_id'];
            $validStatuses = ['ACTIVE', 'APPROVED', 'ACCOUNT_UPDATED', 'SUBMITTED', 'ACTION_REQUIRED'];
            $hasValidAccount = !empty($alpacaAccountId) && in_array($group['broker_status'], $validStatuses, true);

            if (!$hasValidAccount) {
                // Try to provision account
                $alpacaAccountId = ensureMemberAlpacaAccount($conn, $group);
                if (!$alpacaAccountId) {
                    throw new Exception("Member $mid: No Alpaca account and auto-provision failed");
                }
            }

            // 3b. Journal funds from firm sweep → member
            $amount = round($group['total_amount'], 2);

            // Enforce minimum ($1) — Alpaca requires at least $1 for JNLC
            if ($amount < 1.00) {
                brokerLog("JOURNAL-SWEEP: Skipping member $mid — amount \$$amount below \$1 minimum");
                continue;
            }

            $journalResult = postJournal($alpacaAccountId, $amount, $group['name'], $mid, $group['merchant_id'] ?? '');

            if (!$journalResult['success']) {
                throw new Exception("Alpaca journal failed: " . ($journalResult['error'] ?? 'Unknown'));
            }

            $journalId = $journalResult['journal_id'];

            // 3c. Update orders: approved → funded + journal info
            $orderPlaceholders = implode(',', array_fill(0, count($group['order_ids']), '?'));
            $updateStmt = $conn->prepare("
                UPDATE orders
                SET status            = 'funded',
                    journal_status    = 'completed',
                    alpaca_journal_id = ?,
                    journaled_at      = NOW()
                WHERE order_id IN ($orderPlaceholders)
            ");
            $params = array_merge([$journalId], $group['order_ids']);
            $updateStmt->execute($params);

            $membersFunded++;
            $journalsCreated++;
            $totalJournaled += $amount;

            // Track which merchants need counter resync
            if (!empty($group['merchant_id'])) {
                $affectedMerchants[$group['merchant_id']] = true;
            }

            $results[] = [
                'member_id'         => $mid,
                'member_name'       => $group['name'],
                'amount'            => $amount,
                'orders_count'      => count($group['order_ids']),
                'alpaca_journal_id' => $journalId,
                'status'            => 'funded',
            ];

            brokerLog("JOURNAL-SWEEP: Journaled \${$amount} to member $mid (journal: $journalId)");

        } catch (Exception $e) {
            brokerLog("JOURNAL-SWEEP ERROR: Member $mid: " . $e->getMessage());

            // Mark orders as journal_failed
            $orderPlaceholders = implode(',', array_fill(0, count($group['order_ids']), '?'));
            $failStmt = $conn->prepare("
                UPDATE orders
                SET journal_status = 'failed'
                WHERE order_id IN ($orderPlaceholders)
            ");
            $failStmt->execute($group['order_ids']);

            $errors[] = [
                'member_id' => $mid,
                'error'     => $e->getMessage(),
            ];

            $results[] = [
                'member_id'   => $mid,
                'member_name' => $group['name'],
                'amount'      => $group['total_amount'],
                'status'      => 'failed',
                'error'       => $e->getMessage(),
            ];
        }
    }

    // ─── 4. Resync pipeline_cycles denormalised counters ─────────────
    //     The sweep guard reads orders_funded from pipeline_cycles; without
    //     this resync it stays 0 even though orders.status is now 'funded'.
    if ($journalsCreated > 0) {
        foreach (array_keys($affectedMerchants) as $merchantId) {
            resyncCycleCounts($conn, (string)$merchantId);
        }
    }

    brokerLog("JOURNAL-SWEEP: Complete — $membersFunded funded, $journalsCreated journals, \${$totalJournaled} total");

    return [
        'success'          => true,
        'members_funded'   => $membersFunded,
        'journals_created' => $journalsCreated,
        'total_journaled'  => $totalJournaled,
        'results'          => $results,
        'errors'           => $errors,
    ];
}


/* ═══════════════════════════════════════════════════════════════════════
   RESYNC PIPELINE CYCLE COUNTS FOR A MERCHANT
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Resyncs the denormalised counter columns on pipeline_cycles for the
 * most-recent open/locked cycle belonging to $merchantId.
 *
 * Called after journaling so the sweep guard's "funded orders" check
 * reflects reality immediately — without requiring a manual update_counts
 * call from the Pipeline Cycles admin UI.
 */
function resyncCycleCounts(PDO $conn, string $merchantId): void
{
    try {
        // Find the active cycle for this merchant
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
            brokerLog("JOURNAL-SWEEP: resyncCycleCounts — no open cycle/batch for merchant $merchantId, skipping");
            return;
        }

        $cycleId = (int) $cycle['id'];
        $batchId = $cycle['batch_id'];

        // Aggregate live counts from orders
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

        brokerLog("JOURNAL-SWEEP: resyncCycleCounts cycle_id=$cycleId merchant=$merchantId — " .
            "orders_funded={$c['orders_funded']} orders_approved={$c['orders_approved']}");

    } catch (Exception $e) {
        // Non-fatal: log and continue — sweep guard will show stale count
        // but manual update_counts from Cycle admin will fix it.
        brokerLog("JOURNAL-SWEEP: resyncCycleCounts FAILED for merchant $merchantId: " . $e->getMessage());
        error_log("journal-sweep.php resyncCycleCounts error: " . $e->getMessage());
    }
}


/* ═══════════════════════════════════════════════════════════════════════
   ALPACA JOURNAL API CALL
   ═══════════════════════════════════════════════════════════════════════ */

function postJournal(string $toAccountId, float $amount, string $memberName, string $memberId, string $merchantId = ''): array
{
    // Try adapter-based journal (per-merchant credentials from SecretManager)
    if (!empty($merchantId)) {
        try {
            global $conn;
            $adapter = BrokerAdapterFactory::forMerchant($conn, $merchantId, 'Alpaca');
            $result = $adapter->fundAccount($toAccountId, number_format($amount, 2, '.', ''));

            if ($result['success']) {
                $data = $result['data'] ?? [];
                brokerLog("JOURNAL-OK (adapter): journal_id=" . ($data['id'] ?? 'n/a'));
                return [
                    'success'    => true,
                    'journal_id' => $data['id'] ?? null,
                    'status'     => $data['status'] ?? 'executed',
                    'data'       => $data,
                ];
            } else {
                brokerLog("JOURNAL-FAIL (adapter): " . ($result['error'] ?? 'unknown'));
                return ['success' => false, 'error' => $result['error'] ?? 'Journal failed'];
            }
        } catch (Exception $e) {
            brokerLog("JOURNAL-ADAPTER-ERROR: " . $e->getMessage() . " -- falling back to legacy");
            // Fall through to legacy cURL below
        }
    }

    // Legacy fallback: raw cURL with constants from alpaca-broker-config.php

    $url = BROKER_BASE_URL . '/v1/journals';

    $payload = [
        'from_account' => BROKER_FIRM_ACCOUNT_ID,
        'entry_type'   => 'JNLC',                 // Journal Cash
        'to_account'   => $toAccountId,
        'amount'       => number_format($amount, 2, '.', ''),
        'description'  => "StockLoyal points conversion — $memberName ($memberId)",
    ];

    brokerLog("JOURNAL-API: POST $url — \${$amount} → $toAccountId ($memberName)");

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_USERPWD        => BROKER_API_KEY . ':' . BROKER_API_SECRET,
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

    $data = json_decode($resp, true);

    brokerLog("JOURNAL-API: Response HTTP $httpCode — " . substr($resp, 0, 500));

    if ($httpCode >= 200 && $httpCode < 300 && isset($data['id'])) {
        return [
            'success'    => true,
            'journal_id' => $data['id'],
            'status'     => $data['status'] ?? 'executed',
            'data'       => $data,
        ];
    }

    // Handle specific Alpaca errors
    $errMsg = $data['message'] ?? $data['error'] ?? "HTTP $httpCode";
    return ['success' => false, 'error' => $errMsg, 'http_code' => $httpCode];
}


/* ═══════════════════════════════════════════════════════════════════════
   ENSURE MEMBER HAS ALPACA ACCOUNT
   ═══════════════════════════════════════════════════════════════════════ */

function ensureMemberAlpacaAccount(PDO $conn, array $member): ?string
{
    // Check if already stored
    $validStatuses = ['ACTIVE', 'APPROVED', 'ACCOUNT_UPDATED', 'SUBMITTED', 'ACTION_REQUIRED'];
    if (!empty($member['broker_account_id']) && in_array($member['broker_status'], $validStatuses, true)) {
        return $member['broker_account_id'];
    }

    // Try to create via Broker API
    // For sandbox: minimal info required
    $url = BROKER_BASE_URL . '/v1/accounts';

    $payload = [
        'contact' => [
            'email_address'  => $member['member_email'] ?: ($member['member_id'] . '@stockloyal.com'),
            'phone_number'   => '5551234567',
            'street_address' => ['123 Main St'],
            'city'           => 'New York',
            'state'          => 'NY',
            'postal_code'    => '10001',
            'country'        => 'USA',
        ],
        'identity' => [
            'given_name'               => $member['name'] ?: 'Member',
            'family_name'              => $member['member_id'],
            'date_of_birth'            => '1990-01-01',
            'tax_id'                   => '000-00-0000',
            'tax_id_type'              => 'USA_SSN',
            'country_of_citizenship'   => 'USA',
            'country_of_birth'         => 'USA',
            'country_of_tax_residence' => 'USA',
            'funding_source'           => ['employment_income'],
        ],
        'disclosures' => [
            'is_control_person'               => false,
            'is_affiliated_exchange_or_finra' => false,
            'is_politically_exposed'          => false,
            'immediate_family_exposed'        => false,
        ],
        'agreements' => [
            ['agreement' => 'margin_agreement',   'signed_at' => date('c'), 'ip_address' => '127.0.0.1'],
            ['agreement' => 'account_agreement',  'signed_at' => date('c'), 'ip_address' => '127.0.0.1'],
            ['agreement' => 'customer_agreement', 'signed_at' => date('c'), 'ip_address' => '127.0.0.1'],
        ],
    ];

    brokerLog("JOURNAL-PROVISION: Creating Alpaca account for member {$member['member_id']}");

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_USERPWD        => BROKER_API_KEY . ':' . BROKER_API_SECRET,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 30,
    ]);

    $resp     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($resp, true);

    if ($httpCode >= 200 && $httpCode < 300 && isset($data['id'])) {
        $alpacaId     = $data['id'];
        $alpacaNumber = $data['account_number'] ?? '';
        $alpacaStatus = $data['status'] ?? 'ACTIVE';

        // Store in broker_credentials table
        $upd = $conn->prepare("
            UPDATE broker_credentials
            SET broker_account_id     = ?,
                broker_account_number = ?,
                broker_account_status = ?
            WHERE member_id = ? AND broker = ?
        ");
        $upd->execute([$alpacaId, $alpacaNumber, $alpacaStatus, $member['member_id'], $member['broker']]);

        brokerLog("JOURNAL-PROVISION: Created account $alpacaId for member {$member['member_id']}");
        return $alpacaId;
    }

    brokerLog("JOURNAL-PROVISION: Failed HTTP $httpCode — " . substr($resp, 0, 300));
    return null;
}


/* ═══════════════════════════════════════════════════════════════════════
   CHECK JOURNAL STATUS (optional polling)
   ═══════════════════════════════════════════════════════════════════════ */

function checkJournalStatus(string $journalId): array
{
    if (empty($journalId)) {
        return ['success' => false, 'error' => 'journal_id required'];
    }

    $url = BROKER_BASE_URL . '/v1/journals/' . $journalId;

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_USERPWD        => BROKER_API_KEY . ':' . BROKER_API_SECRET,
        CURLOPT_TIMEOUT        => 10,
    ]);

    $resp     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($resp, true);

    if ($httpCode === 200 && $data) {
        return [
            'success' => true,
            'journal' => $data,
        ];
    }

    return ['success' => false, 'error' => "HTTP $httpCode", 'response' => $data];
}
