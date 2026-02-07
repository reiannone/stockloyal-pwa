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
    // Prepare: members eligible for order preparation
    // who don't already have pending or placed orders
    $prepare = $conn->query("
        SELECT COUNT(*) AS cnt
        FROM   wallet w
        WHERE  w.sweep_percentage > 0
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

    // Payments: confirmed orders awaiting settlement
    $payments = $conn->query("
        SELECT COUNT(*) AS cnt
        FROM   orders
        WHERE  LOWER(status) = 'confirmed'
          AND  (settled_at IS NULL OR settled_at = '0000-00-00 00:00:00')
    ")->fetch()['cnt'];

    echo json_encode([
        'success'  => true,
        'counts'   => [
            'prepare'  => (int) $prepare,
            'sweep'    => (int) $sweep,
            'execute'  => (int) $execute,
            'payments' => (int) $payments,
        ],
    ]);

} catch (Exception $e) {
    // If settled_at column doesn't exist, retry payments without that filter
    if (str_contains($e->getMessage(), 'settled_at')) {
        try {
            $payments = $conn->query("
                SELECT COUNT(*) AS cnt
                FROM   orders
                WHERE  LOWER(status) = 'confirmed'
            ")->fetch()['cnt'];

            echo json_encode([
                'success'  => true,
                'counts'   => [
                    'prepare'  => (int) ($prepare ?? 0),
                    'sweep'    => (int) ($sweep ?? 0),
                    'execute'  => (int) ($execute ?? 0),
                    'payments' => (int) $payments,
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
