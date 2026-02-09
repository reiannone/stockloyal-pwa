<?php
declare(strict_types=1);

/**
 * get-settled-batches.php
 *
 * Returns a list of settled payment batches for the payment history view.
 * Supports pagination with offset for infinite scroll.
 *
 * Input (JSON POST):
 * {
 *   "merchant_id": "merchant001",  // optional - filter by merchant
 *   "limit": 25,                   // optional - max results (default 25)
 *   "offset": 0                    // optional - offset for pagination (default 0)
 * }
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $raw = file_get_contents('php://input');
    $input = $raw ? json_decode($raw, true) : [];
    
    $merchantId = isset($input['merchant_id']) ? trim((string)$input['merchant_id']) : '';
    
    // Cast to int and concatenate directly to avoid PDO quoting issues with LIMIT/OFFSET
    $limit = isset($input['limit']) ? min(100, max(1, (int)$input['limit'])) : 25;
    $offset = isset($input['offset']) ? max(0, (int)$input['offset']) : 0;

    // Build query to get settled batches grouped by paid_batch_id
    $sql = "
        SELECT 
            paid_batch_id AS batch_id,
            merchant_id,
            broker,
            COUNT(*) AS order_count,
            SUM(COALESCE(executed_amount, amount)) AS total_amount,
            MIN(paid_at) AS paid_at,
            MAX(paid_at) AS paid_at_max
        FROM orders
        WHERE status = 'settled'
          AND paid_flag = 1
          AND paid_batch_id IS NOT NULL
    ";
    
    $params = [];
    
    if ($merchantId !== '') {
        $sql .= " AND merchant_id = ?";
        $params[] = $merchantId;
    }
    
    $sql .= "
        GROUP BY paid_batch_id, merchant_id, broker
        ORDER BY paid_at DESC
        LIMIT " . $limit . " OFFSET " . $offset;

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $batches = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get total count for pagination info
    $countSql = "
        SELECT COUNT(DISTINCT paid_batch_id) AS total
        FROM orders
        WHERE status = 'settled'
          AND paid_flag = 1
          AND paid_batch_id IS NOT NULL
    ";
    if ($merchantId !== '') {
        $countSql .= " AND merchant_id = ?";
        $countStmt = $conn->prepare($countSql);
        $countStmt->execute([$merchantId]);
    } else {
        $countStmt = $conn->query($countSql);
    }
    $totalCount = (int)$countStmt->fetchColumn();

    // Format the results
    $formattedBatches = array_map(function($batch) {
        return [
            'batch_id' => $batch['batch_id'],
            'merchant_id' => $batch['merchant_id'],
            'broker' => $batch['broker'],
            'order_count' => (int)$batch['order_count'],
            'total_amount' => (float)$batch['total_amount'],
            'paid_at' => $batch['paid_at'],
        ];
    }, $batches);

    echo json_encode([
        'success' => true,
        'batches' => $formattedBatches,
        'count' => count($formattedBatches),
        'total' => $totalCount,
        'offset' => $offset,
        'limit' => $limit,
        'has_more' => ($offset + count($formattedBatches)) < $totalCount
    ], JSON_NUMERIC_CHECK);

} catch (Throwable $e) {
    error_log("[get-settled-batches] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to load settled batches: ' . $e->getMessage()
    ]);
}
