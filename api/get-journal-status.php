<?php
declare(strict_types=1);

/**
 * get-journal-status.php
 *
 * Returns data for the Journal Admin page:
 *   - firm_balance:    Current Alpaca firm/sweep account balance
 *   - pending:         Orders that are settled (merchant paid) but not yet journaled to member
 *   - member_summary:  Grouped by member with totals and Alpaca account status
 *   - recent_journals: Completed journal transactions (last 30 days)
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/alpaca-broker-config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    // ─── 1. Get firm sweep account balance from Alpaca ────────────────
    $firmBalance = null;
    try {
        $ch = curl_init();
        $firmUrl = BROKER_BASE_URL . '/v1/trading/accounts/' . BROKER_FIRM_ACCOUNT_ID . '/account';
        curl_setopt_array($ch, [
            CURLOPT_URL            => $firmUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_USERPWD        => BROKER_API_KEY . ':' . BROKER_API_SECRET,
            CURLOPT_TIMEOUT        => 10,
        ]);
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $resp) {
            $acct = json_decode($resp, true);
            // Try cash, then buying_power, then equity
            $firmBalance = (float) ($acct['cash'] ?? $acct['buying_power'] ?? $acct['equity'] ?? 0);
        }
    } catch (Exception $e) {
        brokerLog("JOURNAL-STATUS: Failed to get firm balance: " . $e->getMessage());
        // Non-fatal — continue with null
    }

    // ─── 2. Get approved + paid orders awaiting journal ─────────────
    //     These are orders where:
    //       - status = 'approved' (not yet journaled/funded)
    //       - paid_flag = 1 (merchant has paid StockLoyal)
    $stmt = $conn->prepare("
        SELECT
            o.order_id,
            o.member_id,
            o.merchant_id,
            o.basket_id,
            o.symbol,
            o.amount,
            o.status,
            o.journal_status,
            o.alpaca_journal_id,
            m.first_name,
            m.last_name,
            m.member_email,
            bc.broker_account_id,
            bc.broker_account_status,
            mer.merchant_name
        FROM orders o
        LEFT JOIN wallet m ON o.member_id = m.member_id
        LEFT JOIN broker_credentials bc ON o.member_id = bc.member_id AND o.broker = bc.broker
        LEFT JOIN merchant mer ON o.merchant_id = mer.merchant_id
        WHERE o.status = 'approved'
          AND o.paid_flag = 1
        ORDER BY o.member_id, o.order_id
    ");
    $stmt->execute();
    $pending = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ─── 3. Group by member for summary ───────────────────────────────
    $memberMap = [];
    foreach ($pending as $row) {
        $mid = $row['member_id'];
        if (!isset($memberMap[$mid])) {
            $memberMap[$mid] = [
                'member_id'            => $mid,
                'member_name'          => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
                'member_email'          => $row['member_email'],
                'merchant_id'          => $row['merchant_id'],
                'merchant_name'        => $row['merchant_name'],
                'broker_account_id'    => $row['broker_account_id'],
                'broker_account_status'=> $row['broker_account_status'],
                'total_amount'         => 0.0,
                'order_count'          => 0,
                'orders'               => [],
            ];
        }
        $memberMap[$mid]['total_amount'] += (float) $row['amount'];
        $memberMap[$mid]['order_count']++;
        $memberMap[$mid]['orders'][] = [
            'order_id'  => (int) $row['order_id'],
            'symbol'    => $row['symbol'],
            'amount'    => (float) $row['amount'],
            'basket_id' => $row['basket_id'],
            'status'    => $row['status'],
        ];
    }
    $memberSummary = array_values($memberMap);

    // ─── 4. Recent completed journals (last 30 days) ──────────────────
    $stmt2 = $conn->prepare("
        SELECT
            o.member_id,
            o.merchant_id,
            o.alpaca_journal_id,
            o.journal_status,
            o.journaled_at,
            m.first_name,
            m.last_name,
            mer.merchant_name,
            SUM(o.amount) AS amount,
            COUNT(*) AS order_count
        FROM orders o
        LEFT JOIN wallet m ON o.member_id = m.member_id
        LEFT JOIN merchant mer ON o.merchant_id = mer.merchant_id
        WHERE o.journaled_at IS NOT NULL
          AND o.journaled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY o.member_id, o.merchant_id, o.alpaca_journal_id, o.journal_status, o.journaled_at,
                 m.first_name, m.last_name, mer.merchant_name
        ORDER BY o.journaled_at DESC
        LIMIT 50
    ");
    $stmt2->execute();
    $recentJournals = $stmt2->fetchAll(PDO::FETCH_ASSOC);

    // Add member_name to recent journals
    foreach ($recentJournals as &$j) {
        $j['member_name']  = trim(($j['first_name'] ?? '') . ' ' . ($j['last_name'] ?? ''));
        $j['amount']       = (float) $j['amount'];
        $j['order_count']  = (int) $j['order_count'];
        $j['merchant_id']  = $j['merchant_id'] ?? null;
        $j['merchant_name'] = $j['merchant_name'] ?? null;
        unset($j['first_name'], $j['last_name']);
    }

    // ─── 5. Cycle member summary — ALL paid orders for active cycles ──────
    //     Includes already-journaled orders so merchant cards always show
    //     basket/order detail even when nothing is pending.
    $stmt3 = $conn->prepare("
        SELECT
            o.order_id,
            o.member_id,
            o.merchant_id,
            o.basket_id,
            o.symbol,
            o.amount,
            o.status,
            o.journal_status,
            o.alpaca_journal_id,
            o.journaled_at,
            o.paid_flag,
            m.first_name,
            m.last_name,
            m.member_email,
            bc.broker_account_id,
            bc.broker_account_status,
            mer.merchant_name
        FROM orders o
        LEFT JOIN wallet m ON o.member_id = m.member_id
        LEFT JOIN broker_credentials bc ON o.member_id = bc.member_id AND o.broker = bc.broker
        LEFT JOIN merchant mer ON o.merchant_id = mer.merchant_id
        WHERE o.paid_flag = 1
          AND o.status IN ('approved', 'funded', 'placed', 'submitted', 'executed', 'settled')
        ORDER BY o.merchant_id, o.member_id, o.order_id
    ");
    $stmt3->execute();
    $cycleRows = $stmt3->fetchAll(PDO::FETCH_ASSOC);

    // Group into cycle_member_summary: merchant → member → orders
    $cycleMerchantMap = [];
    foreach ($cycleRows as $row) {
        $merKey = $row['merchant_id'];
        $memKey = $row['member_id'];
        if (!isset($cycleMerchantMap[$merKey])) {
            $cycleMerchantMap[$merKey] = [
                'merchant_id'   => $merKey,
                'merchant_name' => $row['merchant_name'],
                'members'       => [],
            ];
        }
        if (!isset($cycleMerchantMap[$merKey]['members'][$memKey])) {
            $cycleMerchantMap[$merKey]['members'][$memKey] = [
                'member_id'             => $memKey,
                'member_name'           => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
                'member_email'          => $row['member_email'],
                'merchant_id'           => $merKey,
                'merchant_name'         => $row['merchant_name'],
                'broker_account_id'     => $row['broker_account_id'],
                'broker_account_status' => $row['broker_account_status'],
                'total_amount'          => 0.0,
                'order_count'           => 0,
                'orders'                => [],
            ];
        }
        $cycleMerchantMap[$merKey]['members'][$memKey]['total_amount'] += (float) $row['amount'];
        $cycleMerchantMap[$merKey]['members'][$memKey]['order_count']++;
        $cycleMerchantMap[$merKey]['members'][$memKey]['orders'][] = [
            'order_id'         => (int) $row['order_id'],
            'symbol'           => $row['symbol'],
            'amount'           => (float) $row['amount'],
            'basket_id'        => $row['basket_id'],
            'status'           => $row['status'],
            'journal_status'   => $row['journal_status'],
            'alpaca_journal_id'=> $row['alpaca_journal_id'],
            'journaled_at'     => $row['journaled_at'],
        ];
    }
    // Flatten members map to array
    $cycleMemberSummary = [];
    foreach ($cycleMerchantMap as $merKey => $merData) {
        $cycleMemberSummary[$merKey] = [
            'merchant_id'   => $merData['merchant_id'],
            'merchant_name' => $merData['merchant_name'],
            'members'       => array_values($merData['members']),
        ];
    }

    echo json_encode([
        'success'              => true,
        'firm_balance'         => $firmBalance,
        'pending'              => $pending,
        'member_summary'       => $memberSummary,
        'cycle_member_summary' => array_values($cycleMemberSummary),
        'recent_journals'      => $recentJournals,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
