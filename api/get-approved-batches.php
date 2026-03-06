<?php
declare(strict_types=1);

/**
 * get-approved-batches.php
 *
 * Returns payment batches where merchant funding has been collected (paid_flag=1).
 * At this stage orders are 'funded' — sweep account has been pre-funded,
 * ready for Alpaca journal transfers to individual member accounts (Stage 3).
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
    $limit  = isset($input['limit'])  ? min(100, max(1, (int)$input['limit']))  : 25;
    $offset = isset($input['offset']) ? max(0, (int)$input['offset']) : 0;

    // ── Main query: batches where merchant funding was collected ──
    // Orders are 'funded' at this stage (sweep account pre-funded, pending journal to member accounts)
    $sql = "
        SELECT
            paid_batch_id                           AS batch_id,
            merchant_id,
            broker,
            COUNT(*)                                AS order_count,
            SUM(COALESCE(executed_amount, amount))  AS total_amount,
            MIN(paid_at)                            AS paid_at,
            MAX(paid_at)                            AS paid_at_max,
            -- Show the most advanced status in this batch for context
            MAX(CASE
                WHEN status = 'settled'   THEN 5
                WHEN status = 'placed'    THEN 4
                WHEN status = 'funded'    THEN 3
                WHEN status = 'approved'  THEN 2
                ELSE 1
            END) AS status_rank
        FROM orders
        WHERE paid_flag = 1
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
        LIMIT {$limit} OFFSET {$offset}
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $batches = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── Total count for pagination ──
    $countSql = "
        SELECT COUNT(DISTINCT paid_batch_id) AS total
        FROM orders
        WHERE paid_flag = 1
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

    // ── Status label from rank ──
    $statusLabel = function(int $rank): string {
        return match($rank) {
            5 => 'settled',
            4 => 'placed',
            3 => 'funded',
            2 => 'approved',
            default => 'unknown',
        };
    };

    $formattedBatches = array_map(function($batch) use ($statusLabel) {
        return [
            'batch_id'     => $batch['batch_id'],
            'merchant_id'  => $batch['merchant_id'],
            'broker'       => $batch['broker'],
            'order_count'  => (int)   $batch['order_count'],
            'total_amount' => (float) $batch['total_amount'],
            'paid_at'      => $batch['paid_at'],
            'status'       => $statusLabel((int)$batch['status_rank']),
        ];
    }, $batches);

    echo json_encode([
        'success'  => true,
        'batches'  => $formattedBatches,
        'count'    => count($formattedBatches),
        'total'    => $totalCount,
        'offset'   => $offset,
        'limit'    => $limit,
        'has_more' => ($offset + count($formattedBatches)) < $totalCount,
    ], JSON_NUMERIC_CHECK);

} catch (Throwable $e) {
    error_log("[get-approved-batches] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Failed to load payment batches: ' . $e->getMessage(),
    ]);
}
