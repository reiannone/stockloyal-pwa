<?php
/**
 * ADD THIS to prepare_orders.php — in the 'approve' action block.
 *
 * Place this BEFORE the INSERT into orders / status update logic,
 * right after you resolve the $batchId from the request.
 *
 * Assumes pipeline-guard.php is in the same directory.
 */

require_once __DIR__ . '/pipeline-guard.php';

// --- inside the 'approve' case ---

// 1. Get the merchant(s) in this batch
$batchMerchants = $conn->prepare(
    "SELECT DISTINCT merchant_id FROM prepared_orders WHERE batch_id = ?"
);
$batchMerchants->execute([$batchId]);
$merchantIds = $batchMerchants->fetchAll(PDO::FETCH_COLUMN);

// 2. For each merchant in this batch, check for in-flight orders from prior batches
foreach ($merchantIds as $mid) {
    $guard = checkPipelineBlocked($conn, $mid, $batchId);
    if ($guard['blocked']) {
        echo json_encode([
            'success' => false,
            'blocked' => true,
            'error'   => buildBlockMessage($guard),
            'details' => $guard['merchants'],
        ]);
        exit;
    }
}

// 3. All clear — proceed with approval logic as normal
// ... your existing approve code continues here ...
