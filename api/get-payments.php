<?php
declare(strict_types=1);

/**
 * get-payments.php
 *
 * Returns approved orders awaiting merchant settlement (ACH funding to SL sweep).
 *
 * IB Flow:
 *   Orders start as 'approved' with paid_flag=0 (ready for merchant funding)
 *   → Fund IB Sweep sets paid_flag=1 (merchant paid SL) — status stays 'approved'
 *   → Journal moves to 'funded' and transfers from SL sweep to member accounts
 *   → Order Sweep places trades ('placed')
 *   → Broker Exec confirms ('settled')
 *
 * Input:  { merchant_id }
 * Output: { success, orders[], summary[] }
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

    if (empty($merchantId)) {
        echo json_encode(['success' => false, 'error' => 'merchant_id required']);
        exit;
    }

    // ── Get approved orders for this merchant ─────────────────────────
    $stmt = $conn->prepare("
        SELECT
            o.order_id,
            o.member_id,
            o.merchant_id,
            o.basket_id,
            o.symbol,
            o.amount,
            o.shares,
            o.points_used,
            o.status,
            o.broker,
            o.order_type,
            o.executed_amount,
            o.executed_shares,
            o.executed_at,
            o.paid_flag,
            o.paid_batch_id,
            o.paid_at,
            o.placed_at
        FROM orders o
        WHERE o.merchant_id = ?
          AND LOWER(o.status) = 'approved'
          AND (o.paid_flag = 0 OR o.paid_flag IS NULL)
        ORDER BY o.basket_id, o.order_id
    ");
    $stmt->execute([$merchantId]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── Broker summary with ACH details ───────────────────────────────
    $summaryStmt = $conn->prepare("
        SELECT
            o.broker,
            b.broker_id,
            b.ach_bank_name,
            b.ach_routing_num,
            b.ach_account_num,
            b.ach_account_type,
            COUNT(*) AS order_count,
            SUM(o.amount) AS total_amount
        FROM orders o
        LEFT JOIN broker_master b ON o.broker = b.broker_name
        WHERE o.merchant_id = ?
          AND LOWER(o.status) = 'approved'
          AND (o.paid_flag = 0 OR o.paid_flag IS NULL)
        GROUP BY o.broker, b.broker_id, b.ach_bank_name,
                 b.ach_routing_num, b.ach_account_num, b.ach_account_type
        ORDER BY o.broker
    ");
    $summaryStmt->execute([$merchantId]);
    $summary = $summaryStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'orders'  => $orders,
        'summary' => $summary,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
