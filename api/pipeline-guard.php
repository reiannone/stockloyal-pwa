<?php
/**
 * pipeline-guard.php
 *
 * Reusable pipeline blocking checks.
 *
 * Usage (anywhere in the pipeline):
 *   require_once __DIR__ . '/pipeline-guard.php';
 *
 *   $guard = checkPipelineBlocked($conn, $merchantId, $excludeBatchId);
 *   if ($guard['blocked']) {
 *       echo json_encode([
 *           'success' => false,
 *           'blocked' => true,
 *           'error'   => buildBlockMessage($guard),
 *           'details' => $guard['merchants'],
 *       ]);
 *       exit;
 *   }
 *
 * Functions:
 *   checkPipelineBlocked(PDO, merchantId, excludeBatchId) → array
 *   buildBlockMessage(guard)                              → string
 *   checkCycleOpen(PDO, merchantRecordId, brokerId)       → array
 */

// ---------------------------------------------------------------------------

/**
 * Check whether a merchant has in-flight orders from a prior batch
 * that would block opening a new cycle or approving a new batch.
 *
 * Works with both:
 *   - merchant.merchant_id  VARCHAR  (used by orders table)
 *   - merchant.record_id    INT      (used by pipeline_cycles)
 *
 * @param PDO         $conn             DB connection ($pdo or $conn — same object)
 * @param int|string  $merchantId       merchant.merchant_id VARCHAR  OR  record_id INT
 * @param string|null $excludeBatchId   Batch currently being approved/opened — excluded
 *                                      from the in-flight check so self-approval works.
 *
 * @return array {
 *   blocked:          bool
 *   inflight_count:   int     total in-flight orders across all blocking batches
 *   inflight_batches: string[] batch IDs that are still in flight
 *   merchants:        array   one row per blocking merchant/batch with detail
 * }
 */
function checkPipelineBlocked(PDO $conn, $merchantId, ?string $excludeBatchId = null): array
{
    // Determine if $merchantId is the VARCHAR merchant_id or the INT record_id,
    // then resolve to the VARCHAR merchant_id used in the orders table.
    if (is_int($merchantId) || (is_string($merchantId) && ctype_digit($merchantId))) {
        $resolve = $conn->prepare(
            "SELECT merchant_id FROM merchant WHERE record_id = ? LIMIT 1"
        );
        $resolve->execute([(int)$merchantId]);
        $row = $resolve->fetch(PDO::FETCH_ASSOC);
        $merchantCode = $row ? $row['merchant_id'] : (string)$merchantId;
    } else {
        $merchantCode = (string)$merchantId;
    }

    // Build the optional batch exclusion clause
    $excludeClause = '';
    $params        = [$merchantCode];
    if ($excludeBatchId !== null && $excludeBatchId !== '') {
        $excludeClause = ' AND o.batch_id != ?';
        $params[]      = $excludeBatchId;
    }

    // Query orders table for any in-flight orders belonging to this merchant
    // in a batch other than the one being approved/opened.
    $stmt = $conn->prepare("
        SELECT
            o.batch_id,
            o.merchant_id,
            COUNT(*)                            AS inflight_count,
            GROUP_CONCAT(DISTINCT o.status)     AS statuses
        FROM orders o
        WHERE o.merchant_id   = ?
          AND o.status        IN ('approved','funded','placed','submitted','confirmed','executed')
          AND o.batch_id      IS NOT NULL
          AND o.batch_id      != ''
          {$excludeClause}
        GROUP BY o.batch_id, o.merchant_id
        ORDER BY o.batch_id
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rows)) {
        return [
            'blocked'          => false,
            'inflight_count'   => 0,
            'inflight_batches' => [],
            'merchants'        => [],
        ];
    }

    $inflightBatches = array_column($rows, 'batch_id');
    $inflightCount   = (int)array_sum(array_column($rows, 'inflight_count'));

    return [
        'blocked'          => true,
        'inflight_count'   => $inflightCount,
        'inflight_batches' => $inflightBatches,
        'merchants'        => $rows,   // full detail for UI / logging
    ];
}

// ---------------------------------------------------------------------------

/**
 * Build a human-readable block message from a checkPipelineBlocked() result.
 *
 * @param array $guard  Return value of checkPipelineBlocked()
 * @return string
 */
function buildBlockMessage(array $guard): string
{
    if (!$guard['blocked']) {
        return 'No pipeline block.';
    }

    $batches = implode(', ', $guard['inflight_batches']);
    $count   = $guard['inflight_count'];

    return "Pipeline blocked: {$count} in-flight order(s) must settle before a new cycle "
         . "can be opened. Blocking batch(es): {$batches}. "
         . "To override, pass force=true in the request.";
}

// ---------------------------------------------------------------------------

/**
 * Check whether an open pipeline cycle already exists for a merchant-broker pair.
 * Separate from checkPipelineBlocked() — this operates on pipeline_cycles, not orders.
 *
 * @param PDO    $conn
 * @param int    $merchantRecordId   merchant.record_id
 * @param string $brokerId           broker_master.broker_id
 *
 * @return array {
 *   open:     bool
 *   cycle_id: int|null
 *   label:    string|null
 *   opened_at: string|null
 * }
 */
function checkCycleOpen(PDO $conn, int $merchantRecordId, string $brokerId): array
{
    $stmt = $conn->prepare("
        SELECT id, cycle_label, created_at
        FROM   pipeline_cycles
        WHERE  merchant_record_id = ?
          AND  broker_id          = ?
          AND  status             = 'open'
        LIMIT 1
    ");
    $stmt->execute([$merchantRecordId, $brokerId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        return ['open' => false, 'cycle_id' => null, 'label' => null, 'opened_at' => null];
    }

    return [
        'open'      => true,
        'cycle_id'  => (int)$row['id'],
        'label'     => $row['cycle_label'],
        'opened_at' => $row['created_at'],
    ];
}
