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

/**
 * Log generated CSV file to csv_files table for tracking
 */
function logCsvFile($conn, $merchantId, $broker, $filename, $relativePath, $fileType): ?int
{
    try {
        $fullPath = __DIR__ . '/' . ltrim($relativePath, '/');
        $fileSize = file_exists($fullPath) ? filesize($fullPath) : null;
        
        $stmt = $conn->prepare("
            INSERT INTO csv_files 
            (merchant_id, broker, filename, relative_path, file_size, file_type)
            VALUES (:merchant_id, :broker, :filename, :relative_path, :file_size, :file_type)
        ");
        
        $stmt->execute([
            ':merchant_id' => $merchantId,
            ':broker' => $broker,
            ':filename' => $filename,
            ':relative_path' => $relativePath,
            ':file_size' => $fileSize,
            ':file_type' => $fileType
        ]);
        
        $fileId = $conn->lastInsertId();
        error_log("[export-payments-file] Logged CSV file: $filename (ID: $fileId, Type: $fileType)");
        
        return (int)$fileId;
    } catch (PDOException $e) {
        error_log("[export-payments-file] Failed to log CSV file: " . $e->getMessage());
        return null;
    }
}

/**
 * Generate a minimal XLSX (Office Open XML) with multiple named sheets.
 *
 * @param string $path   Output file path
 * @param array  $sheets ['Sheet Name' => [['H1','H2'], ['v1','v2'], ...], ...]
 */
function writeXlsx(string $path, array $sheets): void
{
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException("Cannot create XLSX at {$path}");
    }

    $sheetNames = array_keys($sheets);
    $sheetCount = count($sheetNames);

    // [Content_Types].xml
    $ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    for ($i = 1; $i <= $sheetCount; $i++) {
        $ct .= '<Override PartName="/xl/worksheets/sheet' . $i . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }
    $ct .= '</Types>';
    $zip->addFromString('[Content_Types].xml', $ct);

    // _rels/.rels
    $zip->addFromString('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        . '</Relationships>'
    );

    // xl/_rels/workbook.xml.rels
    $wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for ($i = 1; $i <= $sheetCount; $i++) {
        $wbRels .= '<Relationship Id="rId' . $i . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $i . '.xml"/>';
    }
    $wbRels .= '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    $wbRels .= '</Relationships>';
    $zip->addFromString('xl/_rels/workbook.xml.rels', $wbRels);

    // xl/styles.xml — bold header row style
    $zip->addFromString('xl/styles.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        . '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        . '<fills count="2"><fill><patternFill patternType="none"/></fill>'
        . '<fill><patternFill patternType="gray125"/></fill></fills>'
        . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        . '<cellXfs count="2">'
        . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        . '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        . '</cellXfs>'
        . '</styleSheet>'
    );

    // xl/workbook.xml
    $wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        . '<sheets>';
    for ($i = 0; $i < $sheetCount; $i++) {
        $wb .= '<sheet name="' . htmlspecialchars($sheetNames[$i], ENT_XML1) . '" sheetId="' . ($i + 1) . '" r:id="rId' . ($i + 1) . '"/>';
    }
    $wb .= '</sheets></workbook>';
    $zip->addFromString('xl/workbook.xml', $wb);

    // xl/worksheets/sheetN.xml
    $sheetIdx = 0;
    foreach ($sheets as $name => $rows) {
        $sheetIdx++;
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<sheetData>';

        foreach ($rows as $rIdx => $cells) {
            $rowNum = $rIdx + 1;
            $xml .= '<row r="' . $rowNum . '">';
            foreach ($cells as $cIdx => $val) {
                // Column letter(s): A-Z, then AA-AZ etc.
                $col = chr(65 + ($cIdx % 26));
                if ($cIdx >= 26) $col = chr(64 + intdiv($cIdx, 26)) . $col;
                $ref = $col . $rowNum;
                $style = ($rIdx === 0) ? ' s="1"' : ''; // bold header

                $val = (string)$val;
                if ($val !== '' && is_numeric($val) && strlen($val) < 15) {
                    $xml .= '<c r="' . $ref . '"' . $style . '><v>' . $val . '</v></c>';
                } else {
                    $escaped = htmlspecialchars($val, ENT_XML1, 'UTF-8');
                    $xml .= '<c r="' . $ref . '"' . $style . ' t="inlineStr"><is><t>' . $escaped . '</t></is></c>';
                }
            }
            $xml .= '</row>';
        }

        $xml .= '</sheetData></worksheet>';
        $zip->addFromString('xl/worksheets/sheet' . $sheetIdx . '.xml', $xml);
    }

    $zip->close();
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

    // 3) Build two CSV files on disk
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

    // ========== DETAIL CSV (all orders) ==========
    $detailCsvPath = $exportDir . '/payments_detail_' . $batchId . '.csv';
    $fpDetail = fopen($detailCsvPath, 'w');
    if ($fpDetail === false) {
        json_exit([
            'success' => false,
            'error'   => 'Could not open detail CSV file for writing',
        ], 500);
    }

    // Detail CSV header
    fputcsv($fpDetail, [
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

    $totalPaymentAmount = 0;
    foreach ($orders as $row) {
        $amountCash = $row['executed_amount'] !== null
            ? (float)$row['executed_amount']
            : (float)$row['amount'];
        
        $totalPaymentAmount += $amountCash;

        fputcsv($fpDetail, [
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

    fclose($fpDetail);

    // ========== ACH CSV (single payment record) ==========
    // Fetch broker ACH details from broker_master
    $achStmt = $conn->prepare("
        SELECT
            broker_id,
            broker_name,
            ach_bank_name,
            ach_routing_num,
            ach_account_num,
            ach_account_type
        FROM broker_master
        WHERE broker_name = :broker
        LIMIT 1
    ");
    $achStmt->execute([':broker' => $broker]);
    $brokerInfo = $achStmt->fetch(PDO::FETCH_ASSOC);

    $achCsvPath = $exportDir . '/payments_ach_' . $batchId . '.csv';
    $fpAch = fopen($achCsvPath, 'w');
    if ($fpAch === false) {
        json_exit([
            'success' => false,
            'error'   => 'Could not open ACH CSV file for writing',
        ], 500);
    }

    // ACH CSV header
    fputcsv($fpAch, [
        'batch_id',
        'merchant_id',
        'broker_id',
        'broker_name',
        'payment_amount',
        'bank_name',
        'routing_number',
        'account_number',
        'account_type',
        'order_count',
    ]);

    // Single ACH payment record
    fputcsv($fpAch, [
        $batchId,
        $merchantId,
        $brokerInfo ? $brokerInfo['broker_id'] : '',
        $broker,
        number_format($totalPaymentAmount, 2, '.', ''),
        $brokerInfo ? $brokerInfo['ach_bank_name'] : '',
        $brokerInfo ? $brokerInfo['ach_routing_num'] : '',
        $brokerInfo ? $brokerInfo['ach_account_num'] : '',
        $brokerInfo ? $brokerInfo['ach_account_type'] : '',
        count($orders),
    ]);

    fclose($fpAch);

    // ========== COMBINED XLSX (two sheets: ACH Summary + Order Detail) ==========
    $xlsxPath = null;
    $xlsxFileId = null;
    $xlsxUrl = null;

    if (class_exists('ZipArchive')) {
        try {
            $xlsxPath = $exportDir . '/payments_' . $batchId . '.xlsx';

            $achSummaryRows = [
                ['batch_id', 'merchant_id', 'broker_id', 'broker_name', 'payment_amount',
                 'bank_name', 'routing_number', 'account_number', 'account_type', 'order_count'],
                [
                    $batchId,
                    $merchantId,
                    $brokerInfo ? $brokerInfo['broker_id'] : '',
                    $broker,
                    number_format($totalPaymentAmount, 2, '.', ''),
                    $brokerInfo ? $brokerInfo['ach_bank_name'] : '',
                    $brokerInfo ? $brokerInfo['ach_routing_num'] : '',
                    $brokerInfo ? $brokerInfo['ach_account_num'] : '',
                    $brokerInfo ? $brokerInfo['ach_account_type'] : '',
                    (string)count($orders),
                ],
            ];

            $detailRows = [
                ['batch_id', 'merchant_id', 'broker', 'member_id', 'order_id',
                 'basket_id', 'symbol', 'shares', 'amount_cash', 'points_used', 'executed_at'],
            ];
            foreach ($orders as $row) {
                $amountCash2 = $row['executed_amount'] !== null
                    ? (float)$row['executed_amount']
                    : (float)$row['amount'];

                $detailRows[] = [
                    $batchId,
                    $row['merchant_id'],
                    $row['broker'],
                    $row['member_id'],
                    $row['order_id'],
                    $row['basket_id'],
                    $row['symbol'],
                    $row['shares'],
                    number_format($amountCash2, 2, '.', ''),
                    $row['points_used'],
                    $row['executed_at'],
                ];
            }

            writeXlsx($xlsxPath, [
                'ACH Summary'  => $achSummaryRows,
                'Order Detail'  => $detailRows,
            ]);

            error_log("[export-payments-file] XLSX generated: " . basename($xlsxPath));
        } catch (Throwable $xlsxErr) {
            error_log("[export-payments-file] XLSX generation failed (non-fatal): " . $xlsxErr->getMessage());
            $xlsxPath = null; // continue without XLSX
        }
    } else {
        error_log("[export-payments-file] ZipArchive not available, skipping XLSX. Install php-zip: sudo apt install php-zip");
    }

    // ✅ Log CSV files to database for CSV Files Browser
    $detailFileId = logCsvFile(
        $conn, 
        $merchantId, 
        $broker, 
        basename($detailCsvPath), 
        'exports/' . basename($detailCsvPath), 
        'detail'
    );
    
    $achFileId = logCsvFile(
        $conn, 
        $merchantId, 
        $broker, 
        basename($achCsvPath), 
        'exports/' . basename($achCsvPath), 
        'ach'
    );

    $xlsxFileId = null;
    if ($xlsxPath && file_exists($xlsxPath)) {
        $xlsxFileId = logCsvFile(
            $conn,
            $merchantId,
            $broker,
            basename($xlsxPath),
            'exports/' . basename($xlsxPath),
            'xlsx'
        );
    }

    // Generate download URLs
    $apiBase = rtrim($_ENV['API_BASE'] ?? 'https://api.stockloyal.com/api', '/');
    $detailUrl = $apiBase . '/exports/' . basename($detailCsvPath);
    $achUrl = $apiBase . '/exports/' . basename($achCsvPath);
    $xlsxUrl = ($xlsxPath && file_exists($xlsxPath))
        ? $apiBase . '/exports/' . basename($xlsxPath)
        : null;

    // 4) Mark orders as paid + insert ledger entries in a transaction
    try {
        $conn->beginTransaction();

        // UPDATE orders - mark as settled and paid
        $updateOrderStmt = $conn->prepare("
            UPDATE orders
            SET
                status        = 'settled',
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

        // First, update all orders with the batch_id
        foreach ($orders as $row) {
            $orderId = (int)$row['order_id'];
            
            $ok = $updateOrderStmt->execute([
                ':batch_id' => $batchId,
                ':order_id' => $orderId,
            ]);
            if (!$ok) {
                $errInfo = $updateOrderStmt->errorInfo();
                error_log('export-payment-file: orders UPDATE failed: ' . implode(' | ', $errInfo));
                throw new RuntimeException('Failed to update order_id=' . $orderId);
            }
        }

        // Aggregate orders by member_id
        $memberAggregates = [];
        foreach ($orders as $row) {
            $memberId = (string)$row['member_id'];
            
            if (!isset($memberAggregates[$memberId])) {
                $memberAggregates[$memberId] = [
                    'member_id' => $memberId,
                    'merchant_id' => (string)$row['merchant_id'],
                    'broker' => (string)$row['broker'],
                    'member_timezone' => (string)$row['member_timezone'],
                    'total_amount_cash' => 0,
                    'order_ids' => [],
                ];
            }
            
            $amountCash = $row['executed_amount'] !== null
                ? (float)$row['executed_amount']
                : (float)$row['amount'];
            
            $memberAggregates[$memberId]['total_amount_cash'] += $amountCash;
            $memberAggregates[$memberId]['order_ids'][] = (int)$row['order_id'];
        }

        // INSERT one transactions_ledger entry per member
        foreach ($memberAggregates as $memberId => $agg) {
            // client_tx_id must be unique – use batch + member_id + microtime for uniqueness
            // This prevents duplicates if the export is re-run for the same broker
            $clientTxId = sprintf('pay_%s_%s_%s', $batchId, $memberId, uniqid());
            
            // Use the first order_id as reference
            $firstOrderId = $agg['order_ids'][0] ?? null;
            
            // Create note listing all order IDs
            $orderIdsList = implode(',', $agg['order_ids']);
            $note = sprintf(
                'ACH payment batch %s for %d order(s): %s',
                $batchId,
                count($agg['order_ids']),
                $orderIdsList
            );

            $ok = $insertLedgerStmt->execute([
                ':member_id'       => $agg['member_id'],
                ':merchant_id'     => $agg['merchant_id'],
                ':broker'          => $agg['broker'],
                ':order_id'        => $firstOrderId,
                ':client_tx_id'    => $clientTxId,
                ':external_ref'    => $batchId,
                ':tx_type'         => 'cash_out',
                ':direction'       => 'outbound',
                ':channel'         => 'ACH',
                ':status'          => 'confirmed',
                ':amount_points'   => null,
                ':amount_cash'     => $agg['total_amount_cash'],
                ':note'            => $note,
                ':member_timezone' => $agg['member_timezone'],
            ]);
            if (!$ok) {
                $errInfo = $insertLedgerStmt->errorInfo();
                error_log('export-payment-file: ledger INSERT failed: ' . implode(' | ', $errInfo));
                throw new RuntimeException('Failed to insert ledger for member_id=' . $memberId);
            }
        }

        $conn->commit();
    } catch (Throwable $te) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }

        // Optional: remove CSV files if DB update fails
        // @unlink($detailCsvPath);
        // @unlink($achCsvPath);

        error_log('export-payment-file: DB update/ledger failed: ' . $te->getMessage());
        json_exit([
            'success' => false,
            'error'   => 'Failed to mark orders as paid or insert ledger records',
            'detail'  => $te->getMessage(),
        ], 500);
    }

    // 5) Success response with new format
    $response = [
        'success' => true,
        'detail_csv' => [
            'filename' => basename($detailCsvPath),
            'relative_path' => 'exports/' . basename($detailCsvPath),
            'url' => $detailUrl,
            'file_id' => $detailFileId,
        ],
        'ach_csv' => [
            'filename' => basename($achCsvPath),
            'relative_path' => 'exports/' . basename($achCsvPath),
            'url' => $achUrl,
            'file_id' => $achFileId,
        ],
        'batch_id' => $batchId,
        'merchant_id' => $merchantId,
        'broker' => $broker,
        'order_count' => count($orders),
        'total_amount' => $totalPaymentAmount,
    ];

    if ($xlsxUrl) {
        $response['xlsx'] = [
            'filename' => basename($xlsxPath),
            'relative_path' => 'exports/' . basename($xlsxPath),
            'url' => $xlsxUrl,
            'file_id' => $xlsxFileId,
        ];
    }

    json_exit($response);
} catch (Throwable $e) {
    error_log('export-payment-file fatal: ' . $e->getMessage());
    json_exit([
        'success' => false,
        'error'   => 'Unexpected server error in export-payment-file.php',
    ], 500);
}
