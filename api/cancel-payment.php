<?php
declare(strict_types=1);

/**
 * cancel-payment.php
 *
 * Reverses/cancels settled payments by:
 * - Setting status back to 'executed' or 'confirmed'
 * - Setting paid_flag = 0
 * - Clearing paid_at and paid_batch_id
 * - Optionally removing ledger entries
 *
 * Input (JSON POST):
 * {
 *   "order_ids": [123, 456, 789],     // Cancel specific orders
 *   // OR
 *   "batch_id": "ACH_merchant001_...", // Cancel entire batch
 *   // OR  
 *   "merchant_id": "merchant001",      // Required with broker
 *   "broker": "DriveWealth"            // Cancel all settled for merchant+broker
 * }
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Content-Type: application/json');

require_once __DIR__ . '/config.php';

function json_exit(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_NUMERIC_CHECK);
    exit;
}

try {
    $raw = file_get_contents('php://input');
    $input = $raw ? json_decode($raw, true) : [];
    
    if (!is_array($input)) {
        json_exit(['success' => false, 'error' => 'Invalid JSON input'], 400);
    }

    $orderIds = $input['order_ids'] ?? [];
    $batchId = trim((string)($input['batch_id'] ?? ''));
    $merchantId = trim((string)($input['merchant_id'] ?? ''));
    $broker = trim((string)($input['broker'] ?? ''));
    $removeLedger = (bool)($input['remove_ledger'] ?? false);
    
    // Determine which orders to cancel
    if (!empty($orderIds) && is_array($orderIds)) {
        // Cancel specific order IDs
        $orderIds = array_map('intval', $orderIds);
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        
        $stmt = $conn->prepare("
            SELECT order_id, member_id, merchant_id, broker, paid_batch_id, status, paid_flag
            FROM orders
            WHERE order_id IN ({$placeholders})
        ");
        $stmt->execute($orderIds);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
    } elseif ($batchId !== '') {
        // Cancel by batch ID
        $stmt = $conn->prepare("
            SELECT order_id, member_id, merchant_id, broker, paid_batch_id, status, paid_flag
            FROM orders
            WHERE paid_batch_id = ?
        ");
        $stmt->execute([$batchId]);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
    } elseif ($merchantId !== '' && $broker !== '') {
        // Cancel all settled for merchant + broker
        $stmt = $conn->prepare("
            SELECT order_id, member_id, merchant_id, broker, paid_batch_id, status, paid_flag
            FROM orders
            WHERE merchant_id = ?
              AND broker = ?
              AND status = 'settled'
              AND paid_flag = 1
        ");
        $stmt->execute([$merchantId, $broker]);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
    } else {
        json_exit([
            'success' => false,
            'error' => 'Must provide order_ids, batch_id, or merchant_id+broker'
        ], 400);
    }

    if (empty($orders)) {
        json_exit([
            'success' => true,
            'message' => 'No matching orders found to cancel',
            'orders_cancelled' => 0
        ]);
    }

    // Filter to only settled orders
    $settledOrders = array_filter($orders, fn($o) => $o['status'] === 'settled' && $o['paid_flag'] == 1);
    
    if (empty($settledOrders)) {
        json_exit([
            'success' => true,
            'message' => 'No settled orders found to cancel',
            'orders_cancelled' => 0
        ]);
    }

    $orderIdsToCancel = array_column($settledOrders, 'order_id');
    $batchIds = array_unique(array_filter(array_column($settledOrders, 'paid_batch_id')));

    // Begin transaction
    $conn->beginTransaction();

    try {
        // 1) Update orders - revert to 'executed' status
        $placeholders = implode(',', array_fill(0, count($orderIdsToCancel), '?'));
        
        $updateStmt = $conn->prepare("
            UPDATE orders
            SET
                status = 'executed',
                paid_flag = 0,
                paid_at = NULL,
                paid_batch_id = NULL
            WHERE order_id IN ({$placeholders})
              AND status = 'settled'
        ");
        $updateStmt->execute($orderIdsToCancel);
        $ordersCancelled = $updateStmt->rowCount();

        // 2) Optionally remove ledger entries for these batches
        $ledgerRemoved = 0;
        if ($removeLedger && !empty($batchIds)) {
            $batchPlaceholders = implode(',', array_fill(0, count($batchIds), '?'));
            
            $deleteLedgerStmt = $conn->prepare("
                DELETE FROM transactions_ledger
                WHERE external_ref IN ({$batchPlaceholders})
                  AND tx_type = 'cash_out'
                  AND channel = 'ACH'
            ");
            $deleteLedgerStmt->execute($batchIds);
            $ledgerRemoved = $deleteLedgerStmt->rowCount();
        }

        // 3) Log the cancellation
        error_log("[cancel-payment] Cancelled {$ordersCancelled} orders, removed {$ledgerRemoved} ledger entries");

        $conn->commit();

        json_exit([
            'success' => true,
            'orders_cancelled' => $ordersCancelled,
            'ledger_entries_removed' => $ledgerRemoved,
            'order_ids' => $orderIdsToCancel,
            'batch_ids' => $batchIds
        ]);

    } catch (Throwable $e) {
        $conn->rollBack();
        error_log("[cancel-payment] Transaction failed: " . $e->getMessage());
        throw $e;
    }

} catch (Throwable $e) {
    error_log("[cancel-payment] Error: " . $e->getMessage());
    json_exit([
        'success' => false,
        'error' => 'Failed to cancel payment: ' . $e->getMessage()
    ], 500);
}
