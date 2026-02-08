<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

// api/save-order.php
header("Content-Type: application/json");

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

require_once 'config.php';

try {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    if (empty($input['order_id'])) {
        throw new Exception("Order ID is required");
    }
    
    if (empty($input['member_id'])) {
        throw new Exception("Member ID is required");
    }
    
    if (empty($input['basket_id'])) {
        throw new Exception("Basket ID is required");
    }
    
    if (empty($input['symbol'])) {
        throw new Exception("Symbol is required");
    }
    
    if (!isset($input['shares']) || $input['shares'] === '') {
        throw new Exception("Shares is required");
    }
    
    if (!isset($input['amount']) || $input['amount'] === '') {
        throw new Exception("Amount is required");
    }
    
    // Prepare values with proper null handling
    $orderId = (int)$input['order_id'];
    $memberId = $input['member_id'];
    $merchantId = !empty($input['merchant_id']) ? $input['merchant_id'] : null;
    $basketId = $input['basket_id'];
    $symbol = strtoupper($input['symbol']);
    $shares = $input['shares'];
    $amount = $input['amount'];
    $pointsUsed = isset($input['points_used']) && $input['points_used'] !== '' ? $input['points_used'] : 0.00;
    $status = !empty($input['status']) ? $input['status'] : 'pending';
    $memberTimezone = !empty($input['member_timezone']) ? $input['member_timezone'] : 'America/New_York';
    $broker = !empty($input['broker']) ? $input['broker'] : null;
    $orderType = !empty($input['order_type']) ? $input['order_type'] : 'market';
    
    // Handle executed_at (nullable timestamp)
    $executedAt = null;
    if (!empty($input['executed_at']) && $input['executed_at'] !== '0000-00-00 00:00:00') {
        $executedAt = $input['executed_at'];
    }
    
    // Handle execution fields (nullable decimals)
    $executedPrice = null;
    if (isset($input['executed_price']) && $input['executed_price'] !== '' && $input['executed_price'] !== null) {
        $executedPrice = $input['executed_price'];
    }
    
    $executedShares = null;
    if (isset($input['executed_shares']) && $input['executed_shares'] !== '' && $input['executed_shares'] !== null) {
        $executedShares = $input['executed_shares'];
    }
    
    $executedAmount = null;
    if (isset($input['executed_amount']) && $input['executed_amount'] !== '' && $input['executed_amount'] !== null) {
        $executedAmount = $input['executed_amount'];
    }
    
    // Handle paid fields
    $paidFlag = isset($input['paid_flag']) ? (int)$input['paid_flag'] : 0;
    $paidBatchId = !empty($input['paid_batch_id']) ? $input['paid_batch_id'] : null;
    
    $paidAt = null;
    if (!empty($input['paid_at']) && $input['paid_at'] !== '0000-00-00 00:00:00') {
        $paidAt = $input['paid_at'];
    }
    
    // Update statement
    $sql = "
        UPDATE orders SET
            member_id = :member_id,
            merchant_id = :merchant_id,
            basket_id = :basket_id,
            symbol = :symbol,
            shares = :shares,
            amount = :amount,
            points_used = :points_used,
            status = :status,
            member_timezone = :member_timezone,
            broker = :broker,
            order_type = :order_type,
            executed_at = :executed_at,
            executed_price = :executed_price,
            executed_shares = :executed_shares,
            executed_amount = :executed_amount,
            paid_flag = :paid_flag,
            paid_batch_id = :paid_batch_id,
            paid_at = :paid_at
        WHERE order_id = :order_id
    ";
    
    $stmt = $conn->prepare($sql);
    
    $success = $stmt->execute([
        ':member_id' => $memberId,
        ':merchant_id' => $merchantId,
        ':basket_id' => $basketId,
        ':symbol' => $symbol,
        ':shares' => $shares,
        ':amount' => $amount,
        ':points_used' => $pointsUsed,
        ':status' => $status,
        ':member_timezone' => $memberTimezone,
        ':broker' => $broker,
        ':order_type' => $orderType,
        ':executed_at' => $executedAt,
        ':executed_price' => $executedPrice,
        ':executed_shares' => $executedShares,
        ':executed_amount' => $executedAmount,
        ':paid_flag' => $paidFlag,
        ':paid_batch_id' => $paidBatchId,
        ':paid_at' => $paidAt,
        ':order_id' => $orderId
    ]);
    
    if (!$success) {
        throw new Exception("Failed to update order");
    }
    
    $affectedRows = $stmt->rowCount();
    
    // Auto-update executed_at timestamp if execution data is provided
    if ($executedPrice !== null && $executedShares !== null && $executedAmount !== null) {
        // If executed_at is still null, set it to now
        if ($executedAt === null) {
            $updateTimestamp = "UPDATE orders SET executed_at = NOW() WHERE order_id = :order_id AND executed_at IS NULL";
            $stmtTs = $conn->prepare($updateTimestamp);
            $stmtTs->execute([':order_id' => $orderId]);
        }
        
        // Also update status to 'executed' if it's still pending/placed/confirmed
        $updateStatus = "
            UPDATE orders 
            SET status = 'executed' 
            WHERE order_id = :order_id 
            AND status IN ('pending', 'Pending', 'placed', 'confirmed')
        ";
        $stmtStatus = $conn->prepare($updateStatus);
        $stmtStatus->execute([':order_id' => $orderId]);
    }
    
    // Auto-update paid_at timestamp if paid_flag is set
    if ($paidFlag === 1 && $paidAt === null) {
        $updatePaidAt = "UPDATE orders SET paid_at = NOW() WHERE order_id = :order_id AND paid_at IS NULL";
        $stmtPaid = $conn->prepare($updatePaidAt);
        $stmtPaid->execute([':order_id' => $orderId]);
    }
    
    if ($affectedRows === 0) {
        // Check if order exists
        $checkStmt = $conn->prepare("SELECT order_id FROM orders WHERE order_id = :order_id");
        $checkStmt->execute([':order_id' => $orderId]);
        
        if ($checkStmt->rowCount() === 0) {
            throw new Exception("Order not found");
        }
        
        // Order exists but no changes were made (data was identical)
        echo json_encode([
            'success' => true,
            'message' => 'No changes detected (data already up to date)',
            'order_id' => $orderId
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'message' => 'Order updated successfully',
            'order_id' => $orderId,
            'affected_rows' => $affectedRows
        ]);
    }
    
} catch (Exception $e) {
    error_log("save-order.php error: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
