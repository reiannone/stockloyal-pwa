<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/PlaidClient.php';

// plaid-webhook.php — Handle Plaid Transfer webhook events.
// POST (from Plaid) or POST { action: "sync" } for manual sync.

header('Content-Type: application/json');

try {
    $body = file_get_contents('php://input');
    $input = json_decode($body, true) ?? [];

    // Manual sync trigger from admin
    if (($input['action'] ?? '') === 'sync') {
        $results = syncTransferEvents($conn);
        echo json_encode(['success' => true, 'events_processed' => $results]);
        exit;
    }

    // Plaid webhook
    $webhook_type = $input['webhook_type'] ?? '';
    $webhook_code = $input['webhook_code'] ?? '';

    error_log("[plaid-webhook] Received: type={$webhook_type} code={$webhook_code}");

    if ($webhook_type === 'TRANSFER') {
        $results = syncTransferEvents($conn);
        echo json_encode(['success' => true, 'events_processed' => $results]);
        exit;
    }

    // Acknowledge unknown webhook types gracefully
    echo json_encode(['success' => true, 'message' => 'Webhook received, no action taken']);

} catch (Throwable $ex) {
    error_log("[plaid-webhook] Error: " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}

// ── Sync all new transfer events from Plaid ──

function syncTransferEvents(PDO $conn): array {
    $plaid = new PlaidClient();

    // Get our last synced event ID
    $stmt = $conn->query("SELECT COALESCE(MAX(event_id), 0) as max_id FROM plaid_events");
    $after_id = (int) $stmt->fetch(PDO::FETCH_ASSOC)['max_id'];

    $total_processed = 0;
    $statuses_updated = [];
    $has_more = true;

    while ($has_more) {
        $response = $plaid->syncTransferEvents([
            'after_id' => $after_id,
            'count'    => 25,
        ]);

        $events = $response['transfer_events'] ?? [];

        foreach ($events as $event) {
            // Store event (ignore duplicates)
            $stmt = $conn->prepare("
                INSERT IGNORE INTO plaid_events
                    (event_id, transfer_id, event_type, amount, failure_reason, timestamp, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $event['event_id'],
                $event['transfer_id'],
                $event['event_type'],
                $event['amount'] ?? null,
                isset($event['failure_reason']) ? ($event['failure_reason']['description'] ?? json_encode($event['failure_reason'])) : null,
                $event['timestamp'] ?? date('Y-m-d H:i:s'),
                json_encode($event),
            ]);

            // Update transfer status
            $status_result = updateTransferStatus($conn, $event);
            if ($status_result) {
                $statuses_updated[] = $status_result;
            }

            $after_id = $event['event_id'];
            $total_processed++;
        }

        $has_more = !empty($events) && ($response['has_more'] ?? false);
    }

    return [
        'events_synced'    => $total_processed,
        'statuses_updated' => $statuses_updated,
        'last_event_id'    => $after_id,
    ];
}

function updateTransferStatus(PDO $conn, array $event): ?array {
    $transfer_id = $event['transfer_id'];
    $new_status  = $event['event_type']; // pending, posted, settled, failed, returned, cancelled

    // Update plaid_transfers
    $updates = [
        'status'     => $new_status,
        'updated_at' => date('Y-m-d H:i:s'),
    ];

    if ($new_status === 'settled') {
        $updates['settled_at'] = $event['timestamp'] ?? date('Y-m-d H:i:s');
    }

    if (in_array($new_status, ['failed', 'returned'])) {
        $updates['failure_reason'] = isset($event['failure_reason'])
            ? ($event['failure_reason']['description'] ?? json_encode($event['failure_reason']))
            : null;
        $updates['return_code'] = $event['failure_reason']['ach_return_code'] ?? null;
    }

    $set_clauses = implode(', ', array_map(fn($k) => "{$k} = ?", array_keys($updates)));
    $stmt = $conn->prepare("UPDATE plaid_transfers SET {$set_clauses} WHERE transfer_id = ?");
    $stmt->execute([...array_values($updates), $transfer_id]);

    if ($stmt->rowCount() === 0) {
        return null; // Transfer not in our DB (shouldn't happen)
    }

    // Fetch the transfer record for batch/order updates
    $stmt = $conn->prepare("SELECT * FROM plaid_transfers WHERE transfer_id = ?");
    $stmt->execute([$transfer_id]);
    $pt = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$pt) return null;

    $result = [
        'transfer_id' => $transfer_id,
        'new_status'  => $new_status,
        'merchant_id' => $pt['merchant_id'],
        'amount'      => $pt['amount'],
    ];

    // ── Update linked orders based on new status ──

    if ($new_status === 'settled') {
        // Orders are now funded and settled — ready for broker execution
        $order_ids = json_decode($pt['order_ids'] ?? '[]', true);
        if (!empty($order_ids)) {
            $placeholders = implode(',', array_fill(0, count($order_ids), '?'));
            $stmt = $conn->prepare("
                UPDATE orders SET status = 'funded', paid_flag = 1, paid_at = NOW()
                WHERE order_id IN ({$placeholders}) AND status IN ('approved', 'pending')
            ");
            $stmt->execute($order_ids);
            $result['orders_funded'] = $stmt->rowCount();
        }

        // Update batch if linked
        if ($pt['batch_id']) {
            $stmt = $conn->prepare("
                UPDATE prepare_batches SET status = 'submitted', submitted_at = NOW()
                WHERE batch_id = ? AND status != 'submitted'
            ");
            $stmt->execute([$pt['batch_id']]);
        }
    }

    if (in_array($new_status, ['failed', 'returned'])) {
        // Revert orders back to approved so admin can retry
        $order_ids = json_decode($pt['order_ids'] ?? '[]', true);
        if (!empty($order_ids)) {
            $placeholders = implode(',', array_fill(0, count($order_ids), '?'));
            $stmt = $conn->prepare("
                UPDATE orders SET status = 'approved', paid_flag = 0, paid_at = NULL
                WHERE order_id IN ({$placeholders}) AND status = 'funded'
            ");
            $stmt->execute($order_ids);
            $result['orders_reverted'] = $stmt->rowCount();
        }

        $reason = $updates['failure_reason'] ?? 'Transfer failed';
        $result['failure_reason'] = $reason;
        error_log("[plaid-webhook] Transfer {$transfer_id} {$new_status}: {$reason}");
    }

    return $result;
}
