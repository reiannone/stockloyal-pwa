<?php
/**
 * alpaca-webhook.php
 * ============================================================================
 * Receives Alpaca Broker API trade event webhooks.
 *
 * Alpaca sends events like:
 *   trade_updates: { event: "fill", order: { id, symbol, filled_qty, filled_avg_price, ... } }
 *
 * This updates orders from "submitted" → "confirmed" with fill data,
 * and updates the cron_exec_orders table for monitoring.
 *
 * WEBHOOK URL (configure in Alpaca dashboard):
 *   https://api.stockloyal.com/alpaca-webhook.php
 * ============================================================================
 */

header("Content-Type: application/json");
require_once __DIR__ . '/db.php';

// ── Parse incoming webhook ───────────────────────────────────────────────────

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

// Log all incoming webhooks for debugging
$logFile = '/var/log/stockloyal/alpaca-webhooks.log';
$ts = date('Y-m-d H:i:s');
@file_put_contents($logFile, "[{$ts}] " . $raw . "\n", FILE_APPEND);

if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Alpaca sends trade_updates with an "event" field
$event      = $data['event'] ?? $data['data']['event'] ?? null;
$orderData  = $data['order'] ?? $data['data']['order'] ?? $data['data'] ?? null;

if (!$event || !$orderData) {
    // Not a trade event — acknowledge anyway
    http_response_code(200);
    echo json_encode(['status' => 'ignored', 'reason' => 'not a trade event']);
    exit;
}

$alpacaOrderId  = $orderData['id'] ?? null;
$symbol         = $orderData['symbol'] ?? null;
$alpacaStatus   = $orderData['status'] ?? $event;

// ── Handle events ────────────────────────────────────────────────────────────

try {
    switch ($event) {

        case 'fill':
        case 'partial_fill':
            $filledQty   = floatval($orderData['filled_qty'] ?? 0);
            $filledPrice = floatval($orderData['filled_avg_price'] ?? 0);
            $filledAmt   = $filledQty * $filledPrice;
            $isFull      = ($event === 'fill');

            log_webhook("FILL ({$event}): alpaca_order={$alpacaOrderId} symbol={$symbol} " .
                        "qty={$filledQty} price={$filledPrice}");

            // Update our orders table
            if ($alpacaOrderId) {
                $newStatus = $isFull ? 'confirmed' : 'submitted'; // partial stays submitted

                $stmt = $pdo->prepare("
                    UPDATE orders
                    SET status = ?,
                        executed_price = ?,
                        executed_shares = ?,
                        executed_amount = ?,
                        executed_at = NOW(),
                        confirmed_at = IF(? = 'confirmed', NOW(), confirmed_at),
                        broker_ref = ?
                    WHERE broker_order_id = ?
                ");
                $stmt->execute([
                    $newStatus, $filledPrice, $filledQty, $filledAmt,
                    $newStatus, $alpacaStatus, $alpacaOrderId
                ]);

                $rowsAffected = $stmt->rowCount();
                log_webhook("  → Updated {$rowsAffected} order(s) to status={$newStatus}");

                // Update cron_exec_orders for monitoring
                $pdo->prepare("
                    UPDATE cron_exec_orders
                    SET alpaca_status = ?,
                        filled_price = ?,
                        filled_qty = ?,
                        filled_amount = ?,
                        filled_at = NOW()
                    WHERE alpaca_order_id = ?
                ")->execute([$alpacaStatus, $filledPrice, $filledQty, $filledAmt, $alpacaOrderId]);

                // Update the parent cron_exec_log filled counter
                $pdo->prepare("
                    UPDATE cron_exec_log cel
                    SET cel.orders_filled = (
                        SELECT COUNT(*) FROM cron_exec_orders ceo
                        WHERE ceo.run_id = cel.run_id AND ceo.filled_at IS NOT NULL
                    )
                    WHERE cel.run_id = (
                        SELECT ceo2.run_id FROM cron_exec_orders ceo2
                        WHERE ceo2.alpaca_order_id = ? LIMIT 1
                    )
                ")->execute([$alpacaOrderId]);
            }
            break;


        case 'canceled':
        case 'rejected':
        case 'expired':
            log_webhook("ORDER {$event}: alpaca_order={$alpacaOrderId} symbol={$symbol}");

            if ($alpacaOrderId) {
                $pdo->prepare("
                    UPDATE orders
                    SET status = 'failed',
                        error_message = ?,
                        fail_reason = ?,
                        broker_ref = ?
                    WHERE broker_order_id = ?
                ")->execute(["Alpaca: {$event}", "alpaca_{$event}", $alpacaStatus, $alpacaOrderId]);

                $pdo->prepare("
                    UPDATE cron_exec_orders
                    SET alpaca_status = ?,
                        submit_status = 'rejected',
                        submit_error = ?
                    WHERE alpaca_order_id = ?
                ")->execute([$alpacaStatus, "Alpaca: {$event}", $alpacaOrderId]);
            }
            break;


        case 'new':
        case 'accepted':
        case 'pending_new':
            // Informational — just update broker_ref status
            log_webhook("ORDER {$event}: alpaca_order={$alpacaOrderId}");

            if ($alpacaOrderId) {
                $pdo->prepare("
                    UPDATE orders SET broker_ref = ? WHERE broker_order_id = ?
                ")->execute([$alpacaStatus, $alpacaOrderId]);

                $pdo->prepare("
                    UPDATE cron_exec_orders SET alpaca_status = ? WHERE alpaca_order_id = ?
                ")->execute([$alpacaStatus, $alpacaOrderId]);
            }
            break;


        default:
            log_webhook("UNKNOWN EVENT: {$event} — acknowledging");
    }

    // Always acknowledge
    http_response_code(200);
    echo json_encode(['status' => 'ok', 'event' => $event]);

} catch (Exception $e) {
    log_webhook("ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function log_webhook(string $msg): void {
    $ts = date('Y-m-d H:i:s');
    $logFile = '/var/log/stockloyal/alpaca-webhooks.log';
    @file_put_contents($logFile, "[{$ts}] {$msg}\n", FILE_APPEND);
}
