<?php
// bulk-update-orders.php
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
    
    if (empty($input['action'])) {
        throw new Exception("Action is required");
    }
    
    $action = $input['action'];
    
    switch ($action) {
        case 'mark_paid':
            // Mark multiple orders as paid
            if (empty($input['order_ids']) || !is_array($input['order_ids'])) {
                throw new Exception("order_ids array is required");
            }
            
            $batchId = $input['batch_id'] ?? 'BATCH_' . date('YmdHis');
            $affectedRows = markOrdersAsPaid($input['order_ids'], $batchId, $conn);
            
            $conn->close();
            
            echo json_encode([
                'success' => true,
                'message' => "Marked $affectedRows orders as paid",
                'batch_id' => $batchId,
                'affected_rows' => $affectedRows
            ]);
            break;
            
        case 'update_status':
            // Update status for multiple orders
            if (empty($input['order_ids']) || !is_array($input['order_ids'])) {
                throw new Exception("order_ids array is required");
            }
            
            if (empty($input['status'])) {
                throw new Exception("status is required");
            }
            
            $status = $input['status'];
            $orderIds = $input['order_ids'];
            
            // Validate status
            $validStatuses = ['pending', 'placed', 'confirmed', 'executed', 'failed', 'cancelled'];
            if (!in_array($status, $validStatuses)) {
                throw new Exception("Invalid status: $status");
            }
            
            // Build placeholders
            $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
            
            $sql = "
                UPDATE orders
                SET status = ?
                WHERE order_id IN ($placeholders)
            ";
            
            $stmt = $conn->prepare($sql);
            
            // Build params
            $types = 's';
            $params = [$status];
            foreach ($orderIds as $orderId) {
                $types .= 'i';
                $params[] = (int)$orderId;
            }
            
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $affectedRows = $stmt->affected_rows;
            $stmt->close();
            $conn->close();
            
            echo json_encode([
                'success' => true,
                'message' => "Updated status for $affectedRows orders",
                'affected_rows' => $affectedRows
            ]);
            break;
            
        case 'update_broker':
            // Update broker for multiple orders
            if (empty($input['order_ids']) || !is_array($input['order_ids'])) {
                throw new Exception("order_ids array is required");
            }
            
            if (empty($input['broker'])) {
                throw new Exception("broker is required");
            }
            
            $broker = $input['broker'];
            $orderIds = $input['order_ids'];
            
            // Build placeholders
            $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
            
            $sql = "
                UPDATE orders
                SET broker = ?
                WHERE order_id IN ($placeholders)
            ";
            
            $stmt = $conn->prepare($sql);
            
            // Build params
            $types = 's';
            $params = [$broker];
            foreach ($orderIds as $orderId) {
                $types .= 'i';
                $params[] = (int)$orderId;
            }
            
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $affectedRows = $stmt->affected_rows;
            $stmt->close();
            $conn->close();
            
            echo json_encode([
                'success' => true,
                'message' => "Updated broker for $affectedRows orders",
                'affected_rows' => $affectedRows
            ]);
            break;
            
        case 'cancel_orders':
            // Cancel multiple orders (only if not executed or paid)
            if (empty($input['order_ids']) || !is_array($input['order_ids'])) {
                throw new Exception("order_ids array is required");
            }
            
            $orderIds = $input['order_ids'];
            
            // Build placeholders
            $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
            
            $sql = "
                UPDATE orders
                SET status = 'cancelled'
                WHERE order_id IN ($placeholders)
                AND status NOT IN ('executed', 'cancelled')
                AND paid_flag = 0
            ";
            
            $stmt = $conn->prepare($sql);
            
            // Build params
            $types = '';
            $params = [];
            foreach ($orderIds as $orderId) {
                $types .= 'i';
                $params[] = (int)$orderId;
            }
            
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $affectedRows = $stmt->affected_rows;
            $stmt->close();
            $conn->close();
            
            echo json_encode([
                'success' => true,
                'message' => "Cancelled $affectedRows orders",
                'affected_rows' => $affectedRows
            ]);
            break;
            
        default:
            throw new Exception("Unknown action: $action");
    }
    
} catch (Exception $e) {
    error_log("bulk-update-orders.php error: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
