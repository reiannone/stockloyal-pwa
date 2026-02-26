<?php
/**
 * trigger_sweep.php — Manually trigger sweep process from admin
 *
 * Called by SweepAdmin.jsx → apiPost("trigger_sweep.php", { action, merchant_id })
 *
 * Actions:
 *   run             →  Execute sweep (mark placed, notify brokers)
 *   preview         →  Preview what would be processed (no changes)
 *   retry_failed    →  Re-process failed orders from a previous batch
 */

declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/sweep_process.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input      = json_decode(file_get_contents("php://input"), true);
$merchantId = $input['merchant_id'] ?? null;
$action     = $input['action'] ?? 'run';

try {
    switch ($action) {

        // ==============================================================
        // RUN  —  execute sweep immediately
        // ==============================================================
        case 'run':
            $sweep   = new SweepProcess($conn);
            $results = $sweep->run($merchantId);

            // If market is closed, return early without marking prepare_batches
            if (!empty($results['market_closed'])) {
                echo json_encode([
                    'success'      => false,
                    'market_closed' => true,
                    'message'      => $results['errors'][0] ?? 'Market is closed',
                    'next_market_open' => $results['next_market_open'] ?? null,
                    'results'      => $results,
                ]);
                break;
            }

            // Mark approved prepare_batches as "submitted" if all their orders have been swept
            try {
                $conn->exec("
                    UPDATE prepare_batches pb
                    SET    pb.status = 'submitted', pb.submitted_at = NOW()
                    WHERE  pb.status = 'approved'
                      AND  NOT EXISTS (
                           SELECT 1 FROM orders o
                           WHERE  LOWER(o.status) = 'funded'
                             AND  (
                                o.batch_id = pb.batch_id
                                OR (o.batch_id IS NULL AND o.basket_id LIKE CONCAT(pb.batch_id, '-%'))
                             )
                      )
                ");
            } catch (\Exception $e) {
                // Non-fatal — log but don't break sweep response
                error_log("prepare_batches submitted update failed: " . $e->getMessage());
            }

            echo json_encode([
                'success' => true,
                'message' => $merchantId
                    ? "Sweep triggered for merchant: {$merchantId}"
                    : "Sweep triggered for all eligible merchants",
                'results' => $results,
            ]);
            break;

        // ==============================================================
        // PREVIEW  —  dry run, no DB changes
        // ==============================================================
        case 'preview':
            $preview = previewSweep($conn, $merchantId);
            echo json_encode([
                'success' => true,
                'preview' => $preview,
            ]);
            break;

        // ==============================================================
        // RETRY  —  re-process a failed batch
        // ==============================================================
        case 'retry_failed':
            $batchId = $input['batch_id'] ?? null;
            if (!$batchId) {
                throw new Exception("batch_id required for retry");
            }
            $results = retryFailedOrders($conn, $batchId);
            echo json_encode([
                'success' => true,
                'results' => $results,
            ]);
            break;

        default:
            throw new Exception("Unknown action: {$action}");
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ]);
}

// ==================================================================
// PREVIEW helper  (read-only — no status changes)
// ==================================================================

function previewSweep(PDO $conn, ?string $merchantId = null): array
{
    $today          = (int) date('j');
    $lastDayOfMonth = (int) date('t');

    // Get merchants to process
    if ($merchantId) {
        $stmt = $conn->prepare("
            SELECT merchant_id, merchant_name, sweep_day
            FROM   merchant
            WHERE  merchant_id = :merchant_id
        ");
        $stmt->execute([':merchant_id' => $merchantId]);
    } else {
        $stmt = $conn->prepare("
            SELECT merchant_id, merchant_name, sweep_day
            FROM   merchant
            WHERE  sweep_day IS NOT NULL
              AND  (sweep_day = :today OR (sweep_day = -1 AND :today2 = :last_day))
        ");
        $stmt->execute([':today' => $today, ':today2' => $today, ':last_day' => $lastDayOfMonth]);
    }

    $merchants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $preview   = [];

    foreach ($merchants as $merchant) {
        $stmt = $conn->prepare("
            SELECT o.broker,
                   COUNT(*)                    AS order_count,
                   SUM(o.amount)               AS total_amount,
                   SUM(o.shares)               AS total_shares,
                   GROUP_CONCAT(DISTINCT o.symbol) AS symbols
            FROM   orders o
            WHERE  o.merchant_id = :merchant_id
              AND  LOWER(o.status) = 'funded'
            GROUP  BY o.broker
        ");
        $stmt->execute([':merchant_id' => $merchant['merchant_id']]);
        $brokerGroups = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $mp = [
            'merchant_id'   => $merchant['merchant_id'],
            'merchant_name' => $merchant['merchant_name'],
            'sweep_day'     => $merchant['sweep_day'],
            'brokers'       => [],
            'total_orders'  => 0,
            'total_amount'  => 0,
        ];

        foreach ($brokerGroups as $g) {
            $mp['brokers'][] = [
                'broker'       => $g['broker'] ?? 'Unknown',
                'order_count'  => (int)   $g['order_count'],
                'total_amount' => (float) $g['total_amount'],
                'total_shares' => (float) $g['total_shares'],
                'symbols'      => $g['symbols'],
            ];
            $mp['total_orders'] += (int)   $g['order_count'];
            $mp['total_amount'] += (float) $g['total_amount'];
        }

        if ($mp['total_orders'] > 0) {
            $preview[] = $mp;
        }
    }

    return [
        'merchants'       => $preview,
        'total_merchants' => count($preview),
        'total_orders'    => array_sum(array_column($preview, 'total_orders')),
        'total_amount'    => array_sum(array_column($preview, 'total_amount')),
    ];
}

// ==================================================================
// RETRY helper  (placeholder — extend as needed)
// ==================================================================

function retryFailedOrders(PDO $conn, string $batchId): array
{
    return [
        'batch_id'       => $batchId,
        'message'        => 'Retry functionality — implement based on sweep_log error tracking',
        'orders_retried' => 0,
    ];
}
