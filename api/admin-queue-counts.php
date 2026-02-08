<?php
declare(strict_types=1);

/**
 * admin-queue-counts.php
 *
 * Returns counts of open items for each admin processing stage:
 *   - prepare:  members eligible for order preparation (enrolled in sweep, cash_balance > 0, no pending/placed orders)
 *   - sweep:    orders with status 'pending' awaiting sweep to broker
 *   - execute:  orders with status 'placed' awaiting broker execution
 *   - payments: orders with status 'confirmed' awaiting payment settlement
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    // Prepare: total orders (stock picks) for eligible members
    $prepare = $conn->query("
        SELECT COUNT(*) AS cnt
        FROM   member_stock_picks msp
        JOIN   wallet w ON w.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
        WHERE  msp.is_active = 1
          AND  w.sweep_percentage > 0
          AND  w.cash_balance > 0
          AND  LOWER(w.member_status) = 'active'
          AND  NOT EXISTS (
               SELECT 1 FROM orders o
               WHERE  o.member_id = w.member_id
                 AND  LOWER(o.status) IN ('pending','placed')
          )
    ")->fetch()['cnt'];

    // Sweep: pending orders awaiting sweep to broker
    $sweep = $conn->query("
        SELECT COUNT(*) AS cnt
        FROM   orders
        WHERE  LOWER(status) = 'pending'
    ")->fetch()['cnt'];

    // Execute: placed orders awaiting broker execution
    $execute = $conn->query("
        SELECT COUNT(*) AS cnt
        FROM   orders
        WHERE  LOWER(status) = 'placed'
    ")->fetch()['cnt'];

    // Payments: orders with status 'confirmed' or 'executed' that are not yet paid (with basket count)
    $paymentsRow = $conn->query("
        SELECT 
            COUNT(*) AS total_orders,
            COUNT(DISTINCT basket_id) AS total_baskets
        FROM   orders
        WHERE  LOWER(status) IN ('confirmed', 'executed')
          AND  (paid_at IS NULL OR paid_at = '0000-00-00 00:00:00')
    ")->fetch();

    echo json_encode([
        'success'  => true,
        'counts'   => [
            'prepare'         => (int) $prepare,
            'sweep'           => (int) $sweep,
            'execute'         => (int) $execute,
            'payments'        => (int) $paymentsRow['total_orders'],
            'payments_baskets'=> (int) $paymentsRow['total_baskets'],
            'payments_orders' => (int) $paymentsRow['total_orders'],
        ],
    ]);

} catch (Exception $e) {
    // If paid_at column doesn't exist, retry payments without that filter
    if (str_contains($e->getMessage(), 'paid_at')) {
        try {
            $paymentsRow = $conn->query("
                SELECT 
                    COUNT(*) AS total_orders,
                    COUNT(DISTINCT basket_id) AS total_baskets
                FROM   orders
                WHERE  LOWER(status) IN ('confirmed', 'executed')
            ")->fetch();

            echo json_encode([
                'success'  => true,
                'counts'   => [
                    'prepare'         => (int) ($prepare ?? 0),
                    'sweep'           => (int) ($sweep ?? 0),
                    'execute'         => (int) ($execute ?? 0),
                    'payments'        => (int) $paymentsRow['total_orders'],
                    'payments_baskets'=> (int) $paymentsRow['total_baskets'],
                    'payments_orders' => (int) $paymentsRow['total_orders'],
                ],
            ]);
            exit;
        } catch (Exception $e2) {
            // fall through
        }
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
