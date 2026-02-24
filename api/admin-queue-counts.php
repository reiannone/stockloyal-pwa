<?php
declare(strict_types=1);

/**
 * admin-queue-counts.php
 *
 * Returns counts of open items for each IB processing stage:
 *
 *   Stage 1 - prepare:    Members eligible for order preparation
 *   Stage 2 - settlement: Orders confirmed but not yet settled (merchant hasn't paid)
 *   Stage 3 - journal:    Orders settled but not yet journaled to member Alpaca accounts
 *   Stage 4 - sweep:      Orders journaled and ready to submit to broker
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
    // Members enrolled in sweep with cash_balance > 0 and no pending/placed orders
    $prepareStmt = $conn->prepare("
        SELECT COUNT(DISTINCT m.member_id) AS cnt
        FROM members m
        WHERE m.sweep_enrolled = 1
          AND m.cash_balance > 0
          AND NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.member_id = m.member_id
                AND o.status IN ('pending', 'placed')
          )
    ");
    $prepareStmt->execute();
    $prepare = (int) $prepareStmt->fetchColumn();

    // ── Stage 2: Settlement ──────────────────────────────────────────
    // Orders confirmed/executed but NOT yet settled (merchant payment pending)
    $settlementStmt = $conn->prepare("
        SELECT COUNT(*) AS cnt
        FROM orders
        WHERE LOWER(status) IN ('confirmed', 'executed')
          AND (paid_flag = 0 OR paid_flag IS NULL)
    ");
    $settlementStmt->execute();
    $settlement = (int) $settlementStmt->fetchColumn();

    // ── Stage 3: Journal ─────────────────────────────────────────────
    // Orders settled (merchant paid) but NOT yet journaled to member accounts
    $journalStmt = $conn->prepare("
        SELECT COUNT(*) AS cnt
        FROM orders
        WHERE LOWER(status) = 'settled'
          AND (journal_status IS NULL OR journal_status = 'pending')
    ");
    $journalStmt->execute();
    $journal = (int) $journalStmt->fetchColumn();

    // ── Stage 4: Sweep ───────────────────────────────────────────────
    // Orders with status = 'pending' ready to submit to broker
    // (After journal, orders move to 'pending' for the sweep process)
    $sweepStmt = $conn->prepare("
        SELECT COUNT(*) AS cnt
        FROM orders
        WHERE LOWER(status) = 'pending'
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
