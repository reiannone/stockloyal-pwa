<?php
/**
 * trigger_sweep.php - Manually trigger sweep process from admin
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

$input = json_decode(file_get_contents("php://input"), true);
$merchantId = $input['merchant_id'] ?? null;
$action = $input['action'] ?? 'run';

try {
    switch ($action) {
        case 'run':
            // Run sweep for specific merchant or all eligible
            $sweep = new SweepProcess($conn);
            $results = $sweep->run($merchantId);
            
            echo json_encode([
                'success' => true,
                'message' => $merchantId 
                    ? "Sweep triggered for merchant: {$merchantId}"
                    : "Sweep triggered for all eligible merchants",
                'results' => $results
            ]);
            break;
            
        case 'preview':
            // Preview what would be processed without actually running
            $preview = previewSweep($conn, $merchantId);
            echo json_encode([
                'success' => true,
                'preview' => $preview
            ]);
            break;
            
        case 'retry_failed':
            // Retry failed orders from a previous batch
            $batchId = $input['batch_id'] ?? null;
            if (!$batchId) {
                throw new Exception("batch_id required for retry");
            }
            $results = retryFailedOrders($conn, $batchId);
            echo json_encode([
                'success' => true,
                'results' => $results
            ]);
            break;
            
        default:
            throw new Exception("Unknown action: {$action}");
    }
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

/**
 * Preview what would be swept without executing
 */
function previewSweep(PDO $conn, ?string $merchantId = null): array {
    $today = (int) date('j');
    $lastDayOfMonth = (int) date('t');
    
    // Get merchants to process
    if ($merchantId) {
        $stmt = $conn->prepare("
            SELECT merchant_id, merchant_name, sweep_day 
            FROM merchant 
            WHERE merchant_id = :merchant_id
        ");
        $stmt->execute([':merchant_id' => $merchantId]);
    } else {
        $stmt = $conn->prepare("
            SELECT merchant_id, merchant_name, sweep_day 
            FROM merchant 
            WHERE sweep_day IS NOT NULL 
            AND (sweep_day = :today OR (sweep_day = -1 AND :today = :last_day))
        ");
        $stmt->execute([':today' => $today, ':last_day' => $lastDayOfMonth]);
    }
    
    $merchants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $preview = [];
    
    foreach ($merchants as $merchant) {
        // Get pending orders for this merchant
        $stmt = $conn->prepare("
            SELECT 
                o.broker,
                COUNT(*) as order_count,
                SUM(o.amount) as total_amount,
                SUM(o.shares) as total_shares,
                GROUP_CONCAT(DISTINCT o.symbol) as symbols
            FROM orders o
            WHERE o.merchant_id = :merchant_id
            AND o.status IN ('pending', 'Pending', 'queued')
            GROUP BY o.broker
        ");
        $stmt->execute([':merchant_id' => $merchant['merchant_id']]);
        $brokerGroups = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $merchantPreview = [
            'merchant_id' => $merchant['merchant_id'],
            'merchant_name' => $merchant['merchant_name'],
            'sweep_day' => $merchant['sweep_day'],
            'brokers' => [],
            'total_orders' => 0,
            'total_amount' => 0
        ];
        
        foreach ($brokerGroups as $group) {
            $merchantPreview['brokers'][] = [
                'broker' => $group['broker'] ?? 'Unknown',
                'order_count' => (int) $group['order_count'],
                'total_amount' => (float) $group['total_amount'],
                'total_shares' => (float) $group['total_shares'],
                'symbols' => $group['symbols']
            ];
            $merchantPreview['total_orders'] += (int) $group['order_count'];
            $merchantPreview['total_amount'] += (float) $group['total_amount'];
        }
        
        if ($merchantPreview['total_orders'] > 0) {
            $preview[] = $merchantPreview;
        }
    }
    
    return [
        'merchants' => $preview,
        'total_merchants' => count($preview),
        'total_orders' => array_sum(array_column($preview, 'total_orders')),
        'total_amount' => array_sum(array_column($preview, 'total_amount'))
    ];
}

/**
 * Retry failed orders from a previous batch
 */
function retryFailedOrders(PDO $conn, string $batchId): array {
    // This is a placeholder - implement based on your error tracking needs
    // You might want to store failed order IDs in sweep_log or a separate table
    
    return [
        'batch_id' => $batchId,
        'message' => 'Retry functionality - implement based on your needs',
        'orders_retried' => 0
    ];
}
