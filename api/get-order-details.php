<?php
// get-order-details.php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db.php';
require_once 'order-helpers.php';

try {
    $conn = getDbConnection();
    
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (empty($input['order_id'])) {
        throw new Exception("Order ID is required");
    }
    
    $orderId = (int)$input['order_id'];
    
    // Get order with member and merchant details
    $order = getOrderDetails($orderId, $conn);
    
    if (!$order) {
        throw new Exception("Order not found");
    }
    
    // Get member stats if we have a member_id
    $memberStats = null;
    if (!empty($order['member_id'])) {
        $memberStats = getMemberOrderStats($order['member_id'], $conn);
    }
    
    // Get basket totals if we have a basket_id
    $basketTotals = null;
    if (!empty($order['basket_id'])) {
        $basketTotals = calculateBasketTotals($order['basket_id'], $conn);
    }
    
    // Get symbol stats
    $symbolStats = null;
    if (!empty($order['symbol'])) {
        $symbolStats = getSymbolStats($order['symbol'], $conn);
    }
    
    $conn->close();
    
    echo json_encode([
        'success' => true,
        'order' => $order,
        'member_stats' => $memberStats,
        'basket_totals' => $basketTotals,
        'symbol_stats' => $symbolStats
    ]);
    
} catch (Exception $e) {
    error_log("get-order-details.php error: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
