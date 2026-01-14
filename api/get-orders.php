<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

// api/get-orders.php
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

require_once 'config.php';

try {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!is_array($input)) {
        $input = [];
    }
    
    // Build the WHERE clause based on filters
    $whereClauses = [];
    $params = [];
    
    // Filter by member_id
    if (!empty($input['member_id'])) {
        $whereClauses[] = "member_id = :member_id";
        $params[':member_id'] = $input['member_id'];
    }
    
    // Filter by order_id
    if (!empty($input['order_id'])) {
        $whereClauses[] = "order_id = :order_id";
        $params[':order_id'] = (int)$input['order_id'];
    }
    
    // Filter by array of order_ids (for Data Quality)
    if (!empty($input['order_ids']) && is_array($input['order_ids'])) {
        $orderIds = array_map('intval', $input['order_ids']);
        if (count($orderIds) > 0) {
            $placeholders = [];
            foreach ($orderIds as $idx => $orderId) {
                $key = ":order_id_$idx";
                $placeholders[] = $key;
                $params[$key] = $orderId;
            }
            $whereClauses[] = "order_id IN (" . implode(',', $placeholders) . ")";
        }
    }
    
    // Filter by symbol
    if (!empty($input['symbol'])) {
        $whereClauses[] = "symbol = :symbol";
        $params[':symbol'] = strtoupper($input['symbol']);
    }
    
    // Filter by basket_id
    if (!empty($input['basket_id'])) {
        $whereClauses[] = "basket_id = :basket_id";
        $params[':basket_id'] = $input['basket_id'];
    }
    
    // Filter by status
    if (!empty($input['status'])) {
        $whereClauses[] = "status = :status";
        $params[':status'] = $input['status'];
    }
    
    // Filter by merchant_id
    if (!empty($input['merchant_id'])) {
        $whereClauses[] = "merchant_id = :merchant_id";
        $params[':merchant_id'] = $input['merchant_id'];
    }
    
    // Filter by broker
    if (!empty($input['broker'])) {
        $whereClauses[] = "broker = :broker";
        $params[':broker'] = $input['broker'];
    }
    
    // Date range filter
    if (!empty($input['date_start']) && !empty($input['date_end'])) {
        $whereClauses[] = "placed_at >= :date_start AND placed_at < :date_end";
        $params[':date_start'] = $input['date_start'];
        $params[':date_end'] = $input['date_end'];
    }
    
    // Build the final WHERE clause
    $whereSQL = '';
    if (count($whereClauses) > 0) {
        $whereSQL = 'WHERE ' . implode(' AND ', $whereClauses);
    }
    
    // Sorting
    $sortBy = $input['sort_by'] ?? 'placed_at';
    $sortDir = strtoupper($input['sort_dir'] ?? 'DESC');
    
    // Validate sort direction
    if (!in_array($sortDir, ['ASC', 'DESC'])) {
        $sortDir = 'DESC';
    }
    
    // Validate sort field (prevent SQL injection)
    $allowedSortFields = [
        'order_id', 'member_id', 'merchant_id', 'symbol', 'shares', 
        'amount', 'status', 'placed_at', 'executed_at', 'broker'
    ];
    if (!in_array($sortBy, $allowedSortFields)) {
        $sortBy = 'placed_at';
    }
    
    // Limit
    $limit = isset($input['limit']) ? min((int)$input['limit'], 500) : 200;
    
    // Build final query - LIMIT must be added directly, not as bound parameter
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
        $whereSQL
        ORDER BY $sortBy $sortDir
        LIMIT $limit
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Cast numeric fields
    foreach ($orders as &$order) {
        if (isset($order['shares'])) {
            $order['shares'] = (float)$order['shares'];
        }
        if (isset($order['amount'])) {
            $order['amount'] = (float)$order['amount'];
        }
        if (isset($order['points_used'])) {
            $order['points_used'] = (float)$order['points_used'];
        }
        if (isset($order['executed_price'])) {
            $order['executed_price'] = $order['executed_price'] ? (float)$order['executed_price'] : null;
        }
        if (isset($order['executed_shares'])) {
            $order['executed_shares'] = $order['executed_shares'] ? (float)$order['executed_shares'] : null;
        }
        if (isset($order['executed_amount'])) {
            $order['executed_amount'] = $order['executed_amount'] ? (float)$order['executed_amount'] : null;
        }
        if (isset($order['paid_flag'])) {
            $order['paid_flag'] = (int)$order['paid_flag'];
        }
    }
    
    error_log("get-orders.php: Successfully fetched " . count($orders) . " orders");
    
    echo json_encode([
        'success' => true,
        'orders' => $orders,
        'count' => count($orders)
    ]);
    
} catch (Exception $e) {
    error_log("get-orders.php error: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
