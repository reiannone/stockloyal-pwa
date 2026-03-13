<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

// ── Helpers ──────────────────────────────────────────────────────────────────
function q(PDO $conn, string $sql, array $params = []): array {
    $s = $conn->prepare($sql);
    $s->execute($params);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}
function q1(PDO $conn, string $sql, array $params = []): ?array {
    $r = q($conn, $sql, $params);
    return $r[0] ?? null;
}

try {
    // ── Stage 1: Prepare ─────────────────────────────────────────────────────
    // Active staged batch + most recent approved batch
    $staged = q($conn,
        "SELECT batch_id, status, total_orders, total_amount, total_members, created_at
         FROM prepare_batches
         WHERE status IN ('staged','approved')
         ORDER BY FIELD(status,'staged','approved'), created_at DESC
         LIMIT 5"
    );
    $latestStagedBatch  = null;
    $latestApprovedBatch = null;
    foreach ($staged as $b) {
        if ($b['status'] === 'staged'   && !$latestStagedBatch)   $latestStagedBatch   = $b;
        if ($b['status'] === 'approved' && !$latestApprovedBatch) $latestApprovedBatch = $b;
    }

    // ── Stage 2: Payment (approved orders awaiting merchant ACH) ─────────────
    $payment = q1($conn,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total,
                COUNT(DISTINCT member_id) AS members,
                COUNT(DISTINCT merchant_id) AS merchants
         FROM orders WHERE status = 'approved'"
    );

    // ── Stage 3: Journal (funded orders awaiting JNLC to member accounts) ────
    $journal = q1($conn,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total,
                COUNT(DISTINCT member_id) AS members
         FROM orders WHERE status = 'funded'"
    );
    // Pending journals not yet executed at Alpaca
    // Count funded orders whose journal hasn't completed yet
    // journal_status is a column directly on orders ('pending','completed','failed')
    $journalPending = q1($conn,
        "SELECT COUNT(*) AS cnt
         FROM orders
         WHERE status = 'funded'
           AND (journal_status IS NULL OR journal_status != 'completed')"
    ) ?? ['cnt' => 0];

    // ── Stage 4: Sweep (placed — ready for broker order submission) ───────────
    $sweep = q1($conn,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total,
                COUNT(DISTINCT member_id) AS members,
                COUNT(DISTINCT merchant_id) AS merchants
         FROM orders WHERE status = 'placed'"
    );

    // ── Stage 5: Broker Exec (submitted to Alpaca, awaiting fill) ─────────────
    $exec = q1($conn,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total,
                COUNT(DISTINCT member_id) AS members
         FROM orders WHERE status = 'submitted'"
    );

    // ── Settled (completed this cycle / last 30 days) ─────────────────────────
    $settled = q1($conn,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
         FROM orders
         WHERE status = 'settled'
           AND updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );

    // ── All-time totals ───────────────────────────────────────────────────────
    $allStatuses = q($conn,
        "SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
         FROM orders
         GROUP BY status
         ORDER BY FIELD(status,'pending','approved','funded','placed','submitted','settled')"
    );

    // ── Recent cron run ───────────────────────────────────────────────────────
    $lastCron = q1($conn,
        "SELECT run_id, status, started_at, completed_at, orders_submitted, orders_failed, market_status
         FROM cron_exec_log
         ORDER BY started_at DESC LIMIT 1"
    );

    // ── Alerts ───────────────────────────────────────────────────────────────
    $alerts = [];

    // Stale staged batch (>48h)
    $staleStagedBatch = q1($conn,
        "SELECT batch_id, created_at FROM prepare_batches
         WHERE status = 'staged'
           AND created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
         LIMIT 1"
    );
    if ($staleStagedBatch) {
        $alerts[] = [
            'level'   => 'warning',
            'stage'   => 1,
            'message' => "Staged batch {$staleStagedBatch['batch_id']} is over 48h old — approve or discard.",
        ];
    }

    // Unfunded orders (approved > 72h)
    $staleApproved = q1($conn,
        "SELECT COUNT(*) AS cnt FROM orders
         WHERE status = 'approved'
           AND updated_at < DATE_SUB(NOW(), INTERVAL 72 HOUR)"
    );
    if (($staleApproved['cnt'] ?? 0) > 0) {
        $alerts[] = [
            'level'   => 'warning',
            'stage'   => 2,
            'message' => "{$staleApproved['cnt']} approved order(s) awaiting merchant payment for over 72h.",
        ];
    }

    // Journals stuck (funded >24h) — use created_at as fallback if updated_at absent
    $staleJournals = q1($conn,
        "SELECT COUNT(*) AS cnt FROM orders
         WHERE status = 'funded'
           AND COALESCE(journaled_at, placed_at) < DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    if (($staleJournals['cnt'] ?? 0) > 0) {
        $alerts[] = [
            'level'   => 'error',
            'stage'   => 3,
            'message' => "{$staleJournals['cnt']} funded order(s) waiting on journal for over 24h — check Alpaca journal status.",
        ];
    }

    // Orders stuck in submitted >12h (possible fill failure)
    $staleSubmitted = q1($conn,
        "SELECT COUNT(*) AS cnt FROM orders
         WHERE status = 'submitted'
           AND updated_at < DATE_SUB(NOW(), INTERVAL 12 HOUR)"
    );
    if (($staleSubmitted['cnt'] ?? 0) > 0) {
        $alerts[] = [
            'level'   => 'error',
            'stage'   => 5,
            'message' => "{$staleSubmitted['cnt']} submitted order(s) have not settled in over 12h — check Alpaca broker fills.",
        ];
    }


    // ── Per-merchant batch pipeline status ───────────────────────────────────
    // Shows each merchant's active batch and how far it has progressed
    $merchantBatches = q($conn,
        "SELECT
            o.merchant_id,
            o.batch_id,
            COUNT(*) AS total_orders,
            COALESCE(SUM(o.amount), 0) AS total_amount,
            SUM(CASE WHEN o.status = 'approved'  THEN 1 ELSE 0 END) AS cnt_approved,
            SUM(CASE WHEN o.status = 'funded'    THEN 1 ELSE 0 END) AS cnt_funded,
            SUM(CASE WHEN o.status = 'placed'    THEN 1 ELSE 0 END) AS cnt_placed,
            SUM(CASE WHEN o.status = 'submitted' THEN 1 ELSE 0 END) AS cnt_submitted,
            SUM(CASE WHEN o.status = 'settled'   THEN 1 ELSE 0 END) AS cnt_settled,
            SUM(CASE WHEN o.status IN ('failed','cancelled') THEN 1 ELSE 0 END) AS cnt_failed,
            MIN(o.placed_at) AS batch_started_at,
            MAX(o.executed_at) AS last_executed_at
         FROM orders o
         WHERE o.batch_id IS NOT NULL
           AND o.status NOT IN ('settled','cancelled','failed')
         GROUP BY o.merchant_id, o.batch_id
         ORDER BY o.merchant_id, o.batch_id"
    );

    // Determine the dominant stage for each merchant batch
    foreach ($merchantBatches as &$mb) {
        $total = (int)$mb['total_orders'];
        if ($total === 0) { $mb['current_stage'] = 'settled'; continue; }
        if ((int)$mb['cnt_submitted'] > 0) $mb['current_stage'] = 'execution';
        elseif ((int)$mb['cnt_placed'] > 0) $mb['current_stage'] = 'sweep';
        elseif ((int)$mb['cnt_funded'] > 0) $mb['current_stage'] = 'journal';
        elseif ((int)$mb['cnt_approved'] > 0) $mb['current_stage'] = 'payment';
        else $mb['current_stage'] = 'prepare';

        $mb['pct_settled'] = $total > 0
            ? round(((int)$mb['cnt_settled'] / $total) * 100)
            : 0;
        $mb['is_complete'] = ($mb['cnt_approved'] == 0 && $mb['cnt_funded'] == 0
                              && $mb['cnt_placed'] == 0 && $mb['cnt_submitted'] == 0);
    }
    unset($mb);

    echo json_encode([
        'success'     => true,
        'generated_at' => date('c'),
        'stages'      => [
            'prepare' => [
                'staged_batch'   => $latestStagedBatch,
                'approved_batch' => $latestApprovedBatch,
                'has_staged'     => $latestStagedBatch !== null,
                'has_approved'   => $latestApprovedBatch !== null,
            ],
            'payment' => [
                'count'     => (int)($payment['cnt']      ?? 0),
                'amount'    => (float)($payment['total']   ?? 0),
                'members'   => (int)($payment['members']   ?? 0),
                'merchants' => (int)($payment['merchants'] ?? 0),
            ],
            'journal' => [
                'count'           => (int)($journal['cnt']           ?? 0),
                'amount'          => (float)($journal['total']        ?? 0),
                'members'         => (int)($journal['members']        ?? 0),
                'pending_at_alpaca' => (int)($journalPending['cnt']  ?? 0),
            ],
            'sweep' => [
                'count'     => (int)($sweep['cnt']      ?? 0),
                'amount'    => (float)($sweep['total']   ?? 0),
                'members'   => (int)($sweep['members']   ?? 0),
                'merchants' => (int)($sweep['merchants'] ?? 0),
            ],
            'execution' => [
                'count'   => (int)($exec['cnt']    ?? 0),
                'amount'  => (float)($exec['total'] ?? 0),
                'members' => (int)($exec['members'] ?? 0),
            ],
            'settled' => [
                'count'  => (int)($settled['cnt']    ?? 0),
                'amount' => (float)($settled['total'] ?? 0),
                'period' => 'last 30 days',
            ],
        ],
        'all_statuses' => $allStatuses,
        'last_cron'    => $lastCron,
        'alerts'        => $alerts,
        'merchant_batches' => $merchantBatches,
    ]);

} catch (Throwable $e) {
    error_log('[pipeline-status] ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
