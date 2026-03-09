<?php
/**
 * pipeline-guard.php
 *
 * Reusable batch-pipeline guard functions.
 * Include this in prepare_orders.php and any other pipeline entry points.
 *
 * Key rule: A merchant cannot have a new batch approved while any order
 * from a prior batch is still in-flight (not settled/cancelled/failed).
 */

/**
 * Check whether a merchant has any in-flight orders from a prior batch.
 *
 * @param PDO    $conn
 * @param string $merchantId   Merchant to check (pass '' to check all merchants)
 * @param string $excludeBatch The new batch being approved (exclude its own orders)
 * @return array  ['blocked' => bool, 'merchants' => [...blocking merchant details]]
 */
function checkPipelineBlocked(PDO $conn, string $merchantId = '', string $excludeBatch = ''): array {
    $terminalStatuses = ['settled', 'cancelled', 'failed'];
    $placeholders     = implode(',', array_fill(0, count($terminalStatuses), '?'));

    $sql = "
        SELECT
            o.merchant_id,
            o.batch_id,
            o.status,
            COUNT(*) AS cnt,
            COALESCE(SUM(o.amount), 0) AS total
        FROM orders o
        WHERE o.status NOT IN ($placeholders)
    ";
    $params = $terminalStatuses;

    if ($merchantId !== '') {
        $sql     .= " AND o.merchant_id = ?";
        $params[] = $merchantId;
    }
    if ($excludeBatch !== '') {
        $sql     .= " AND (o.batch_id IS NULL OR o.batch_id != ?)";
        $params[] = $excludeBatch;
    }

    $sql .= " GROUP BY o.merchant_id, o.batch_id, o.status
              ORDER BY o.merchant_id, o.batch_id, FIELD(o.status,
                'approved','funded','placed','submitted','confirmed','executed','pending')";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rows)) {
        return ['blocked' => false, 'merchants' => []];
    }

    // Group by merchant → batch → statuses
    $merchants = [];
    foreach ($rows as $row) {
        $mid = $row['merchant_id'];
        $bid = $row['batch_id'] ?? 'unknown';
        if (!isset($merchants[$mid])) {
            $merchants[$mid] = ['merchant_id' => $mid, 'batches' => []];
        }
        if (!isset($merchants[$mid]['batches'][$bid])) {
            $merchants[$mid]['batches'][$bid] = ['batch_id' => $bid, 'statuses' => []];
        }
        $merchants[$mid]['batches'][$bid]['statuses'][] = [
            'status' => $row['status'],
            'count'  => (int)$row['cnt'],
            'amount' => (float)$row['total'],
        ];
    }

    // Flatten batches array
    foreach ($merchants as &$m) {
        $m['batches'] = array_values($m['batches']);
    }

    return [
        'blocked'   => true,
        'merchants' => array_values($merchants),
    ];
}

/**
 * Build a human-readable block message for the API response.
 */
function buildBlockMessage(array $guard): string {
    $parts = [];
    foreach ($guard['merchants'] as $m) {
        $mid    = $m['merchant_id'];
        $bids   = array_column($m['batches'], 'batch_id');
        $parts[] = "Merchant '{$mid}' has in-flight orders on batch(es): " . implode(', ', $bids);
    }
    return "Cannot approve: prior batch(es) still in-flight. " . implode('. ', $parts)
         . ". All orders must reach 'settled', 'cancelled', or 'failed' before a new batch can be approved.";
}
