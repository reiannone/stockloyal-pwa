<?php
declare(strict_types=1);

/**
 * cancel-payment.php
 *
 * Cancels a settlement batch — clears paid_flag on approved orders.
 * Status stays 'approved' (payment processing doesn't change status).
 *
 * Input:  { batch_id, remove_ledger: bool }
 * Output: { success, orders_cancelled, ledger_entries_removed }
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $input   = json_decode(file_get_contents('php://input'), true) ?: [];
    $batchId = trim($input['batch_id'] ?? '');
    $removeLedger = (bool) ($input['remove_ledger'] ?? false);

    if (empty($batchId)) {
        echo json_encode(['success' => false, 'error' => 'batch_id required']);
        exit;
    }

    $conn->beginTransaction();

    // ── 1. Clear paid fields (status stays 'approved') ──────────────
    //    Also clear journal fields in case any were partially journaled
    $stmt = $conn->prepare("
        UPDATE orders
        SET paid_flag         = 0,
            paid_at           = NULL,
            paid_batch_id     = NULL,
            journal_status    = NULL,
            alpaca_journal_id = NULL,
            journaled_at      = NULL
        WHERE paid_batch_id = ?
          AND LOWER(status) = 'approved'
    ");
    $stmt->execute([$batchId]);
    $ordersCancelled = $stmt->rowCount();

    // ── 2. Remove ledger entries (optional) ───────────────────────────
    $ledgerRemoved = 0;
    if ($removeLedger) {
        $ledgerStmt = $conn->prepare("
            DELETE FROM transactions_ledger
            WHERE reference_id = ?
              AND transaction_type = 'settlement'
        ");
        $ledgerStmt->execute([$batchId]);
        $ledgerRemoved = $ledgerStmt->rowCount();
    }

    $conn->commit();

    echo json_encode([
        'success'                => true,
        'batch_id'               => $batchId,
        'orders_cancelled'       => $ordersCancelled,
        'ledger_entries_removed' => $ledgerRemoved,
    ]);

} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
