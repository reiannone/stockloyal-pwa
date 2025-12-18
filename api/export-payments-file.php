<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

require_once __DIR__ . "/config.php"; // $conn = PDO

function safe_filename(string $s): string {
    $s = trim($s);
    $s = preg_replace('/[^A-Za-z0-9._-]+/', '_', $s);
    $s = preg_replace('/_+/', '_', $s);
    return trim($s, '_');
}

function num($v): float {
    if ($v === null || $v === '') return 0.0;
    if (is_numeric($v)) return (float)$v;
    return 0.0;
}

function build_url(string $relativePath): string {
    // Frontend can use relative_path, but this helps for direct clicking.
    // If you set API_BASE_PUBLIC=https://api.stockloyal.com/api in your .env, it will be used.
    $base = rtrim($_ENV['API_BASE_PUBLIC'] ?? '', '/');
    if ($base === '') return $relativePath; // fallback
    // relative path may be "api/exports/xxx.csv" OR "exports/xxx.csv"
    $relativePath = ltrim($relativePath, '/');
    if (str_starts_with($relativePath, 'api/')) {
        $relativePath = substr($relativePath, 4); // remove "api/"
    }
    return $base . '/' . $relativePath;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode([
            "success" => false,
            "error"   => "Method not allowed",
        ]);
        exit;
    }

    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Invalid JSON payload",
        ]);
        exit;
    }

    $merchant_id = trim($input['merchant_id'] ?? '');
    if ($merchant_id === '') {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "merchant_id is required",
        ]);
        exit;
    }

    $broker = trim($input['broker'] ?? '');
    if ($broker === '') {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "broker is required for export",
        ]);
        exit;
    }

    // Optional: paid_filter (default unpaid)
    $paid_filter = strtolower(trim($input['paid_filter'] ?? 'unpaid'));
    $paidWhere = " AND o.paid_flag = 0";
    if ($paid_filter === 'paid') $paidWhere = " AND o.paid_flag = 1";
    if ($paid_filter === 'all')  $paidWhere = "";

    // Pull orders for this merchant+broker
    $sql = "
        SELECT
            o.*,
            bc.username AS broker_username,
            COALESCE(o.executed_amount, o.amount) AS payment_amount
        FROM stockloyal.orders o
        LEFT JOIN broker_credentials bc
            ON o.broker = bc.broker
           AND o.member_id = bc.member_id
        WHERE o.merchant_id = :merchant_id
          AND o.broker = :broker
          AND o.status IN ('confirmed','executed')
          $paidWhere
        ORDER BY o.order_id
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bindValue(':merchant_id', $merchant_id, PDO::PARAM_STR);
    $stmt->bindValue(':broker', $broker, PDO::PARAM_STR);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$rows) {
        echo json_encode([
            "success" => false,
            "error"   => "No matching orders found for this merchant and broker (with current paid_filter).",
        ]);
        exit;
    }

    // Pull merchant name (best-effort; use merchant_id as fallback)
    $merchant_name = $merchant_id; // default fallback
    try {
        $sqlMerchant = "SELECT name FROM merchant WHERE merchant_id = :merchant_id LIMIT 1";
        $stmtMerchant = $conn->prepare($sqlMerchant);
        $stmtMerchant->bindValue(':merchant_id', $merchant_id, PDO::PARAM_STR);
        $stmtMerchant->execute();
        $merchantRow = $stmtMerchant->fetch(PDO::FETCH_ASSOC);
        if ($merchantRow && !empty($merchantRow['name'])) {
            $merchant_name = $merchantRow['name'];
        }
    } catch (Exception $e) {
        // Table might not exist, just use merchant_id
        error_log("Could not fetch merchant name: " . $e->getMessage());
    }

    // Pull broker ACH info (best-effort; do not fail export if missing)
    $sqlAch = "
        SELECT broker_id, broker_name, ach_bank_name, ach_routing_num, ach_account_num, ach_account_type
        FROM broker_master
        WHERE broker_name COLLATE utf8mb4_general_ci = :broker COLLATE utf8mb4_general_ci
        LIMIT 1
    ";
    $stmtAch = $conn->prepare($sqlAch);
    $stmtAch->bindValue(':broker', $broker, PDO::PARAM_STR);
    $stmtAch->execute();
    $ach = $stmtAch->fetch(PDO::FETCH_ASSOC) ?: [];

    // Export directory
    $exportDir = __DIR__ . "/exports";
    if (!is_dir($exportDir)) {
        if (!mkdir($exportDir, 0775, true) && !is_dir($exportDir)) {
            throw new RuntimeException("Failed to create export directory");
        }
    }

    $timestamp  = date("Ymd_His");
    $safeBroker = safe_filename($broker);
    $safeMerch  = safe_filename($merchant_id);

    // Legacy (keep existing behavior)
    $legacyFilename = "payments_{$safeMerch}_{$safeBroker}_{$timestamp}.csv";
    $legacyFilepath = $exportDir . "/" . $legacyFilename;

    // New files
    $detailFilename = "payments_{$safeMerch}_{$safeBroker}_{$timestamp}_detail.csv";
    $detailFilepath = $exportDir . "/" . $detailFilename;

    $achFilename    = "payments_{$safeMerch}_{$safeBroker}_{$timestamp}_ach.csv";
    $achFilepath    = $exportDir . "/" . $achFilename;

    // -------------------------
    // Write LEGACY CSV (single file: same as before)
    // -------------------------
    $fpLegacy = fopen($legacyFilepath, 'w');
    if ($fpLegacy === false) {
        throw new RuntimeException("Unable to open legacy export file for writing");
    }

    $legacyHeader = array_keys($rows[0]);
    fputcsv($fpLegacy, $legacyHeader);
    foreach ($rows as $row) {
        $line = [];
        foreach ($legacyHeader as $col) $line[] = $row[$col] ?? '';
        fputcsv($fpLegacy, $line);
    }
    fclose($fpLegacy);

    // -------------------------
    // Write DETAIL CSV (explicit header, consistent)
    // -------------------------
    $fpDetail = fopen($detailFilepath, 'w');
    if ($fpDetail === false) {
        throw new RuntimeException("Unable to open detail export file for writing");
    }

    $detailHeader = [
        "merchant_id","broker","basket_id","order_id","member_id","symbol","side","qty",
        "amount","executed_amount","payment_amount","status","placed_at","executed_at","created_at","broker_username"
    ];
    fputcsv($fpDetail, $detailHeader);

    $totalAmount = 0.0;
    $basketSet = [];

    foreach ($rows as $r) {
        $payment = num($r['payment_amount'] ?? ($r['executed_amount'] ?? ($r['amount'] ?? 0)));
        $totalAmount += $payment;

        $basketId = (string)($r['basket_id'] ?? '');
        if ($basketId !== '') $basketSet[$basketId] = true;

        fputcsv($fpDetail, [
            $r['merchant_id'] ?? '',
            $r['broker'] ?? '',
            $r['basket_id'] ?? '',
            $r['order_id'] ?? '',
            $r['member_id'] ?? '',
            $r['symbol'] ?? '',
            $r['side'] ?? '',
            $r['qty'] ?? '',
            $r['amount'] ?? '',
            $r['executed_amount'] ?? '',
            number_format($payment, 2, '.', ''),
            $r['status'] ?? '',
            $r['placed_at'] ?? '',
            $r['executed_at'] ?? '',
            $r['created_at'] ?? '',
            $r['broker_username'] ?? '',
        ]);
    }

    fclose($fpDetail);

    $orderCount  = count($rows);
    $basketCount = count($basketSet);

    // -------------------------
    // Write ACH CSV (single payment record)
    // -------------------------
    $fpAch = fopen($achFilepath, 'w');
    if ($fpAch === false) {
        throw new RuntimeException("Unable to open ach export file for writing");
    }

    $achHeader = [
        "payment_date",
        "merchant_id",
        "merchant_name",
        "broker_id",
        "broker_name",
        "ach_bank_name",
        "ach_routing_num",
        "ach_account_num",
        "ach_account_type",
        "payment_amount_total",
        "unpaid_order_count",
        "unpaid_basket_count",
        "memo"
    ];
    fputcsv($fpAch, $achHeader);

    fputcsv($fpAch, [
        date('Y-m-d H:i:s'), // payment_date (current timestamp)
        $merchant_id,
        $merchant_name,
        $ach['broker_id'] ?? '',
        $ach['broker_name'] ?? $broker,
        $ach['ach_bank_name'] ?? '',
        $ach['ach_routing_num'] ?? '',
        $ach['ach_account_num'] ?? '',
        $ach['ach_account_type'] ?? '',
        number_format($totalAmount, 2, '.', ''),
        $orderCount,
        $basketCount,
        "StockLoyal ACH payment"
    ]);

    fclose($fpAch);

    // relative paths (match your existing convention)
    $legacyRel = "api/exports/" . $legacyFilename;
    $detailRel = "api/exports/" . $detailFilename;
    $achRel    = "api/exports/" . $achFilename;

    echo json_encode([
        "success"  => true,
        "message"  => "Export files created",
        "merchant_id" => $merchant_id,
        "broker" => $broker,
        "paid_filter" => $paid_filter,

        "totals" => [
            "unpaid_orders" => $orderCount,
            "unpaid_baskets" => $basketCount,
            "total_payment_due" => (float)number_format($totalAmount, 2, '.', '')
        ],

        // NEW (your PaymentsBroker page should use these)
        "detail_csv" => [
            "filename" => $detailFilename,
            "relative_path" => $detailRel,
            "url" => build_url($detailRel),
        ],
        "ach_csv" => [
            "filename" => $achFilename,
            "relative_path" => $achRel,
            "url" => build_url($achRel),
        ],

        // LEGACY (keep existing consumers working)
        "legacy_csv" => [
            "filename" => $legacyFilename,
            "relative_path" => $legacyRel,
            "url" => build_url($legacyRel),
        ],
        "filename" => $legacyFilename,              // backward compatible
        "relative_path" => $legacyRel,              // backward compatible
    ]);

} catch (Exception $e) {
    error_log("export-payments-file.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage(),
    ]);
}
