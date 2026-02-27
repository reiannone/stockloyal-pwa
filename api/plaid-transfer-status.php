<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/PlaidClient.php';

// plaid-transfer-status.php — Check transfer status or list recent transfers.
// POST { transfer_id } or POST { merchant_id, limit? } or POST { action: "list" }

header('Content-Type: application/json');

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $transfer_id = trim($input['transfer_id'] ?? '');
    $merchant_id = trim($input['merchant_id'] ?? '');
    $action      = trim($input['action'] ?? '');
    $limit       = max(1, min(100, intval($input['limit'] ?? 20)));

    // ── Single transfer lookup ──
    if ($transfer_id !== '') {
        // Check local DB first
        $stmt = $conn->prepare("
            SELECT pt.*, mp.institution_name, mp.account_mask
            FROM plaid_transfers pt
            LEFT JOIN merchant_plaid mp ON mp.merchant_id = pt.merchant_id
            WHERE pt.transfer_id = ?
        ");
        $stmt->execute([$transfer_id]);
        $local = $stmt->fetch(PDO::FETCH_ASSOC);

        // Also check Plaid API for real-time status
        $plaid = new PlaidClient();
        try {
            $plaid_result = $plaid->getTransfer($transfer_id);
            $plaid_status = $plaid_result['transfer']['status'] ?? null;

            // Sync if Plaid status is newer than local
            if ($local && $plaid_status && $plaid_status !== $local['status']) {
                $stmt = $conn->prepare("UPDATE plaid_transfers SET status = ?, updated_at = NOW() WHERE transfer_id = ?");
                $stmt->execute([$plaid_status, $transfer_id]);
                $local['status'] = $plaid_status;
                $local['status_synced'] = true;
            }
        } catch (Throwable $e) {
            // Non-fatal — use local data
            error_log("[plaid-transfer-status] Plaid API check failed: " . $e->getMessage());
        }

        if (!$local) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Transfer not found']);
            exit;
        }

        // Get related events
        $stmt = $conn->prepare("
            SELECT event_id, event_type, amount, failure_reason, timestamp
            FROM plaid_events
            WHERE transfer_id = ?
            ORDER BY event_id ASC
        ");
        $stmt->execute([$transfer_id]);
        $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $local['events'] = $events;

        echo json_encode(['success' => true, 'transfer' => $local]);
        exit;
    }

    // ── List transfers ──
    if ($merchant_id !== '') {
        $stmt = $conn->prepare("
            SELECT pt.*, mp.institution_name, mp.account_mask
            FROM plaid_transfers pt
            LEFT JOIN merchant_plaid mp ON mp.merchant_id = pt.merchant_id
            WHERE pt.merchant_id = ?
            ORDER BY pt.created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$merchant_id, $limit]);
    } else {
        $stmt = $conn->prepare("
            SELECT pt.*, mp.institution_name, mp.account_mask
            FROM plaid_transfers pt
            LEFT JOIN merchant_plaid mp ON mp.merchant_id = pt.merchant_id
            ORDER BY pt.created_at DESC
            LIMIT ?
        ");
        $stmt->execute([$limit]);
    }

    $transfers = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success'   => true,
        'transfers' => $transfers,
        'count'     => count($transfers),
    ]);

} catch (Throwable $ex) {
    error_log("[plaid-transfer-status] " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}
