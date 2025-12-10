<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
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

    // Optional: paid_filter (unpaid|paid|all) – default unpaid
    $paid_filter = strtolower(trim($input['paid_filter'] ?? 'unpaid'));
    switch ($paid_filter) {
        case 'paid':
            $paidWhere = " AND o.paid_flag = 1";
            break;
        case 'all':
            $paidWhere = "";
            break;
        case 'unpaid':
        default:
            $paid_filter = 'unpaid';
            $paidWhere = " AND o.paid_flag = 0";
            break;
    }

    $sqlOrders = "
        SELECT 
            o.*,
            bc.username AS broker_username,
            COALESCE(o.executed_amount, o.amount) AS payment_amount
        FROM orders o
        LEFT JOIN broker_credentials bc
            ON o.broker COLLATE utf8mb4_general_ci = bc.broker COLLATE utf8mb4_general_ci
           AND o.member_id COLLATE utf8mb4_general_ci = bc.member_id COLLATE utf8mb4_general_ci
        WHERE o.merchant_id = :merchant_id
          AND o.status IN ('confirmed','executed')
          $paidWhere
        ORDER BY o.broker, o.order_id
    ";

    $stmtOrders = $conn->prepare($sqlOrders);
    $stmtOrders->bindValue(':merchant_id', $merchant_id, PDO::PARAM_STR);
    $stmtOrders->execute();
    $orders = $stmtOrders->fetchAll(PDO::FETCH_ASSOC);

    $sqlSummary = "
        SELECT
            o.broker,
            COALESCE(bc.username, '') AS broker_username,
            bm.broker_id,
            bm.ach_bank_name,
            bm.ach_routing_num,
            bm.ach_account_num,
            bm.ach_account_type,
            COUNT(*) AS order_count,
            SUM(COALESCE(o.executed_amount, o.amount)) AS total_payment_amount
        FROM orders o
        LEFT JOIN broker_credentials bc
            ON o.broker COLLATE utf8mb4_general_ci = bc.broker COLLATE utf8mb4_general_ci
           AND o.member_id COLLATE utf8mb4_general_ci = bc.member_id COLLATE utf8mb4_general_ci
        LEFT JOIN broker_master bm
            ON bm.broker_name COLLATE utf8mb4_general_ci = o.broker COLLATE utf8mb4_general_ci
        WHERE o.merchant_id = :merchant_id
          AND o.status IN ('confirmed','executed')
          $paidWhere
        GROUP BY
            o.broker,
            bc.username,
            bm.broker_id,
            bm.ach_bank_name,
            bm.ach_routing_num,
            bm.ach_account_num,
            bm.ach_account_type
        ORDER BY o.broker
    ";

    $stmtSummary = $conn->prepare($sqlSummary);
    $stmtSummary->bindValue(':merchant_id', $merchant_id, PDO::PARAM_STR);
    $stmtSummary->execute();
    $summary = $stmtSummary->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "success"      => true,
        "merchant_id"  => $merchant_id,
        "paid_filter"  => $paid_filter,
        "orders"       => $orders,
        "summary"      => $summary,
    ], JSON_NUMERIC_CHECK);

} catch (Exception $e) {
    error_log("get-payments.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage(),
    ]);
}
