<?php
declare(strict_types=1);

/**
 * broker-receiver.php
 * 
 * Inbound webhook receiver for BROKER events
 * Handles the 3-stage order processing flow:
 *   Stage 2: order.acknowledged → status "placed"
 *   Stage 3: order.confirmed → status "confirmed"
 * 
 * Also handles:
 *   sweep.orders → acknowledges batch of orders from sweep process
 *   order.executed / order.rejected / order.cancelled
 *   order.sold → updates "sell" to "sold" (triggered by portfolio recalc)
 *   credentials.validate → simulates broker credential verification
 * 
 * Endpoint: https://api.stockloyal.com/api/broker-receiver.php
 */

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-Webhook-Signature, X-Request-Id, X-Event-Type');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

$logDir = '/var/www/html/stockloyal-pwa/logs';
$logFile = $logDir . '/broker-webhook.log';

// Ensure log directory exists
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

try {
    $host = 'stockloyal-db.ctms60ci403w.us-east-2.rds.amazonaws.com';
    $dbname = 'stockloyal';
    $username = 'admin';
    $password = 'StockLoyal2025!';
    
    $conn = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
} catch (PDOException $e) {
    error_log("broker-receiver.php: Database connection failed: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function logMessage(string $logFile, string $message): void {
    $timestamp = gmdate('Y-m-d H:i:s');
    file_put_contents($logFile, "[{$timestamp}] {$message}\n", FILE_APPEND);
}

function respond(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

function authenticateBroker(PDO $conn, string $logFile): ?array {
    // Get API key from headers (support multiple formats)
    $apiKey = $_SERVER['HTTP_X_API_KEY'] 
        ?? $_SERVER['HTTP_AUTHORIZATION'] 
        ?? null;
    
    // Strip "Bearer " prefix if present
    if ($apiKey && stripos($apiKey, 'Bearer ') === 0) {
        $apiKey = substr($apiKey, 7);
    }
    
    if (empty($apiKey)) {
        logMessage($logFile, "⚠️ AUTH FAILED: No API key provided");
        return null;
    }
    
    // Look up broker by API key (removed 'active' column reference)
    try {
        $stmt = $conn->prepare("
            SELECT broker_id, broker_name, webhook_url, api_key
            FROM broker_master
            WHERE api_key = ?
            LIMIT 1
        ");
        $stmt->execute([$apiKey]);
        $broker = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$broker) {
            logMessage($logFile, "⚠️ AUTH FAILED: Invalid API key");
            return null;
        }
        
        logMessage($logFile, "✅ Authenticated broker: {$broker['broker_name']} (ID: {$broker['broker_id']})");
        return $broker;
        
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ AUTH ERROR: " . $e->getMessage());
        return null;
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle order.acknowledged / order.placed event (Stage 2)
 * 
 * Two inbound patterns:
 *   A) Sweep engine sends order.placed with batch_id + orders[] per basket
 *      → sweep_process.php already logs the notification with response body
 *      → do NOT create a duplicate notification here
 *   B) External broker sends order.acknowledged for a single basket
 *      → log the inbound notification as before
 *
 * Both update pending → placed and return acknowledgement with timestamp.
 */
function handleOrderAcknowledged(PDO $conn, array $payload, string $logFile): array {
    $acknowledgedAt = gmdate('c');
    $isSweepOrigin  = !empty($payload['batch_id']);  // sweep engine includes batch_id
    $brokerBatchId  = 'BRK-' . date('Ymd-His') . '-' . substr(uniqid(), -4);

    // ── Grouped payload (merchant-broker sweep) ──────────────────────────
    // New format: members[] array with each member having their own basket_id
    if (!empty($payload['members']) && is_array($payload['members'])) {
        $members = $payload['members'];
        $merchantId   = $payload['merchant_id'] ?? '';
        $merchantName = $payload['merchant_name'] ?? '';
        $brokerId     = $payload['broker_id'] ?? '';
        $brokerName   = $payload['broker_name'] ?? '';

        logMessage($logFile, "Processing GROUPED order.placed: merchant={$merchantId}, broker={$brokerId}, "
                   . count($members) . " member(s), sweep_origin=" . ($isSweepOrigin ? 'yes' : 'no'));

        $totalOrdersUpdated = 0;
        $memberResults = [];

        foreach ($members as $member) {
            $memberId  = strtolower(trim((string)($member['member_id'] ?? '')));
            $basketId  = $member['basket_id'] ?? '';
            $brokerageId = $member['brokerage_id'] ?? '';

            if (empty($basketId)) {
                logMessage($logFile, "⚠️ Skipping member {$memberId} — no basket_id");
                continue;
            }

            // Update orders from "pending"/"queued" to "placed"
            $stmt = $conn->prepare("
                UPDATE orders 
                SET status = 'placed',
                    placed_at = NOW()
                WHERE basket_id = ?
                  AND LOWER(status) IN ('pending','queued')
            ");
            $stmt->execute([$basketId]);
            $rowsUpdated = $stmt->rowCount();
            $totalOrdersUpdated += $rowsUpdated;

            // Fetch actual order rows for this basket
            $detailStmt = $conn->prepare("
                SELECT order_id, symbol, shares, amount, points_used, status, order_type
                FROM   orders
                WHERE  basket_id = ?
                ORDER  BY order_id ASC
            ");
            $detailStmt->execute([$basketId]);
            $orderRows = $detailStmt->fetchAll(PDO::FETCH_ASSOC);

            logMessage($logFile, "  ✅ Member {$memberId}: basket={$basketId}, {$rowsUpdated} updated, " . count($orderRows) . " total orders");

            $memberResults[] = [
                'member_id'    => $memberId,
                'brokerage_id' => $brokerageId,
                'basket_id'    => $basketId,
                'orders_received' => count($orderRows),
                'orders_updated'  => $rowsUpdated,
                'orders'          => $orderRows,
                'new_status'      => 'placed',
            ];
        }

        // Log notification for NON-sweep requests only
        if (!$isSweepOrigin) {
            try {
                $notifStmt = $conn->prepare("
                    INSERT INTO broker_notifications 
                    (broker_id, broker_name, event_type, status, member_id, basket_id, payload, sent_at)
                    VALUES (?, ?, 'order.acknowledged', 'received', ?, ?, ?, NOW())
                ");
                $notifStmt->execute([
                    $brokerId,
                    $brokerName,
                    'grouped',  // multiple members
                    $payload['batch_id'] ?? null,
                    json_encode([
                        'broker_batch_id' => $brokerBatchId,
                        'acknowledged_at' => $acknowledgedAt,
                        'merchant_id'     => $merchantId,
                        'member_count'    => count($memberResults),
                        'total_orders'    => $totalOrdersUpdated,
                    ])
                ]);
            } catch (PDOException $e) {
                logMessage($logFile, "⚠️ Failed to log notification: " . $e->getMessage());
            }
        } else {
            logMessage($logFile, "ℹ️ Sweep-origin — skipping duplicate notification (sweep_process logs it)");
        }

        logMessage($logFile, "✅ Acknowledged grouped batch → broker_batch_id={$brokerBatchId}, "
                   . count($memberResults) . " member(s), {$totalOrdersUpdated} orders updated");

        return [
            'event'            => 'order.acknowledged',
            'acknowledged'     => true,
            'acknowledged_at'  => $acknowledgedAt,
            'broker_batch_id'  => $brokerBatchId,
            'merchant_id'      => $merchantId,
            'merchant_name'    => $merchantName,
            'broker_id'        => $brokerId,
            'broker_name'      => $brokerName,
            'member_count'     => count($memberResults),
            'total_orders'     => $totalOrdersUpdated,
            'members'          => $memberResults,
            'new_status'       => 'placed',
            'message'          => $totalOrdersUpdated . ' order(s) across ' . count($memberResults) . ' member(s) acknowledged for processing',
        ];
    }

    // ── Legacy single-basket payload ─────────────────────────────────────
    $basketId  = $payload['basket_id'] ?? '';
    $memberId  = strtolower(trim((string)($payload['member_id'] ?? '')));

    if (empty($basketId)) {
        throw new Exception('Missing basket_id');
    }

    logMessage($logFile, "Processing order.placed/acknowledged: basket_id={$basketId}, "
               . "member_id={$memberId}, sweep_origin=" . ($isSweepOrigin ? 'yes' : 'no'));

    // Update orders from "pending"/"queued" to "placed"
    $stmt = $conn->prepare("
        UPDATE orders 
        SET status = 'placed',
            placed_at = NOW()
        WHERE basket_id = ?
          AND LOWER(status) IN ('pending','queued')
    ");
    $stmt->execute([$basketId]);
    $rowsUpdated = $stmt->rowCount();

    logMessage($logFile, "✅ Updated {$rowsUpdated} orders to 'placed'");

    // Fetch actual order rows for this basket
    $detailStmt = $conn->prepare("
        SELECT order_id, symbol, shares, amount, points_used, status, order_type
        FROM   orders
        WHERE  basket_id = ?
        ORDER  BY order_id ASC
    ");
    $detailStmt->execute([$basketId]);
    $orderRows = $detailStmt->fetchAll(PDO::FETCH_ASSOC);

    // Log notification for NON-sweep requests only
    if (!$isSweepOrigin) {
        try {
            $notifStmt = $conn->prepare("
                INSERT INTO broker_notifications 
                (broker_id, broker_name, event_type, status, member_id, basket_id, payload, sent_at)
                VALUES (?, ?, 'order.acknowledged', 'received', ?, ?, ?, NOW())
            ");
            $notifStmt->execute([
                $payload['broker_id'] ?? null,
                $payload['broker_name'] ?? null,
                $memberId,
                $basketId,
                json_encode([
                    'broker_batch_id'  => $brokerBatchId,
                    'acknowledged_at'  => $acknowledgedAt,
                    'orders_received'  => count($orderRows),
                    'orders_in_basket' => $orderRows,
                ])
            ]);
        } catch (PDOException $e) {
            logMessage($logFile, "⚠️ Failed to log notification: " . $e->getMessage());
        }
    } else {
        logMessage($logFile, "ℹ️ Sweep-origin — skipping duplicate notification (sweep_process logs it)");
    }

    logMessage($logFile, "✅ Acknowledged basket {$basketId} → broker_batch_id={$brokerBatchId}");

    return [
        'event'            => 'order.acknowledged',
        'acknowledged'     => true,
        'acknowledged_at'  => $acknowledgedAt,
        'broker_batch_id'  => $brokerBatchId,
        'basket_id'        => $basketId,
        'member_id'        => $memberId,
        'orders_received'  => count($orderRows),
        'orders'           => $orderRows,
        'new_status'       => 'placed',
        'message'          => count($orderRows) . ' order(s) acknowledged for processing',
    ];
}

/**
 * Handle order.confirmed event (Stage 3)
 * Updates order status from "placed" to "confirmed" with execution details
 */
function handleOrderConfirmed(PDO $conn, array $payload, string $logFile): array {
    $basketId       = $payload['basket_id'] ?? '';
    $memberId       = strtolower(trim((string)($payload['member_id'] ?? '')));
    $brokerOrderId  = $payload['broker_order_id'] ?? null;
    $fills          = $payload['fills'] ?? [];

    if (empty($basketId)) {
        throw new Exception('Missing basket_id');
    }

    logMessage($logFile, "Processing order.confirmed: basket_id={$basketId}, member_id={$memberId}, fills=" . count($fills));

    $ordersUpdated = 0;

    // If fills provided, update individual orders with execution prices
    if (!empty($fills)) {
        foreach ($fills as $fill) {
            $symbol     = $fill['symbol'] ?? '';
            $execPrice  = $fill['executed_price']  ?? $fill['price']  ?? null;
            $execShares = $fill['executed_shares']  ?? $fill['shares'] ?? null;
            $execAmount = $fill['executed_amount']  ?? null;

            if (empty($symbol)) continue;

            $stmt = $conn->prepare("
                UPDATE orders
                SET    status          = 'confirmed',
                       executed_price  = COALESCE(?, executed_price),
                       executed_shares = COALESCE(?, executed_shares),
                       executed_amount = COALESCE(?, executed_amount),
                       executed_at     = NOW()
                WHERE  basket_id = ?
                  AND  symbol = ?
                  AND  LOWER(status) = 'placed'
            ");
            $stmt->execute([$execPrice, $execShares, $execAmount, $basketId, $symbol]);
            $ordersUpdated += $stmt->rowCount();
        }
    } else {
        // No fills — just update status for entire basket
        $stmt = $conn->prepare("
            UPDATE orders
            SET    status = 'confirmed',
                   executed_at = NOW()
            WHERE  basket_id = ?
              AND  LOWER(status) = 'placed'
        ");
        $stmt->execute([$basketId]);
        $ordersUpdated = $stmt->rowCount();
    }

    logMessage($logFile, "✅ Updated {$ordersUpdated} orders to 'confirmed'");

    return [
        'event'          => 'order.confirmed',
        'basket_id'      => $basketId,
        'orders_updated' => $ordersUpdated,
        'new_status'     => 'confirmed',
    ];
}

/**
 * Handle order.executed event
 * Final execution details with fills
 */
function handleOrderExecuted(PDO $conn, array $payload, string $logFile): array {
    $basketId = $payload['basket_id'] ?? '';
    $memberId = strtolower(trim((string)($payload['member_id'] ?? '')));
    $fills = $payload['fills'] ?? [];
    
    if (empty($basketId)) {
        throw new Exception('Missing basket_id');
    }
    
    logMessage($logFile, "Processing order.executed: basket_id={$basketId}, fills=" . count($fills));
    
    $ordersUpdated = 0;
    
    // Update individual orders with execution details if provided
    foreach ($fills as $fill) {
        $symbol        = $fill['symbol'] ?? '';
        $executedShares = $fill['shares'] ?? $fill['executed_shares'] ?? null;
        $executedPrice  = $fill['price']  ?? $fill['executed_price']  ?? null;
        $executedAmount = $fill['amount'] ?? $fill['executed_amount'] ?? null;
        
        if (empty($symbol)) continue;
        
        $stmt = $conn->prepare("
            UPDATE orders 
            SET status          = 'executed',
                executed_shares = COALESCE(?, executed_shares),
                executed_price  = COALESCE(?, executed_price),
                executed_amount = COALESCE(?, executed_amount),
                executed_at     = NOW()
            WHERE basket_id = ?
              AND symbol = ?
              AND LOWER(status) IN ('placed', 'confirmed')
        ");
        $stmt->execute([$executedShares, $executedPrice, $executedAmount, $basketId, $symbol]);
        $ordersUpdated += $stmt->rowCount();
    }
    
    // If no individual fills, update all orders in basket
    if (empty($fills)) {
        $stmt = $conn->prepare("
            UPDATE orders 
            SET status = 'executed',
                executed_at = NOW()
            WHERE basket_id = ?
              AND LOWER(status) IN ('placed', 'confirmed')
        ");
        $stmt->execute([$basketId]);
        $ordersUpdated = $stmt->rowCount();
    }
    
    logMessage($logFile, "✅ Updated {$ordersUpdated} orders to 'executed'");
    
    return [
        'event' => 'order.executed',
        'basket_id' => $basketId,
        'orders_updated' => $ordersUpdated,
        'new_status' => 'executed'
    ];
}

/**
 * Handle order.rejected event
 * Broker rejected the order — maps to 'failed' status
 */
function handleOrderRejected(PDO $conn, array $payload, string $logFile): array {
    $basketId = $payload['basket_id'] ?? '';
    $memberId = strtolower(trim((string)($payload['member_id'] ?? '')));
    $reason = $payload['reason'] ?? 'Unknown reason';
    
    if (empty($basketId)) {
        throw new Exception('Missing basket_id');
    }
    
    logMessage($logFile, "Processing order.rejected: basket_id={$basketId}, reason={$reason}");
    
    // 'rejected' is not in status enum — use 'failed'
    $stmt = $conn->prepare("
        UPDATE orders 
        SET status = 'failed'
        WHERE basket_id = ?
          AND LOWER(status) IN ('pending', 'placed')
    ");
    $stmt->execute([$basketId]);
    $rowsUpdated = $stmt->rowCount();
    
    logMessage($logFile, "⚠️ Rejected/failed {$rowsUpdated} orders: {$reason}");
    
    // Log rejection reason to broker_notifications for audit
    try {
        $stmt = $conn->prepare("
            INSERT INTO broker_notifications
                (broker_id, broker_name, event_type, status, member_id, basket_id, payload, sent_at)
            VALUES (?, ?, 'order.rejected', 'received', ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $payload['broker_id'] ?? null,
            $payload['broker_name'] ?? null,
            $memberId,
            $basketId,
            json_encode(['reason' => $reason, 'orders_failed' => $rowsUpdated]),
        ]);
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ notification log: " . $e->getMessage());
    }
    
    return [
        'event' => 'order.rejected',
        'basket_id' => $basketId,
        'orders_updated' => $rowsUpdated,
        'new_status' => 'failed',
        'reason' => $reason
    ];
}

/**
 * Handle order.cancelled event
 */
function handleOrderCancelled(PDO $conn, array $payload, string $logFile): array {
    $basketId = $payload['basket_id'] ?? '';
    $memberId = strtolower(trim((string)($payload['member_id'] ?? '')));
    $reason = $payload['reason'] ?? 'Cancelled by broker';
    
    if (empty($basketId)) {
        throw new Exception('Missing basket_id');
    }
    
    logMessage($logFile, "Processing order.cancelled: basket_id={$basketId}, reason={$reason}");
    
    $stmt = $conn->prepare("
        UPDATE orders 
        SET status = 'cancelled'
        WHERE basket_id = ?
          AND LOWER(status) IN ('pending', 'placed', 'queued')
    ");
    $stmt->execute([$basketId]);
    $rowsUpdated = $stmt->rowCount();
    
    logMessage($logFile, "✅ Cancelled {$rowsUpdated} orders");
    
    // Log cancellation reason to broker_notifications for audit
    try {
        $stmt = $conn->prepare("
            INSERT INTO broker_notifications
                (broker_id, broker_name, event_type, status, member_id, basket_id, payload, sent_at)
            VALUES (?, ?, 'order.cancelled', 'received', ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $payload['broker_id'] ?? null,
            $payload['broker_name'] ?? null,
            $memberId,
            $basketId,
            json_encode(['reason' => $reason, 'orders_cancelled' => $rowsUpdated]),
        ]);
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ notification log: " . $e->getMessage());
    }
    
    logMessage($logFile, "✅ Cancelled {$rowsUpdated} orders");
    
    return [
        'event' => 'order.cancelled',
        'basket_id' => $basketId,
        'orders_updated' => $rowsUpdated,
        'new_status' => 'cancelled'
    ];
}

/**
 * Handle order.sold event
 * Broker completed sell — updates status from "sell" to "sold"
 * Triggered by update-portfolio-value.php when it detects orders marked as "sell"
 */
function handleOrderSold(PDO $conn, array $payload, string $logFile): array {
    $memberId = strtolower(trim((string)($payload['member_id'] ?? '')));
    $orderIds = $payload['order_ids'] ?? [];

    if (empty($memberId)) {
        throw new Exception('Missing member_id');
    }

    logMessage($logFile, "Processing order.sold: member_id={$memberId}, order_ids=" . count($orderIds));

    $ordersUpdated = 0;

    if (!empty($orderIds)) {
        // Update specific order IDs from "sell" to "sold"
        $placeholders = implode(",", array_fill(0, count($orderIds), "?"));
        $params = array_merge($orderIds, [$memberId]);
        $stmt = $conn->prepare("
            UPDATE orders
            SET status = 'sold',
                executed_at = NOW()
            WHERE order_id IN ($placeholders)
              AND member_id = ?
              AND status = 'sell'
        ");
        $stmt->execute($params);
        $ordersUpdated = $stmt->rowCount();
    } else {
        // Update ALL "sell" orders for this member
        $stmt = $conn->prepare("
            UPDATE orders
            SET status = 'sold',
                executed_at = NOW()
            WHERE member_id = ?
              AND status = 'sell'
        ");
        $stmt->execute([$memberId]);
        $ordersUpdated = $stmt->rowCount();
    }

    logMessage($logFile, "✅ Updated {$ordersUpdated} orders from 'sell' to 'sold'");

    // Log to broker_notifications for audit trail
    try {
        $notifStmt = $conn->prepare("
            INSERT INTO broker_notifications
            (broker_id, broker_name, event_type, status, member_id, basket_id, payload, sent_at)
            VALUES (?, ?, 'order.sold', 'received', ?, ?, ?, NOW())
        ");
        $notifStmt->execute([
            $payload['broker_id'] ?? 'system',
            $payload['broker_name'] ?? 'StockLoyal Internal',
            $memberId,
            null,
            json_encode([
                'orders_sold' => $ordersUpdated,
                'order_ids'   => $orderIds,
                'source'      => $payload['source'] ?? 'update-portfolio-value',
            ])
        ]);
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ notification log: " . $e->getMessage());
    }

    return [
        'event'          => 'order.sold',
        'member_id'      => $memberId,
        'orders_updated' => $ordersUpdated,
        'new_status'     => 'sold',
    ];
}

/**
 * Handle credentials.validate event
 * Simulates broker credential validation.
 * 
 * Current simulation rules:
 *   - If username === password → REJECTED (test case for bad credentials)
 *   - All other combinations  → APPROVED (simulated success)
 * 
 * Returns: validated (bool), message, reason (if rejected)
 */
function handleCredentialsValidate(PDO $conn, array $payload, string $logFile): array {
    $memberId = strtolower(trim((string)($payload['member_id'] ?? '')));
    $brokerId = $payload['broker_id'] ?? $payload['broker'] ?? '';
    $username = $payload['username'] ?? '';
    $password = $payload['password'] ?? '';

    if (empty($memberId) || empty($username) || empty($password)) {
        throw new Exception('Missing required fields: member_id, username, password');
    }

    logMessage($logFile, "Processing credentials.validate: member_id={$memberId}, broker={$brokerId}, username={$username}");

    // ── Simulation logic ──────────────────────────────────────────────────
    // Test case: username === password → rejection
    $isRejected = ($username === $password);

    if ($isRejected) {
        logMessage($logFile, "❌ Credentials REJECTED for {$memberId} (test case: username matches password)");

        // Log rejection to broker_notifications
        try {
            $stmt = $conn->prepare("
                INSERT INTO broker_notifications
                (broker_id, broker_name, event_type, status, member_id, basket_id, payload, sent_at)
                VALUES (?, ?, 'credentials.validate', 'rejected', ?, NULL, ?, NOW())
            ");
            $stmt->execute([
                $brokerId,
                $payload['broker_name'] ?? null,
                $memberId,
                json_encode([
                    'username' => $username,
                    'result'   => 'rejected',
                    'reason'   => 'Invalid credentials',
                ])
            ]);
        } catch (PDOException $e) {
            logMessage($logFile, "⚠️ notification log: " . $e->getMessage());
        }

        return [
            'event'     => 'credentials.validate',
            'validated' => false,
            'message'   => 'The broker could not verify your credentials. Please check your username and password and try again.',
            'reason'    => 'invalid_credentials',
        ];
    }

    // ── Approved (simulated) ──────────────────────────────────────────────
    logMessage($logFile, "✅ Credentials APPROVED for {$memberId} at broker {$brokerId}");

    try {
        $stmt = $conn->prepare("
            INSERT INTO broker_notifications
            (broker_id, broker_name, event_type, status, member_id, basket_id, payload, sent_at)
            VALUES (?, ?, 'credentials.validate', 'approved', ?, NULL, ?, NOW())
        ");
        $stmt->execute([
            $brokerId,
            $payload['broker_name'] ?? null,
            $memberId,
            json_encode([
                'username' => $username,
                'result'   => 'approved',
            ])
        ]);
    } catch (PDOException $e) {
        logMessage($logFile, "⚠️ notification log: " . $e->getMessage());
    }

    return [
        'event'     => 'credentials.validate',
        'validated' => true,
        'message'   => 'Your broker credentials have been verified successfully.',
    ];
}

/**
 * Handle test.connection event
 */
function handleTestConnection(array $payload, string $logFile): array {
    logMessage($logFile, "✅ Test connection received");
    
    return [
        'event' => 'test.connection',
        'message' => 'Broker webhook connection successful',
        'echo' => $payload['echo'] ?? null
    ];
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

try {
    // Get raw payload
    $rawPayload = file_get_contents('php://input');
    $sourceIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    
    logMessage($logFile, str_repeat('=', 80));
    logMessage($logFile, "Inbound BROKER webhook from {$sourceIp}");
    logMessage($logFile, "Payload: {$rawPayload}");
    
    // Parse JSON
    $payload = json_decode($rawPayload, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON: ' . json_last_error_msg());
    }
    
    // Get event type (support multiple formats)
    $eventType = $payload['event_type'] 
        ?? $payload['event'] 
        ?? $_SERVER['HTTP_X_EVENT_TYPE'] 
        ?? '';
    
    $requestId = $payload['request_id'] 
        ?? $_SERVER['HTTP_X_REQUEST_ID'] 
        ?? uniqid('brk_', true);
    
    logMessage($logFile, "Event: {$eventType}, Request ID: {$requestId}");
    
    // Authenticate broker (optional for test events)
    $broker = null;
    if ($eventType !== 'test.connection' && $eventType !== 'test') {
        $broker = authenticateBroker($conn, $logFile);
        // Note: Not enforcing auth for now to allow easier integration
        // Uncomment below to require authentication:
        // if (!$broker) {
        //     respond(['success' => false, 'error' => 'Authentication failed'], 401);
        // }
    }
    
    // Add broker info to payload if authenticated
    if ($broker) {
        $payload['broker_id'] = $broker['broker_id'];
        $payload['broker_name'] = $broker['broker_name'];
    }
    
    // Log to webhook_logs table (without 'source' column that may not exist)
    try {
        $stmt = $conn->prepare("
            INSERT INTO webhook_logs 
            (request_id, event_type, source_ip, payload, received_at)
            VALUES (?, ?, ?, ?, NOW())
        ");
        $stmt->execute([$requestId, $eventType, $sourceIp, $rawPayload]);
    } catch (PDOException $e) {
        // Table might not exist or have different schema - continue anyway
        logMessage($logFile, "⚠️ webhook_logs insert failed: " . $e->getMessage());
    }
    
    // Route to appropriate handler
    // Note: 'order_placed' and 'order.placed' are treated as Stage 2 (acknowledge) - pending → placed
    $result = match($eventType) {
        'order.acknowledged', 'order_acknowledged', 'order_placed', 'order.placed' => handleOrderAcknowledged($conn, $payload, $logFile),
        'order.confirmed', 'order_confirmed' => handleOrderConfirmed($conn, $payload, $logFile),
        'order.executed', 'order_executed' => handleOrderExecuted($conn, $payload, $logFile),
        'order.rejected', 'order_rejected' => handleOrderRejected($conn, $payload, $logFile),
        'order.cancelled', 'order_cancelled' => handleOrderCancelled($conn, $payload, $logFile),
        'order.sold', 'order_sold' => handleOrderSold($conn, $payload, $logFile),
        'credentials.validate', 'credentials_validate' => handleCredentialsValidate($conn, $payload, $logFile),
        'sweep.orders', 'sweep_orders' => handleOrderAcknowledged($conn, $payload, $logFile),
        'test.connection', 'test' => handleTestConnection($payload, $logFile),
        default => [
            'event' => $eventType,
            'message' => 'Event type not handled',
            'supported_events' => [
                'order_placed',
                'order.acknowledged',
                'order.confirmed', 
                'order.executed',
                'order.rejected',
                'order.cancelled',
                'order.sold',
                'credentials.validate',
                'sweep.orders',
                'test.connection'
            ]
        ]
    };
    
    logMessage($logFile, "Response: " . json_encode($result));
    logMessage($logFile, str_repeat('-', 80));
    
    respond(array_merge([
        'success' => true,
        'request_id' => $requestId,
        'timestamp' => gmdate('c')
    ], $result));

} catch (Exception $e) {
    logMessage($logFile, "❌ ERROR: " . $e->getMessage());
    logMessage($logFile, str_repeat('-', 80));
    
    respond([
        'success' => false,
        'error' => $e->getMessage(),
        'request_id' => $requestId ?? uniqid('err_', true)
    ], 400);
}
