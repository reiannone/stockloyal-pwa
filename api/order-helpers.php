<?php
// order-helpers.php
// Helper functions for order management

/**
 * Validate order status transitions
 * Some status changes should not be allowed
 */
function validateOrderStatusTransition($currentStatus, $newStatus) {
    // Define allowed transitions
    $allowedTransitions = [
        'pending' => ['placed', 'confirmed', 'failed', 'cancelled'],
        'Pending' => ['placed', 'confirmed', 'failed', 'cancelled'],
        'placed' => ['confirmed', 'executed', 'failed', 'cancelled'],
        'confirmed' => ['executed', 'failed', 'cancelled'],
        'executed' => [], // Cannot change from executed
        'failed' => ['pending', 'placed'], // Can retry
        'cancelled' => [] // Cannot change from cancelled
    ];
    
    // If status hasn't changed, it's valid
    if ($currentStatus === $newStatus) {
        return true;
    }
    
    // Check if transition is allowed
    if (isset($allowedTransitions[$currentStatus])) {
        return in_array($newStatus, $allowedTransitions[$currentStatus]);
    }
    
    return false;
}

/**
 * Validate order execution data consistency
 * executed_amount should equal executed_shares * executed_price
 */
function validateExecutionData($executedShares, $executedPrice, $executedAmount) {
    if ($executedShares === null || $executedPrice === null || $executedAmount === null) {
        // If any are null, validation passes (incomplete data is ok)
        return true;
    }
    
    $calculatedAmount = $executedShares * $executedPrice;
    $difference = abs($calculatedAmount - $executedAmount);
    
    // Allow for small floating point differences (within 1 cent)
    return $difference < 0.01;
}

/**
 * Check if order has been paid
 */
function isOrderPaid($orderId, $conn) {
    $stmt = $conn->prepare("SELECT paid_flag FROM orders WHERE order_id = ?");
    $stmt->bind_param('i', $orderId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();
    
    return $row && (int)$row['paid_flag'] === 1;
}

/**
 * Get order with member and merchant details
 */
function getOrderDetails($orderId, $conn) {
    $sql = "
        SELECT 
            o.*,
            w.member_email,
            w.member_first_name,
            w.member_last_name,
            m.merchant_name,
            m.merchant_email
        FROM orders o
        LEFT JOIN wallet w ON o.member_id = w.member_id
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        WHERE o.order_id = ?
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $orderId);
    $stmt->execute();
    $result = $stmt->get_result();
    $order = $result->fetch_assoc();
    $stmt->close();
    
    return $order;
}

/**
 * Get orders by basket_id
 */
function getOrdersByBasket($basketId, $conn) {
    $sql = "
        SELECT 
            o.*,
            w.member_email,
            w.member_first_name,
            w.member_last_name
        FROM orders o
        LEFT JOIN wallet w ON o.member_id = w.member_id
        WHERE o.basket_id = ?
        ORDER BY o.placed_at DESC
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $basketId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $orders = [];
    while ($row = $result->fetch_assoc()) {
        $orders[] = $row;
    }
    
    $stmt->close();
    return $orders;
}

/**
 * Calculate basket totals
 */
function calculateBasketTotals($basketId, $conn) {
    $sql = "
        SELECT 
            COUNT(*) as order_count,
            SUM(shares) as total_shares,
            SUM(amount) as total_amount,
            SUM(points_used) as total_points,
            SUM(CASE WHEN executed_amount IS NOT NULL THEN executed_amount ELSE 0 END) as total_executed,
            SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed_count,
            SUM(CASE WHEN paid_flag = 1 THEN 1 ELSE 0 END) as paid_count
        FROM orders
        WHERE basket_id = ?
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $basketId);
    $stmt->execute();
    $result = $stmt->get_result();
    $totals = $result->fetch_assoc();
    $stmt->close();
    
    return $totals;
}

/**
 * Get order statistics by member
 */
function getMemberOrderStats($memberId, $conn) {
    $sql = "
        SELECT 
            COUNT(*) as total_orders,
            SUM(amount) as total_invested,
            SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed_count,
            SUM(CASE WHEN status = 'pending' OR status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
            COUNT(DISTINCT symbol) as unique_symbols,
            COUNT(DISTINCT broker) as brokers_used
        FROM orders
        WHERE member_id = ?
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $memberId);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats = $result->fetch_assoc();
    $stmt->close();
    
    return $stats;
}

/**
 * Get recent orders for a member
 */
function getRecentOrders($memberId, $limit = 10, $conn) {
    $sql = "
        SELECT *
        FROM orders
        WHERE member_id = ?
        ORDER BY placed_at DESC
        LIMIT ?
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('si', $memberId, $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $orders = [];
    while ($row = $result->fetch_assoc()) {
        $orders[] = $row;
    }
    
    $stmt->close();
    return $orders;
}

/**
 * Check if member has pending orders
 */
function hasPendingOrders($memberId, $conn) {
    $sql = "
        SELECT COUNT(*) as pending_count
        FROM orders
        WHERE member_id = ?
        AND status IN ('pending', 'Pending', 'placed', 'confirmed')
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $memberId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();
    
    return (int)$row['pending_count'] > 0;
}

/**
 * Get unpaid executed orders
 */
function getUnpaidExecutedOrders($conn, $limit = 100) {
    $sql = "
        SELECT 
            o.*,
            w.member_email,
            w.member_first_name,
            w.member_last_name
        FROM orders o
        LEFT JOIN wallet w ON o.member_id = w.member_id
        WHERE o.status = 'executed'
        AND o.paid_flag = 0
        ORDER BY o.executed_at ASC
        LIMIT ?
    ";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $orders = [];
    while ($row = $result->fetch_assoc()) {
        $orders[] = $row;
    }
    
    $stmt->close();
    return $orders;
}

/**
 * Mark orders as paid in batch
 */
function markOrdersAsPaid($orderIds, $batchId, $conn) {
    if (empty($orderIds)) {
        return 0;
    }
    
    // Build placeholders for IN clause
    $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
    
    $sql = "
        UPDATE orders
        SET paid_flag = 1,
            paid_batch_id = ?,
            paid_at = NOW()
        WHERE order_id IN ($placeholders)
        AND paid_flag = 0
    ";
    
    $stmt = $conn->prepare($sql);
    
    // Build type string and params array
    $types = 's'; // for batch_id
    $params = [$batchId];
    
    foreach ($orderIds as $orderId) {
        $types .= 'i';
        $params[] = $orderId;
    }
    
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $affectedRows = $stmt->affected_rows;
    $stmt->close();
    
    return $affectedRows;
}

/**
 * Get orders by symbol with stats
 */
function getOrdersBySymbol($symbol, $conn, $limit = 50) {
    $sql = "
        SELECT 
            o.*,
            w.member_email,
            w.member_first_name,
            w.member_last_name
        FROM orders o
        LEFT JOIN wallet w ON o.member_id = w.member_id
        WHERE o.symbol = ?
        ORDER BY o.placed_at DESC
        LIMIT ?
    ";
    
    $stmt = $conn->prepare($sql);
    $symbol = strtoupper($symbol);
    $stmt->bind_param('si', $symbol, $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $orders = [];
    while ($row = $result->fetch_assoc()) {
        $orders[] = $row;
    }
    
    $stmt->close();
    return $orders;
}

/**
 * Get symbol statistics across all orders
 */
function getSymbolStats($symbol, $conn) {
    $sql = "
        SELECT 
            COUNT(*) as order_count,
            SUM(shares) as total_shares,
            SUM(amount) as total_amount,
            AVG(executed_price) as avg_price,
            MIN(executed_price) as min_price,
            MAX(executed_price) as max_price,
            SUM(CASE WHEN status = 'executed' THEN shares ELSE 0 END) as executed_shares,
            COUNT(DISTINCT member_id) as unique_members
        FROM orders
        WHERE symbol = ?
    ";
    
    $stmt = $conn->prepare($sql);
    $symbol = strtoupper($symbol);
    $stmt->bind_param('s', $symbol);
    $stmt->execute();
    $result = $stmt->get_result();
    $stats = $result->fetch_assoc();
    $stmt->close();
    
    return $stats;
}
?>
