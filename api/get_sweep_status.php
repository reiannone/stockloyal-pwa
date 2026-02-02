<?php
/**
 * get_sweep_status.php - Get sweep process status and history
 */

declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$action = $input['action'] ?? 'overview';
$merchantId = $input['merchant_id'] ?? null;
$limit = min((int)($input['limit'] ?? 20), 100);

try {
    switch ($action) {
        case 'overview':
            // Get overall sweep status and upcoming schedules
            $response = getSweepOverview($conn);
            break;
            
        case 'history':
            // Get sweep execution history
            $response = getSweepHistory($conn, $limit);
            break;
            
        case 'pending':
            // Get pending orders awaiting sweep
            $response = getPendingOrders($conn, $merchantId);
            break;
            
        case 'merchant_schedule':
            // Get merchant sweep schedules
            $response = getMerchantSchedules($conn);
            break;
            
        case 'batch_details':
            // Get details for a specific batch
            $batchId = $input['batch_id'] ?? null;
            if (!$batchId) {
                throw new Exception("batch_id required");
            }
            $response = getBatchDetails($conn, $batchId);
            break;
            
        default:
            throw new Exception("Unknown action: {$action}");
    }
    
    echo json_encode(['success' => true] + $response);
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

/**
 * Get sweep overview with upcoming schedules and stats
 */
function getSweepOverview(PDO $conn): array {
    $today = (int) date('j');
    $lastDayOfMonth = (int) date('t');
    
    // Get merchants scheduled for today
    $stmt = $conn->prepare("
        SELECT merchant_id, merchant_name, sweep_day
        FROM merchant 
        WHERE sweep_day IS NOT NULL 
        AND (sweep_day = :today OR (sweep_day = -1 AND :today = :last_day))
    ");
    $stmt->execute([':today' => $today, ':last_day' => $lastDayOfMonth]);
    $todayMerchants = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get pending order counts by merchant
    $stmt = $conn->query("
        SELECT 
            o.merchant_id,
            m.merchant_name,
            m.sweep_day,
            COUNT(*) as pending_orders,
            SUM(o.amount) as pending_amount,
            MIN(o.placed_at) as oldest_order
        FROM orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        WHERE o.status IN ('pending', 'Pending', 'queued')
        GROUP BY o.merchant_id, m.merchant_name, m.sweep_day
        ORDER BY pending_orders DESC
    ");
    $pendingByMerchant = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get last sweep execution
    $stmt = $conn->query("
        SELECT * FROM sweep_log 
        ORDER BY started_at DESC 
        LIMIT 1
    ");
    $lastSweep = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Get today's stats
    $stmt = $conn->prepare("
        SELECT 
            COUNT(*) as sweeps_today,
            SUM(orders_confirmed) as orders_confirmed_today,
            SUM(orders_failed) as orders_failed_today
        FROM sweep_log
        WHERE DATE(started_at) = CURDATE()
    ");
    $stmt->execute();
    $todayStats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Get upcoming sweep schedule for next 7 days
    $upcoming = [];
    for ($i = 0; $i <= 7; $i++) {
        $date = strtotime("+{$i} days");
        $dayOfMonth = (int) date('j', $date);
        $lastDay = (int) date('t', $date);
        
        $stmt = $conn->prepare("
            SELECT merchant_id, merchant_name, sweep_day
            FROM merchant 
            WHERE sweep_day IS NOT NULL 
            AND (sweep_day = :day OR (sweep_day = -1 AND :day = :last_day))
        ");
        $stmt->execute([':day' => $dayOfMonth, ':last_day' => $lastDay]);
        $merchants = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (!empty($merchants)) {
            $upcoming[] = [
                'date' => date('Y-m-d', $date),
                'day_name' => date('l', $date),
                'day_of_month' => $dayOfMonth,
                'merchants' => $merchants
            ];
        }
    }
    
    return [
        'today' => [
            'date' => date('Y-m-d'),
            'day_of_month' => $today,
            'scheduled_merchants' => $todayMerchants,
            'sweeps_run' => (int) ($todayStats['sweeps_today'] ?? 0),
            'orders_confirmed' => (int) ($todayStats['orders_confirmed_today'] ?? 0),
            'orders_failed' => (int) ($todayStats['orders_failed_today'] ?? 0)
        ],
        'pending_by_merchant' => $pendingByMerchant,
        'total_pending_orders' => array_sum(array_column($pendingByMerchant, 'pending_orders')),
        'total_pending_amount' => array_sum(array_column($pendingByMerchant, 'pending_amount')),
        'last_sweep' => $lastSweep ? [
            'batch_id' => $lastSweep['batch_id'],
            'started_at' => $lastSweep['started_at'],
            'merchants_processed' => $lastSweep['merchants_processed'],
            'orders_confirmed' => $lastSweep['orders_confirmed'],
            'orders_failed' => $lastSweep['orders_failed']
        ] : null,
        'upcoming_schedule' => $upcoming
    ];
}

/**
 * Get sweep execution history
 */
function getSweepHistory(PDO $conn, int $limit): array {
    $stmt = $conn->prepare("
        SELECT 
            batch_id,
            started_at,
            completed_at,
            TIMESTAMPDIFF(SECOND, started_at, completed_at) as duration_seconds,
            merchants_processed,
            orders_processed,
            orders_confirmed,
            orders_failed,
            brokers_notified,
            errors
        FROM sweep_log
        ORDER BY started_at DESC
        LIMIT :limit
    ");
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Parse JSON fields
    foreach ($history as &$row) {
        $row['brokers_notified'] = json_decode($row['brokers_notified'] ?? '[]', true);
        $row['errors'] = json_decode($row['errors'] ?? '[]', true);
        $row['has_errors'] = !empty($row['errors']);
    }
    
    return ['history' => $history];
}

/**
 * Get pending orders awaiting sweep
 */
function getPendingOrders(PDO $conn, ?string $merchantId = null): array {
    $sql = "
        SELECT 
            o.order_id,
            o.member_id,
            o.merchant_id,
            m.merchant_name,
            o.basket_id,
            o.symbol,
            o.shares,
            o.amount,
            o.points_used,
            o.status,
            o.placed_at,
            o.broker,
            m.sweep_day
        FROM orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        WHERE o.status IN ('pending', 'Pending', 'queued')
    ";
    
    $params = [];
    if ($merchantId) {
        $sql .= " AND o.merchant_id = :merchant_id";
        $params[':merchant_id'] = $merchantId;
    }
    
    $sql .= " ORDER BY o.placed_at ASC LIMIT 500";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    return [
        'pending_orders' => $orders,
        'count' => count($orders)
    ];
}

/**
 * Get merchant sweep schedules
 */
function getMerchantSchedules(PDO $conn): array {
    $stmt = $conn->query("
        SELECT 
            m.merchant_id,
            m.merchant_name,
            m.sweep_day,
            m.sweep_modified_at,
            (SELECT COUNT(*) FROM orders o 
             WHERE o.merchant_id = m.merchant_id 
             AND o.status IN ('pending', 'Pending', 'queued')) as pending_orders,
            (SELECT SUM(o.amount) FROM orders o 
             WHERE o.merchant_id = m.merchant_id 
             AND o.status IN ('pending', 'Pending', 'queued')) as pending_amount
        FROM merchant m
        WHERE m.sweep_day IS NOT NULL
        ORDER BY m.sweep_day ASC, m.merchant_name ASC
    ");
    
    return ['schedules' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
}

/**
 * Get details for a specific batch
 */
function getBatchDetails(PDO $conn, string $batchId): array {
    $stmt = $conn->prepare("SELECT * FROM sweep_log WHERE batch_id = :batch_id");
    $stmt->execute([':batch_id' => $batchId]);
    $batch = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$batch) {
        throw new Exception("Batch not found: {$batchId}");
    }
    
    $batch['brokers_notified'] = json_decode($batch['brokers_notified'] ?? '[]', true);
    $batch['errors'] = json_decode($batch['errors'] ?? '[]', true);
    $batch['log_data'] = json_decode($batch['log_data'] ?? '[]', true);
    
    return ['batch' => $batch];
}
