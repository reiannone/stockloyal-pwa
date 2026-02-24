<?php
declare(strict_types=1);

/**
 * export-payments-file.php
 *
 * IB Settlement: Generates ACH payment files for merchant funding to SL sweep account.
 * Does NOT change order status — only marks orders as paid (paid_flag=1).
 *
 * Input:  { merchant_id, broker }
 * Output: { success, batch_id, order_count, total_amount, xlsx, detail_csv, ach_csv }
 *
 * Orders remain 'approved' — JournalAdmin will move them to 'funded' after journaling.
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $merchantId = trim($input['merchant_id'] ?? '');
    $broker     = trim($input['broker'] ?? '');

    if (empty($merchantId) || empty($broker)) {
        echo json_encode(['success' => false, 'error' => 'merchant_id and broker required']);
        exit;
    }

    // ── 1. Get approved orders for this merchant + broker ─────────────
    $stmt = $conn->prepare("
        SELECT
            o.order_id,
            o.member_id,
            o.basket_id,
            o.symbol,
            o.amount,
            o.shares,
            o.points_used,
            o.status,
            o.broker,
            o.executed_amount,
            o.executed_shares,
            o.executed_at,
            m.first_name,
            m.last_name,
            m.member_email
        FROM orders o
        LEFT JOIN wallet m ON o.member_id = m.member_id
        WHERE o.merchant_id = ?
          AND o.broker = ?
          AND LOWER(o.status) = 'approved'
          AND (o.paid_flag = 0 OR o.paid_flag IS NULL)
        ORDER BY o.basket_id, o.order_id
    ");
    $stmt->execute([$merchantId, $broker]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($orders)) {
        echo json_encode(['success' => false, 'error' => "No approved orders found for $merchantId / $broker"]);
        exit;
    }

    // ── 2. Generate batch ID ──────────────────────────────────────────
    $batchId = 'ACH_' . $merchantId . '_' . $broker . '_' . date('Ymd_His');
    $totalAmount = 0;
    $orderIds = [];

    foreach ($orders as $o) {
        $totalAmount += (float) ($o['amount'] ?? 0);
        $orderIds[] = (int) $o['order_id'];
    }

    // ── 3. Generate CSV files ─────────────────────────────────────────
    $exportDir = '/var/www/html/api/exports/';
    if (!is_dir($exportDir)) {
        mkdir($exportDir, 0755, true);
    }

    // Detail CSV
    $detailFile = $exportDir . "detail_{$batchId}.csv";
    $fp = fopen($detailFile, 'w');
    fputcsv($fp, ['Order ID', 'Member ID', 'Member Name', 'Basket ID', 'Symbol', 'Amount', 'Shares', 'Points Used', 'Status']);
    foreach ($orders as $o) {
        $name = trim(($o['first_name'] ?? '') . ' ' . ($o['last_name'] ?? ''));
        fputcsv($fp, [
            $o['order_id'], $o['member_id'], $name, $o['basket_id'],
            $o['symbol'], $o['amount'], $o['shares'], $o['points_used'], $o['status'],
        ]);
    }
    fclose($fp);

    // ACH Summary CSV
    $achFile = $exportDir . "ach_{$batchId}.csv";
    $fp = fopen($achFile, 'w');
    fputcsv($fp, ['Batch ID', 'Merchant ID', 'Broker', 'Order Count', 'Total Amount', 'Settlement Date']);
    fputcsv($fp, [$batchId, $merchantId, $broker, count($orders), number_format($totalAmount, 2, '.', ''), date('Y-m-d')]);
    fclose($fp);

    // ── 4. Generate XLSX (if PhpSpreadsheet available) ────────────────
    $xlsxResult = null;
    $xlsxPath = $exportDir . "settlement_{$batchId}.xlsx";
    try {
        if (class_exists('PhpOffice\PhpSpreadsheet\Spreadsheet')) {
            $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();

            // ACH Summary sheet
            $sheet = $spreadsheet->getActiveSheet();
            $sheet->setTitle('ACH Summary');
            $sheet->fromArray(['Batch ID', 'Merchant', 'Broker', 'Orders', 'Total Amount', 'Date'], null, 'A1');
            $sheet->fromArray([$batchId, $merchantId, $broker, count($orders), $totalAmount, date('Y-m-d')], null, 'A2');

            // Order Detail sheet
            $detailSheet = $spreadsheet->createSheet();
            $detailSheet->setTitle('Order Detail');
            $detailSheet->fromArray(['Order ID', 'Member ID', 'Member Name', 'Basket', 'Symbol', 'Amount', 'Shares', 'Points', 'Status'], null, 'A1');
            $row = 2;
            foreach ($orders as $o) {
                $name = trim(($o['first_name'] ?? '') . ' ' . ($o['last_name'] ?? ''));
                $detailSheet->fromArray([
                    $o['order_id'], $o['member_id'], $name, $o['basket_id'],
                    $o['symbol'], (float) $o['amount'], (float) $o['shares'],
                    (int) ($o['points_used'] ?? 0), $o['status'],
                ], null, "A{$row}");
                $row++;
            }

            $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
            $writer->save($xlsxPath);
            $xlsxResult = [
                'url'      => "exports/settlement_{$batchId}.xlsx",
                'filename' => "settlement_{$batchId}.xlsx",
            ];
        }
    } catch (Exception $xlsxErr) {
        error_log("XLSX generation failed: " . $xlsxErr->getMessage());
    }

    // ── 5. Mark orders as paid (status stays 'approved') ────────────
    $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
    $updateStmt = $conn->prepare("
        UPDATE orders
        SET paid_flag     = 1,
            paid_at       = NOW(),
            paid_batch_id = ?
        WHERE order_id IN ($placeholders)
          AND LOWER(status) = 'approved'
          AND (paid_flag = 0 OR paid_flag IS NULL)
    ");
    $params = array_merge([$batchId], $orderIds);
    $updateStmt->execute($params);
    $updatedCount = $updateStmt->rowCount();

    // ── 6. Log ledger entries per member ──────────────────────────────
    $memberTotals = [];
    foreach ($orders as $o) {
        $mid = $o['member_id'];
        if (!isset($memberTotals[$mid])) $memberTotals[$mid] = 0;
        $memberTotals[$mid] += (float) ($o['amount'] ?? 0);
    }

    try {
        $ledgerStmt = $conn->prepare("
            INSERT INTO transactions_ledger (member_id, merchant_id, transaction_type, amount, description, reference_id, created_at)
            VALUES (?, ?, 'settlement', ?, ?, ?, NOW())
        ");
        foreach ($memberTotals as $mid => $amt) {
            $ledgerStmt->execute([
                $mid, $merchantId, $amt,
                "Merchant settlement — batch $batchId",
                $batchId,
            ]);
        }
    } catch (Exception $ledgerErr) {
        error_log("Ledger insert warning: " . $ledgerErr->getMessage());
        // Non-fatal
    }

    // ── 7. Return result ──────────────────────────────────────────────
    echo json_encode([
        'success'      => true,
        'batch_id'     => $batchId,
        'order_count'  => $updatedCount,
        'total_amount' => $totalAmount,
        'xlsx'         => $xlsxResult,
        'detail_csv'   => [
            'url'      => "exports/detail_{$batchId}.csv",
            'filename' => "detail_{$batchId}.csv",
        ],
        'ach_csv'      => [
            'url'      => "exports/ach_{$batchId}.csv",
            'filename' => "ach_{$batchId}.csv",
        ],
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
