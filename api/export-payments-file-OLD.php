<?php
declare(strict_types=1);

/**
 * export-payment-file.php
 *
 * Input (JSON POST):
 * {
 *   "merchant_id": "merchant001",      // required
 *   "broker": "Charles Schwab"        // required - matches orders.broker
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
ini_set('error_log', __DIR__ . '/php_error_log');

header('Content-Type: application/json');

require_once __DIR__ . '/config.php'; // must define $conn (PDO)

/**
 * Helper to send JSON and exit.
 */
function json_exit(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

try {
    // 1) Parse input
    $raw    = file_get_contents('php://input');
    $input  = $raw ? json_decode($raw, true) : [];
    if (!is_array($input)) {
        json_exit(['success' => false, 'error' => 'Invalid JSON input'], 400);
    }

    $merchantId = trim((string)($input['merchant_id'] ?? ''));
    $broker     = trim((string)($input['broker'] ?? ''));

    if ($merchantId === '' || $broker === '') {
        json_exit([
            'success' => false,
            'error'   => 'merchant_id and broker are both required',
        ], 400);
    }

    // 2) Fetch unpaid executed/confirmed orders for this merchant + broker
    $sql = "
        SELECT
            order_id,
            member_id,
            merchant_id,
            basket_id,
            symbol,
            shares,
            amount,
            points_used,
            status,
            placed_at,
            member_timezone,
            broker,
            order_type,
            executed_at,
            executed_price,
            executed_shares,
            executed_amount,
            paid_flag,
            paid_batch_id,
            paid_at
        FROM orders
        WHERE broker = :broker
          AND merchant_id = :merchant_id
          AND paid_flag = 0
          AND status IN ('executed', 'confirmed')
        ORDER BY order_id ASC
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':broker'      => $broker,
        ':merchant_id' => $merchantId,
    ]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$orders) {
        json_exit([
            'success'  => true,
            'message'  => 'No unpaid executed orders for this merchant and broker.',
            'csv_file' => null,
            'batch_id' => null,
            'count'    => 0,
        ]);
    }

    // 3) Build CSV file on disk (merchant+broker batch)
    $safeBroker   = preg_replace('/[^A-Za-z0-9]+/', '', $broker) ?: 'broker';
    $safeMerchant = preg_replace('/[^A-Za-z0-9]+/', '', $merchantId) ?: 'merchant';
    $batchId      = 'ACH_' . $safeMerchant . '_' . $safeBroker . '_' . date('Ymd_His');

    $exportDir = __DIR__ . '/exports';
    if (!is_dir($exportDir)) {
        if (!mkdir($exportDir, 0775, true) && !is_dir($exportDir)) {
            json_exit([
                'success' => false,
                'error'   => 'Failed to create exports directory',
            ], 500);
        }
    }

    $csvPath = $exportDir . '/payments_' . $batchId . '.csv';
    $fp = fopen($csvPath, 'w');
    if ($fp === false) {
        json_exit([
            'success' => false,
            'error'   => 'Could not open CSV file for writing',
        ], 500);
    }

    // CSV header
    fputcsv($fp, [
        'batch_id',
        'merchant_id',
        'broker',
        'member_id',
        'order_id',
        'basket_id',
        'symbol',
        'shares',
        'amount_cash',
        'points_used',
        'executed_at',
    ]);

    foreach ($orders as $row) {
        $amountCash = $row['executed_amount'] !== null
            ? (float)$row['executed_amount']
            : (float)$row['amount'];

        fputcsv($fp, [
            $batchId,
            $row['merchant_id'],
            $row['broker'],
            $row['member_id'],
            $row['order_id'],
            $row['basket_id'],
            $row['symbol'],
            $row['shares'],
            number_format($amountCash, 2, '.', ''),
            $row['points_used'],
            $row['executed_at'],
        ]);
    }

    fclose($fp);

    // 4) Mark orders as paid + insert ledger entries in a transaction
    try {
        $conn->beginTransaction();

        // UPDATE orders
        $updateOrderStmt = $conn->prepare("
            UPDATE orders
            SET
                paid_flag     = 1,
                paid_batch_id = :batch_id,
                paid_at       = NOW()
            WHERE order_id = :order_id
        ");

        // INSERT transactions_ledger per order
        $insertLedgerStmt = $conn->prepare("
            INSERT INTO transactions_ledger (
                member_id,
                merchant_id,
                broker,
                order_id,
                client_tx_id,
                external_ref,
                tx_type,
                direction,
                channel,
                status,
                amount_points,
                amount_cash,
                note,
                member_timezone
            ) VALUES (
                :member_id,
                :merchant_id,
                :broker,
                :order_id,
                :client_tx_id,
                :external_ref,
                :tx_type,
                :direction,
                :channel,
                :status,
                :amount_points,
                :amount_cash,
                :note,
                :member_timezone
            )
        ");

        foreach ($orders as $row) {
            $orderId   = (int)$row['order_id'];
            $memberId  = (string)$row['member_id'];
            $mId       = (string)$row['merchant_id'];
            $rowBroker = (string)$row['broker'];

            $amountCash = $row['executed_amount'] !== null
                ? (float)$row['executed_amount']
                : (float)$row['amount'];

            $amountPoints = $row['points_used'] !== null
                ? (float)$row['points_used']
                : null;

            $memberTz = (string)$row['member_timezone'];

            // client_tx_id must be unique – combine batch + order_id
            $clientTxId = sprintf('pay_%s_%d', $batchId, $orderId);

            // ---- UPDATE orders row (with error check) ----
            $ok = $updateOrderStmt->execute([
                ':batch_id' => $batchId,
                ':order_id' => $orderId,
            ]);
            if (!$ok) {
                $errInfo = $updateOrderStmt->errorInfo();
                error_log('export-payment-file: orders UPDATE failed: ' . implode(' | ', $errInfo));
                throw new RuntimeException('Failed to update order_id=' . $orderId);
            }

            // ---- INSERT ledger row (with error check) ----
            $ok = $insertLedgerStmt->execute([
                ':member_id'       => $memberId,
                ':merchant_id'     => $mId,
                ':broker'          => $rowBroker,
                ':order_id'        => $orderId,
                ':client_tx_id'    => $clientTxId,
                ':external_ref'    => $batchId,
                ':tx_type'         => 'cash_out',
                ':direction'       => 'outbound',
                ':channel'         => 'ACH',
                ':status'          => 'confirmed',
                ':amount_points'   => $amountPoints,
                ':amount_cash'     => $amountCash,
                ':note'            => 'ACH payment file ' . $batchId,
                ':member_timezone' => $memberTz,
            ]);
            if (!$ok) {
                $errInfo = $insertLedgerStmt->errorInfo();
                error_log('export-payment-file: ledger INSERT failed: ' . implode(' | ', $errInfo));
                throw new RuntimeException('Failed to insert ledger for order_id=' . $orderId);
            }
        }

        $conn->commit();
    } catch (Throwable $te) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }

        // Optional: remove CSV if DB update fails
        // @unlink($csvPath);

        error_log('export-payment-file: DB update/ledger failed: ' . $te->getMessage());
        json_exit([
            'success' => false,
            'error'   => 'Failed to mark orders as paid or insert ledger records',
            'detail'  => $te->getMessage(),
        ], 500);
    }

    // 5) Success response
    json_exit([
        'success'    => true,
        'csv_file'   => basename($csvPath),
        'batch_id'   => $batchId,
        'merchant_id'=> $merchantId,
        'broker'     => $broker,
        'count'      => count($orders),
    ]);
} catch (Throwable $e) {
    error_log('export-payment-file fatal: ' . $e->getMessage());
    json_exit([
        'success' => false,
        'error'   => 'Unexpected server error in export-payment-file.php',
    ], 500);
}
