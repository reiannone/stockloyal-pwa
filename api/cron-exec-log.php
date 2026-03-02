<?php
/**
 * cron-exec-log.php
 * ============================================================================
 * Admin API for cron execution monitoring.
 *
 * Actions:
 *   runs          — List recent cron runs with stats
 *   run_orders    — Get per-order detail for a specific run
 *   trigger       — Manually trigger a broker execution (calls cron internally)
 *   stats         — Dashboard summary stats
 * ============================================================================
 */

header("Content-Type: application/json");
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_admin.php';  // admin auth check

$input  = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? 'runs';

try {
    switch ($action) {

        // ── List recent cron runs ────────────────────────────────────────
        case 'runs':
            $limit  = min(intval($input['limit'] ?? 30), 100);
            $filter = $input['filter'] ?? null; // 'completed', 'failed', 'no_orders', etc.

            $sql = "SELECT * FROM cron_exec_log";
            $params = [];

            if ($filter && in_array($filter, ['started','processing','completed','failed','no_orders'])) {
                $sql .= " WHERE status = ?";
                $params[] = $filter;
            }

            $sql .= " ORDER BY started_at DESC LIMIT ?";
            $params[] = $limit;

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $runs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Numeric type coercion
            foreach ($runs as &$r) {
                $r['orders_found']      = (int) $r['orders_found'];
                $r['orders_submitted']  = (int) $r['orders_submitted'];
                $r['orders_failed']     = (int) $r['orders_failed'];
                $r['orders_filled']     = (int) $r['orders_filled'];
                $r['baskets_processed'] = (int) $r['baskets_processed'];
                $r['brokers_processed'] = (int) $r['brokers_processed'];
                $r['total_amount']      = (float) $r['total_amount'];
                $r['duration_ms']       = (int) ($r['duration_ms'] ?? 0);
            }

            echo json_encode(['success' => true, 'runs' => $runs]);
            break;


        // ── Per-order details for a specific run ─────────────────────────
        case 'run_orders':
            $runId = $input['run_id'] ?? null;
            if (!$runId) {
                echo json_encode(['success' => false, 'error' => 'run_id required']);
                exit;
            }

            $stmt = $pdo->prepare("
                SELECT * FROM cron_exec_orders
                WHERE run_id = ?
                ORDER BY order_id ASC
            ");
            $stmt->execute([$runId]);
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($orders as &$o) {
                $o['order_id']    = (int) $o['order_id'];
                $o['amount']      = (float) $o['amount'];
                $o['shares']      = (float) $o['shares'];
                $o['filled_price'] = $o['filled_price'] ? (float) $o['filled_price'] : null;
                $o['filled_qty']   = $o['filled_qty'] ? (float) $o['filled_qty'] : null;
                $o['filled_amount']= $o['filled_amount'] ? (float) $o['filled_amount'] : null;
            }

            echo json_encode(['success' => true, 'orders' => $orders]);
            break;


        // ── Manually trigger execution ───────────────────────────────────
        case 'trigger':
            // Run the cron script as an internal call
            define('CRON_INTERNAL_TRIGGER', true);

            // Use exec() to run asynchronously and return immediately
            $cmd = '/usr/bin/php ' . __DIR__ . '/cron-broker-execute.php --trigger=manual';
            $output = [];
            $code = 0;
            exec($cmd . ' 2>&1 &', $output, $code);

            // Alternatively, for synchronous (wait for result):
            // ob_start();
            // include __DIR__ . '/cron-broker-execute.php';
            // $cronOutput = ob_get_clean();

            echo json_encode([
                'success' => true,
                'message' => 'Broker execution triggered (manual)',
                'async'   => true,
            ]);
            break;


        // ── Dashboard summary stats ──────────────────────────────────────
        case 'stats':
            // Last 24h stats
            $stmt = $pdo->prepare("
                SELECT
                    COUNT(*)                                           AS total_runs,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_runs,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)    AS failed_runs,
                    SUM(CASE WHEN status = 'no_orders' THEN 1 ELSE 0 END) AS empty_runs,
                    SUM(orders_submitted)                              AS total_submitted,
                    SUM(orders_failed)                                 AS total_failed,
                    SUM(orders_filled)                                 AS total_filled,
                    SUM(total_amount)                                  AS total_amount,
                    AVG(duration_ms)                                   AS avg_duration_ms
                FROM cron_exec_log
                WHERE started_at >= NOW() - INTERVAL 24 HOUR
            ");
            $stmt->execute();
            $stats24h = $stmt->fetch(PDO::FETCH_ASSOC);

            // All-time stats
            $stmtAll = $pdo->prepare("
                SELECT
                    COUNT(*)                AS total_runs,
                    SUM(orders_submitted)   AS total_submitted,
                    SUM(total_amount)       AS total_amount,
                    MAX(started_at)         AS last_run
                FROM cron_exec_log
            ");
            $stmtAll->execute();
            $statsAll = $stmtAll->fetch(PDO::FETCH_ASSOC);

            // Pending orders waiting
            $stmtPending = $pdo->prepare("
                SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
                FROM orders WHERE status = 'placed'
            ");
            $stmtPending->execute();
            $pending = $stmtPending->fetch(PDO::FETCH_ASSOC);

            echo json_encode([
                'success'  => true,
                'last_24h' => $stats24h,
                'all_time' => $statsAll,
                'pending'  => $pending,
            ]);
            break;


        default:
            echo json_encode(['success' => false, 'error' => "Unknown action: {$action}"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
