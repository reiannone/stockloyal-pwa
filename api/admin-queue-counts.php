<?php
declare(strict_types=1);

/**
 * admin-queue-counts.php
 *
 * Returns counts of open items for each IB processing stage:
 *
 *   Stage 1 - prepare:    Members eligible for order preparation
 *                          (active picks + points > 0 + sweep configured + no pending/approved orders)
 *   Stage 2 - settlement: Orders approved but not yet paid by merchant (paid_flag=0)
 *   Stage 3 - journal:    Orders approved + paid by merchant, awaiting journal to member accounts
 *   Stage 4 - sweep:      Orders funded (journaled) and ready to submit to broker
 *   Stage 5 - execute:    Orders placed with broker awaiting execution/confirmation
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    // ── Stage 1: Prepare ─────────────────────────────────────────────
    // Members with active stock picks, points > 0, sweep configured,
    // and no pending/approved orders already in the pipeline.
    // This mirrors the WHERE clause in prepare_orders_process.php → prepare()
    $prepareStmt = $conn->prepare("
        SELECT COUNT(DISTINCT w.member_id) AS cnt
        FROM wallet w
        JOIN member_stock_picks msp
            ON msp.member_id = w.member_id
           AND msp.is_active = 1
        WHERE w.points > 0
          AND w.sweep_percentage > 0
          AND NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.member_id = w.member_id
                AND o.status IN ('pending', 'approved')
          )
    ");
    $prepareStmt->execute();
    $prepare = (int) $prepareStmt->fetchColumn();

    // ── Stage 2: Settlement ──────────────────────────────────────────
    // Orders approved but NOT yet paid by merchant (paid_flag = 0)
    $settlementStmt = $conn->prepare("
        SELECT COUNT(*) AS cnt
        FROM orders
        WHERE LOWER(status) = 'approved'
          AND (paid_flag = 0 OR paid_flag IS NULL)
    ");
    $settlementStmt->execute();
    $settlement = (int) $settlementStmt->fetchColumn();

    // ── Stage 3: Journal ─────────────────────────────────────────────
    // Orders approved + paid by merchant (paid_flag=1), awaiting journal to member accounts
    $journalStmt = $conn->prepare("
        SELECT COUNT(*) AS cnt
        FROM orders
        WHERE LOWER(status) = 'approved'
          AND paid_flag = 1
    ");
    $journalStmt->execute();
    $journal = (int) $journalStmt->fetchColumn();

    // ── Stage 4: Sweep ───────────────────────────────────────────────
    // Orders funded (journaled to member accounts), ready to submit to broker
    $sweepStmt = $conn->prepare("
        SELECT COUNT(*) AS cnt
        FROM orders
        WHERE LOWER(status) = 'funded'
    ");
    $sweepStmt->execute();
    $sweep = (int) $sweepStmt->fetchColumn();

    // ── Stage 5: Execute ─────────────────────────────────────────────
    // Orders placed with broker awaiting confirmation
    $executeStmt = $conn->prepare("
        SELECT COUNT(*) AS cnt
        FROM orders
        WHERE LOWER(status) = 'placed'
    ");
    $executeStmt->execute();
    $execute = (int) $executeStmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'counts'  => [
            'prepare'    => $prepare,
            'settlement' => $settlement,
            'journal'    => $journal,
            'sweep'      => $sweep,
            'execute'    => $execute,
        ],
    ]);

} catch (Exception $e) {
    // Fallback with zeroes
    try {
        echo json_encode([
            'success' => true,
            'counts'  => [
                'prepare'    => 0,
                'settlement' => 0,
                'journal'    => 0,
                'sweep'      => 0,
                'execute'    => 0,
            ],
            'warning' => $e->getMessage(),
        ]);
    } catch (Exception $e2) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}
