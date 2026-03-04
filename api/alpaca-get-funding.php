<?php
declare(strict_types=1);

/**
 * alpaca-get-funding.php
 *
 * Returns the complete funding/money flow history for a member:
 *   1. Plaid transfers   — Merchant → StockLoyal sweep (ACH debits)
 *   2. Alpaca journals    — SL sweep → Member brokerage account (JNLC)
 *   3. Alpaca activities  — CSD (deposits), CSW (withdrawals), DIV (dividends)
 *   4. Local ledger       — StockLoyal transactions_ledger entries
 *
 * Input:  { member_id, ?days (default 90) }
 * Output: { success, plaid_transfers[], journals[], activities[], ledger[], summary }
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/BrokerAdapterFactory.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $input    = json_decode(file_get_contents('php://input'), true) ?: [];
    $memberId = trim($input['member_id'] ?? '');
    $days     = min(max((int)($input['days'] ?? 90), 1), 365);

    if (empty($memberId)) {
        echo json_encode(['success' => false, 'error' => 'member_id required']);
        exit;
    }

    // ── 1. Look up Alpaca account ID ──
    $stmt = $conn->prepare("
        SELECT bc.broker_account_id, w.merchant_id
        FROM broker_credentials bc
        LEFT JOIN wallet w ON w.member_id = bc.member_id
        WHERE bc.member_id = ? AND bc.broker = 'Alpaca' AND bc.broker_account_id IS NOT NULL
        LIMIT 1
    ");
    $stmt->execute([$memberId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row || empty($row['broker_account_id'])) {
        echo json_encode(['success' => false, 'error' => 'No Alpaca account found for this member.']);
        exit;
    }

    $accountId  = $row['broker_account_id'];
    $merchantId = $row['merchant_id'] ?? '';
    $adapter    = BrokerAdapterFactory::forMerchant($conn, $merchantId, 'Alpaca');
    $alpaca     = $adapter->getApi();

    // ── 2. Alpaca transfers (ACH deposits/withdrawals on the account) ──
    $transfers = [];
    $xferResult = $alpaca->getTransfers($accountId);
    if ($xferResult['success'] && is_array($xferResult['data'])) {
        foreach ($xferResult['data'] as $t) {
            $transfers[] = [
                'transfer_id' => $t['id'] ?? '',
                'type'        => $t['type'] ?? '',           // ach, wire
                'direction'   => $t['direction'] ?? '',      // INCOMING, OUTGOING
                'amount'      => (float)($t['amount'] ?? 0),
                'status'      => $t['status'] ?? '',         // COMPLETE, QUEUED, PENDING, RETURNED, etc.
                'created_at'  => $t['created_at'] ?? null,
                'updated_at'  => $t['updated_at'] ?? null,
            ];
        }
    }

    // ── 3. Alpaca journals (cash movements between firm ↔ member) ──
    $journals = [];
    $journalResult = $alpaca->getJournals($days, 'JNLC', $accountId);
    if ($journalResult['success'] && is_array($journalResult['data'])) {
        foreach ($journalResult['data'] as $j) {
            $journals[] = [
                'journal_id'   => $j['id'] ?? '',
                'entry_type'   => $j['entry_type'] ?? 'JNLC',
                'from_account' => $j['from_account'] ?? '',
                'to_account'   => $j['to_account'] ?? '',
                'amount'       => (float)($j['net_amount'] ?? $j['amount'] ?? 0),
                'status'       => $j['status'] ?? '',
                'description'  => $j['description'] ?? '',
                'settle_date'  => $j['settle_date'] ?? null,
                'created_at'   => $j['system_date'] ?? $j['created_at'] ?? null,
            ];
        }
    }

    // ── 4. Alpaca account activities (deposits, withdrawals, dividends) ──
    $activities = [];
    $activityTypes = ['CSD', 'CSW', 'DIV'];

    foreach ($activityTypes as $type) {
        $actResult = $alpaca->getAccountActivities($accountId, $type, $days);
        if ($actResult['success'] && is_array($actResult['data'])) {
            foreach ($actResult['data'] as $a) {
                $activities[] = [
                    'activity_id'      => $a['id'] ?? '',
                    'activity_type'    => $a['activity_type'] ?? $type,
                    'amount'           => (float)($a['net_amount'] ?? $a['qty'] ?? 0),
                    'symbol'           => $a['symbol'] ?? null,
                    'description'      => $a['description'] ?? '',
                    'status'           => $a['status'] ?? 'executed',
                    'transaction_time' => $a['date'] ?? $a['transaction_time'] ?? null,
                ];
            }
        }
    }

    // Sort activities by date desc
    usort($activities, function ($a, $b) {
        return strcmp($b['transaction_time'] ?? '', $a['transaction_time'] ?? '');
    });

    // ── 5. Build summary ──
    $totalTransferred = 0;
    foreach ($transfers as $t) {
        if ($t['direction'] === 'INCOMING' && in_array($t['status'], ['COMPLETE', 'complete'])) {
            $totalTransferred += $t['amount'];
        }
    }

    $totalJournaled = 0;
    foreach ($journals as $j) {
        if (in_array($j['status'], ['executed', 'complete', 'settled'])) {
            $totalJournaled += $j['amount'];
        }
    }

    $totalDividends = 0;
    foreach ($activities as $a) {
        if ($a['activity_type'] === 'DIV') {
            $totalDividends += $a['amount'];
        }
    }

    echo json_encode([
        'success'    => true,
        'account_id' => $accountId,
        'days'       => $days,
        'transfers'  => $transfers,
        'journals'   => $journals,
        'activities' => $activities,
        'summary'    => [
            'transfer_count'        => count($transfers),
            'transfer_total_amount' => round($totalTransferred, 2),
            'journal_count'         => count($journals),
            'journal_total_amount'  => round($totalJournaled, 2),
            'dividend_total'        => round($totalDividends, 2),
            'activity_count'        => count($activities),
        ],
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
