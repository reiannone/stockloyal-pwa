<?php
declare(strict_types=1);

/**
 * admin-queue-counts.php
 *
 * Returns counts of open items for each IB processing stage:
 *
 *   Stage 1 - prepare:    Members eligible for order preparation
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
    // Members with sweep_percentage > 0, cash_balance > 0, active, no pending orders
    $prepareStmt = $conn->prepare("
        SELECT COUNT(DISTINCT m.member_id) AS cnt
        FROM wallet m
        WHERE m.sweep_percentage > 0
          AND m.cash_balance > 0
          AND m.member_status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.member_id = m.member_id
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
