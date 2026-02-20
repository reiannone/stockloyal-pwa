<?php
declare(strict_types=1);

/**
 * get-lineage.php — Trace the full lifecycle chain for any pipeline ID
 *
 * VERIFIED SCHEMA (2026-02-19):
 *
 *   prepare_batches: batch_id(PK), status, filter_merchant, filter_member,
 *     total_members, total_orders, total_amount, total_points, members_skipped,
 *     created_at, approved_at, submitted_at, discarded_at, notes
 *
 *   prepared_orders: id, batch_id(FK→prepare_batches), basket_id, member_id,
 *     merchant_id, symbol, amount, price, shares, points_used, broker,
 *     member_timezone, member_tier, conversion_rate, sweep_percentage, status, created_at
 *
 *   orders: order_id(PK), member_id, merchant_id, basket_id, batch_id,
 *     symbol, shares, amount, points_used, status, placed_at, member_timezone,
 *     broker, order_type, executed_at, executed_price, executed_shares,
 *     executed_amount, paid_flag, paid_batch_id, paid_at, broker_order_id,
 *     updated_at, confirmed_at
 *
 *   sweep_log: id, batch_id(UNI), started_at, completed_at,
 *     merchants_processed, orders_processed, orders_confirmed, orders_failed,
 *     brokers_notified(JSON), errors(JSON), log_data(JSON), created_at
 *
 *   broker_notifications: id, created_at, sent_at, broker_id, broker_name,
 *     event_type, status, member_id, merchant_id, basket_id,
 *     payload(JSON), response_code, response_body(JSON), error_message
 *     — payload JSON may contain: batch_id(SWP), exec_id(EXEC), fills[], etc.
 *     — response_body JSON may contain: broker_batch_id(BKR), acknowledged_at, etc.
 *
 *   csv_files: file_id, merchant_id, broker, filename, relative_path,
 *     file_size, file_type, created_at
 *
 * CHAIN: prepare_batches → prepared_orders → orders(batch_id=BATCH-...)
 *        → sweep_log(SWP-...) → broker_notifications → orders.paid_batch_id(ACH_...)
 *
 * Supported input types:
 *   basket  — basket_id from orders
 *   order   — order_id (numeric)
 *   batch   — batch_id: PREP-... (prepare_batches) or BATCH-... (orders)
 *   sweep   — batch_id from sweep_log (SWP-...)
 *   broker  — broker_ref from broker_notifications response_body JSON (BKR-...)
 *   exec    — exec_id from broker_notifications payload JSON (EXEC-...)
 *   ach     — paid_batch_id from orders (ACH_...)
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $id    = trim($input['id'] ?? '');
    $type  = strtolower(trim($input['type'] ?? ''));

    if (!$id || !$type) {
        echo json_encode(['success' => false, 'error' => 'Missing id or type']);
        exit;
    }

    $lineage = buildLineage($conn, $id, $type);
    echo json_encode(['success' => true, 'lineage' => $lineage]);

} catch (Exception $e) {
    error_log("[get-lineage] " . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

// =========================================================================
// Core lineage builder
// =========================================================================

function buildLineage(PDO $conn, string $id, string $type): array {
    $lineage = [
        'prep'     => null,   // prepare_batches row
        'staged'   => [],     // prepared_orders summary
        'baskets'  => [],     // order basket groups
        'orders'   => [],     // individual orders
        'sweep'    => null,   // sweep_log row
        'brokers'  => [],     // broker placement notifications
        'execs'    => [],     // broker execution notifications
        'ach'      => [],     // payment batches
        'origin'   => ['id' => $id, 'type' => $type],
    ];

    switch ($type) {
        case 'order':   lineageFromOrder($conn, $id, $lineage);  break;
        case 'basket':  lineageFromBasket($conn, $id, $lineage); break;
        case 'batch':   lineageFromBatch($conn, $id, $lineage);  break;
        case 'sweep':   lineageFromSweep($conn, $id, $lineage);  break;
        case 'broker':  lineageFromBroker($conn, $id, $lineage); break;
        case 'exec':    lineageFromExec($conn, $id, $lineage);   break;
        case 'ach':     lineageFromAch($conn, $id, $lineage);    break;
        default: throw new Exception("Unknown lineage type: {$type}");
    }

    return $lineage;
}

// =========================================================================
// From an order_id → basket → batch → sweep → broker → ach
// =========================================================================

function lineageFromOrder(PDO $conn, string $id, array &$lineage): void {
    $stmt = $conn->prepare("SELECT * FROM orders WHERE order_id = ?");
    $stmt->execute([$id]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) return;

    addOrderIfNew($lineage, $order);

    // Expand to sibling orders in same basket
    if ($order['basket_id']) {
        addBasketOrders($conn, $order['basket_id'], $lineage);
    }

    // Trace up: batch → prep
    if ($order['batch_id']) {
        addOrderBatch($conn, $order['batch_id'], $lineage);
        addPrepFromBatch($conn, $order['batch_id'], $lineage);
    }

    // Trace forward: sweep + broker notifications via basket
    if ($order['basket_id']) {
        traceNotificationsForBasket($conn, $order['basket_id'], $lineage);
    }

    // Trace down: ACH
    if ($order['paid_batch_id']) {
        addAch($conn, $order['paid_batch_id'], $lineage);
    }
}

// =========================================================================
// From a basket_id
// =========================================================================

function lineageFromBasket(PDO $conn, string $id, array &$lineage): void {
    addBasketOrders($conn, $id, $lineage);

    // Get batch_id from any order in this basket
    $batchId = null;
    foreach ($lineage['orders'] as $o) {
        if ($o['batch_id']) { $batchId = $o['batch_id']; break; }
    }
    if ($batchId) {
        addPrepFromBatch($conn, $batchId, $lineage);
    }

    traceNotificationsForBasket($conn, $id, $lineage);

    // ACH
    $paidIds = array_unique(array_filter(array_column($lineage['orders'], 'paid_batch_id')));
    foreach ($paidIds as $pid) {
        addAch($conn, $pid, $lineage);
    }
}

// =========================================================================
// From a batch_id (PREP-... or BATCH-...)
// =========================================================================

function lineageFromBatch(PDO $conn, string $id, array &$lineage): void {
    if (stripos($id, 'PREP-') === 0) {
        // It's a prepare_batches batch_id
        addPrepBatch($conn, $id, $lineage);
        addStagedOrders($conn, $id, $lineage);

        // Find orders that came from this prep batch
        // orders.batch_id uses BATCH-... format, link via prepared_orders basket patterns
        $stmt = $conn->prepare("
            SELECT DISTINCT basket_id FROM prepared_orders WHERE batch_id = ?
        ");
        $stmt->execute([$id]);
        $prepBaskets = $stmt->fetchAll(PDO::FETCH_COLUMN);

        // For each prepared basket, find matching orders by member+merchant+symbol
        foreach ($prepBaskets as $pb) {
            $stmt2 = $conn->prepare("
                SELECT po.member_id, po.merchant_id
                FROM prepared_orders po
                WHERE po.basket_id = ? LIMIT 1
            ");
            $stmt2->execute([$pb]);
            $po = $stmt2->fetch(PDO::FETCH_ASSOC);
            if ($po) {
                // Find orders for this member/merchant created around the approval time
                $stmt3 = $conn->prepare("
                    SELECT DISTINCT batch_id FROM orders
                    WHERE member_id = ? AND merchant_id = ?
                    AND batch_id IS NOT NULL AND batch_id != ''
                    ORDER BY placed_at DESC LIMIT 5
                ");
                $stmt3->execute([$po['member_id'], $po['merchant_id']]);
                foreach ($stmt3->fetchAll(PDO::FETCH_COLUMN) as $ob) {
                    addOrderBatch($conn, $ob, $lineage);
                }
            }
        }
    } else {
        // It's an orders batch_id (BATCH-...)
        addOrderBatch($conn, $id, $lineage);
        addPrepFromBatch($conn, $id, $lineage);
    }

    // Trace forward from discovered orders
    $basketIds = array_unique(array_column($lineage['orders'], 'basket_id'));
    foreach ($basketIds as $bid) {
        if ($bid) traceNotificationsForBasket($conn, $bid, $lineage);
    }

    $paidIds = array_unique(array_filter(array_column($lineage['orders'], 'paid_batch_id')));
    foreach ($paidIds as $pid) {
        addAch($conn, $pid, $lineage);
    }
}

// =========================================================================
// From a sweep batch_id (SWP-...)
// =========================================================================

function lineageFromSweep(PDO $conn, string $id, array &$lineage): void {
    addSweepLog($conn, $id, $lineage);

    // Find broker_notifications whose payload JSON contains this SWP batch_id
    $notifs = searchNotificationsByJson($conn, 'batch_id', $id);

    $basketIds = [];
    foreach ($notifs as $n) {
        $parsed = parseNotification($n);
        classifyAndAddNotification($lineage, $parsed);

        // Placement notifications: basket_id column = "merchant::broker" (not an order basket)
        // Real order basket_ids are in payload.members[].basket_id
        $payload = json_decode($n['payload'] ?? '{}', true) ?: [];
        if (!empty($payload['members'])) {
            foreach ($payload['members'] as $m) {
                if (!empty($m['basket_id'])) {
                    $basketIds[$m['basket_id']] = true;
                }
            }
        }

        // Execution notifications: basket_id column IS the order basket
        $eventType = $n['event_type'] ?? '';
        if (stripos($eventType, 'confirm') !== false || stripos($eventType, 'exec') !== false) {
            if ($n['basket_id']) $basketIds[$n['basket_id']] = true;
        }
    }

    // Load orders from discovered baskets
    foreach (array_keys($basketIds) as $bid) {
        addBasketOrders($conn, $bid, $lineage);
    }

    // Trace back to batch → prep
    $batchIds = array_unique(array_filter(array_column($lineage['orders'], 'batch_id')));
    foreach ($batchIds as $bid) {
        addPrepFromBatch($conn, $bid, $lineage);
    }

    // ACH
    $paidIds = array_unique(array_filter(array_column($lineage['orders'], 'paid_batch_id')));
    foreach ($paidIds as $pid) {
        addAch($conn, $pid, $lineage);
    }
}

// =========================================================================
// From a broker_ref (BKR-...)
// =========================================================================

function lineageFromBroker(PDO $conn, string $id, array &$lineage): void {
    $notifs = searchNotificationsByJson($conn, 'broker_batch_id', $id);
    if (empty($notifs)) {
        $notifs = searchNotificationsByJson($conn, 'broker_ref', $id);
    }
    if (empty($notifs)) return;

    foreach ($notifs as $n) {
        $parsed = parseNotification($n);
        classifyAndAddNotification($lineage, $parsed);

        // Extract real order basket_ids from payload.members[].basket_id
        $payload = json_decode($n['payload'] ?? '{}', true) ?: [];
        if (!empty($payload['members'])) {
            foreach ($payload['members'] as $m) {
                if (!empty($m['basket_id'])) {
                    addBasketOrders($conn, $m['basket_id'], $lineage);
                }
            }
        }

        $batchId = $parsed['batch_id'] ?? null;
        if ($batchId && stripos($batchId, 'SWP') === 0) {
            addSweepLog($conn, $batchId, $lineage);
        }
    }

    // Trace back to batch → prep
    $orderBatchIds = array_unique(array_filter(array_column($lineage['orders'], 'batch_id')));
    foreach ($orderBatchIds as $bid) {
        addPrepFromBatch($conn, $bid, $lineage);
    }

    $paidIds = array_unique(array_filter(array_column($lineage['orders'], 'paid_batch_id')));
    foreach ($paidIds as $pid) {
        addAch($conn, $pid, $lineage);
    }
}

// =========================================================================
// From an exec_id (EXEC-...)
// =========================================================================

function lineageFromExec(PDO $conn, string $id, array &$lineage): void {
    $notifs = searchNotificationsByJson($conn, 'exec_id', $id);
    if (empty($notifs)) return;

    foreach ($notifs as $n) {
        $parsed = parseNotification($n);
        classifyAndAddNotification($lineage, $parsed);
        if ($n['basket_id']) addBasketOrders($conn, $n['basket_id'], $lineage);

        $batchId = $parsed['batch_id'] ?? null;
        if ($batchId && stripos($batchId, 'SWP') === 0) {
            addSweepLog($conn, $batchId, $lineage);
            // Also get original placement notifications
            $origNotifs = searchNotificationsByJson($conn, 'batch_id', $batchId);
            foreach ($origNotifs as $on) {
                $op = parseNotification($on);
                if (!($op['exec_id'] ?? null)) {
                    classifyAndAddNotification($lineage, $op);
                }
            }
        }
    }

    $orderBatchIds = array_unique(array_filter(array_column($lineage['orders'], 'batch_id')));
    foreach ($orderBatchIds as $bid) {
        addPrepFromBatch($conn, $bid, $lineage);
    }

    $paidIds = array_unique(array_filter(array_column($lineage['orders'], 'paid_batch_id')));
    foreach ($paidIds as $pid) {
        addAch($conn, $pid, $lineage);
    }
}

// =========================================================================
// From a paid_batch_id (ACH_...)
// =========================================================================

function lineageFromAch(PDO $conn, string $id, array &$lineage): void {
    addAch($conn, $id, $lineage);

    $stmt = $conn->prepare("SELECT * FROM orders WHERE paid_batch_id = ? ORDER BY order_id");
    $stmt->execute([$id]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $basketIds = [];
    foreach ($orders as $o) {
        addOrderIfNew($lineage, $o);
        if ($o['basket_id']) $basketIds[$o['basket_id']] = true;
    }

    foreach (array_keys($basketIds) as $bid) {
        addBasketEntry($conn, $bid, $lineage);
        traceNotificationsForBasket($conn, $bid, $lineage);
    }

    $orderBatchIds = array_unique(array_filter(array_column($lineage['orders'], 'batch_id')));
    foreach ($orderBatchIds as $bid) {
        addPrepFromBatch($conn, $bid, $lineage);
    }
}

// =========================================================================
// HELPERS — Prepare / Staged
// =========================================================================

function addPrepBatch(PDO $conn, string $batchId, array &$lineage): void {
    if ($lineage['prep'] && $lineage['prep']['batch_id'] === $batchId) return;

    $stmt = $conn->prepare("SELECT * FROM prepare_batches WHERE batch_id = ?");
    $stmt->execute([$batchId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $lineage['prep'] = [
            'batch_id'      => $row['batch_id'],
            'status'        => $row['status'],
            'total_members' => $row['total_members'],
            'total_orders'  => $row['total_orders'],
            'total_amount'  => $row['total_amount'],
            'total_points'  => $row['total_points'],
            'created_at'    => $row['created_at'],
            'approved_at'   => $row['approved_at'],
        ];
    }
}

function addStagedOrders(PDO $conn, string $prepBatchId, array &$lineage): void {
    $stmt = $conn->prepare("
        SELECT basket_id, member_id, merchant_id, broker,
               COUNT(*) as order_count,
               SUM(amount) as total_amount,
               SUM(points_used) as total_points,
               status
        FROM prepared_orders WHERE batch_id = ?
        GROUP BY basket_id, member_id, merchant_id, broker, status
        ORDER BY member_id
    ");
    $stmt->execute([$prepBatchId]);
    $lineage['staged'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Try to find the PREP batch that produced a given orders batch_id (BATCH-...).
 * Strategy: match by approved_at time proximity and member overlap.
 */
function addPrepFromBatch(PDO $conn, string $orderBatchId, array &$lineage): void {
    if ($lineage['prep']) return; // Already found

    // Get the earliest placed_at from orders in this batch
    $stmt = $conn->prepare("
        SELECT MIN(placed_at) as earliest, GROUP_CONCAT(DISTINCT member_id) as members
        FROM orders WHERE batch_id = ?
    ");
    $stmt->execute([$orderBatchId]);
    $info = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$info || !$info['earliest']) return;

    // Find prepare_batches approved shortly before orders were placed
    $stmt2 = $conn->prepare("
        SELECT * FROM prepare_batches
        WHERE status IN ('approved', 'submitted')
        AND approved_at IS NOT NULL
        AND approved_at <= ?
        AND approved_at >= DATE_SUB(?, INTERVAL 5 MINUTE)
        ORDER BY approved_at DESC
        LIMIT 1
    ");
    $stmt2->execute([$info['earliest'], $info['earliest']]);
    $prep = $stmt2->fetch(PDO::FETCH_ASSOC);
    if ($prep) {
        $lineage['prep'] = [
            'batch_id'      => $prep['batch_id'],
            'status'        => $prep['status'],
            'total_members' => $prep['total_members'],
            'total_orders'  => $prep['total_orders'],
            'total_amount'  => $prep['total_amount'],
            'total_points'  => $prep['total_points'],
            'created_at'    => $prep['created_at'],
            'approved_at'   => $prep['approved_at'],
        ];
        addStagedOrders($conn, $prep['batch_id'], $lineage);
    }
}

// =========================================================================
// HELPERS — Orders / Baskets
// =========================================================================

function addOrderBatch(PDO $conn, string $batchId, array &$lineage): void {
    $stmt = $conn->prepare("SELECT * FROM orders WHERE batch_id = ? ORDER BY order_id");
    $stmt->execute([$batchId]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $o) {
        addOrderIfNew($lineage, $o);
        if ($o['basket_id']) addBasketEntry($conn, $o['basket_id'], $lineage);
    }
}

function addBasketOrders(PDO $conn, string $basketId, array &$lineage): void {
    addBasketEntry($conn, $basketId, $lineage);

    $stmt = $conn->prepare("SELECT * FROM orders WHERE basket_id = ? ORDER BY order_id");
    $stmt->execute([$basketId]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $o) {
        addOrderIfNew($lineage, $o);
    }
}

function addBasketEntry(PDO $conn, string $basketId, array &$lineage): void {
    foreach ($lineage['baskets'] as $existing) {
        if ($existing['basket_id'] === $basketId) return;
    }

    $stmt = $conn->prepare("
        SELECT basket_id, batch_id, member_id, merchant_id, broker,
               COUNT(*) as order_count,
               SUM(amount) as total_amount,
               MIN(status) as min_status,
               MAX(status) as max_status
        FROM orders WHERE basket_id = ?
        GROUP BY basket_id, batch_id, member_id, merchant_id, broker
    ");
    $stmt->execute([$basketId]);
    $basket = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($basket) {
        $lineage['baskets'][] = $basket;
    }
}

function addOrderIfNew(array &$lineage, array $o): void {
    foreach ($lineage['orders'] as $existing) {
        if ($existing['order_id'] == $o['order_id']) return;
    }
    $lineage['orders'][] = [
        'order_id'        => $o['order_id'],
        'member_id'       => $o['member_id'],
        'merchant_id'     => $o['merchant_id'],
        'basket_id'       => $o['basket_id'],
        'batch_id'        => $o['batch_id'],
        'symbol'          => $o['symbol'],
        'amount'          => $o['amount'],
        'shares'          => $o['shares'],
        'status'          => $o['status'],
        'broker'          => $o['broker'],
        'order_type'      => $o['order_type'] ?? null,
        'executed_at'     => $o['executed_at'] ?? null,
        'executed_price'  => $o['executed_price'] ?? null,
        'executed_shares' => $o['executed_shares'] ?? null,
        'executed_amount' => $o['executed_amount'] ?? null,
        'paid_batch_id'   => $o['paid_batch_id'] ?? null,
        'paid_at'         => $o['paid_at'] ?? null,
        'placed_at'       => $o['placed_at'] ?? null,
    ];
}

// =========================================================================
// HELPERS — Broker notifications (JSON search)
// =========================================================================

function traceNotificationsForBasket(PDO $conn, string $basketId, array &$lineage): void {
    // 1. Direct match on basket_id column — finds execution notifications
    $stmt = $conn->prepare("
        SELECT * FROM broker_notifications
        WHERE basket_id = ?
        ORDER BY created_at ASC
    ");
    $stmt->execute([$basketId]);

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $n) {
        $parsed = parseNotification($n);
        classifyAndAddNotification($lineage, $parsed);

        $batchId = $parsed['batch_id'] ?? null;
        if ($batchId && stripos($batchId, 'SWP') === 0) {
            addSweepLog($conn, $batchId, $lineage);
        }
    }

    // 2. Search payload JSON for this basket_id — finds placement notifications
    //    Placement notifications store basket_id inside payload.members[].basket_id
    //    and basket_id column = "merchant::broker" combo label
    $stmt2 = $conn->prepare("
        SELECT * FROM broker_notifications
        WHERE basket_id != ?
          AND event_type = 'order.placed'
          AND payload LIKE CONCAT('%', ?, '%')
        ORDER BY created_at ASC
        LIMIT 20
    ");
    $stmt2->execute([$basketId, $basketId]);

    foreach ($stmt2->fetchAll(PDO::FETCH_ASSOC) as $n) {
        $parsed = parseNotification($n);
        classifyAndAddNotification($lineage, $parsed);

        $batchId = $parsed['batch_id'] ?? null;
        if ($batchId && stripos($batchId, 'SWP') === 0) {
            addSweepLog($conn, $batchId, $lineage);
        }
    }
}

function searchNotificationsByJson(PDO $conn, string $jsonField, string $value): array {
    $jsonPath = '$.' . $jsonField;
    $stmt = $conn->prepare("
        SELECT * FROM broker_notifications
        WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, ?)) = ?
           OR JSON_UNQUOTE(JSON_EXTRACT(response_body, ?)) = ?
        ORDER BY created_at ASC
        LIMIT 50
    ");
    $stmt->execute([$jsonPath, $value, $jsonPath, $value]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function parseNotification(array $row): array {
    $payload  = json_decode($row['payload'] ?? '{}', true) ?: [];
    $response = json_decode($row['response_body'] ?? '{}', true) ?: [];

    return [
        'id'              => $row['id'],
        'created_at'      => $row['created_at'],
        'sent_at'         => $row['sent_at'],
        'broker_id'       => $row['broker_id'],
        'broker_name'     => $row['broker_name'],
        'event_type'      => $row['event_type'],
        'status'          => $row['status'],
        'member_id'       => $row['member_id'],
        'merchant_id'     => $row['merchant_id'],
        'basket_id'       => $row['basket_id'],
        'response_code'   => $row['response_code'],
        'error_message'   => $row['error_message'],
        // Extracted from JSON
        'batch_id'        => $payload['batch_id'] ?? $response['batch_id'] ?? null,
        'broker_ref'      => $response['broker_batch_id'] ?? $response['broker_ref'] ?? $payload['broker_ref'] ?? null,
        'exec_id'         => $payload['exec_id'] ?? $response['exec_id'] ?? null,
        'acknowledged'    => $response['acknowledged'] ?? ($row['status'] === 'sent' || $row['status'] === 'acknowledged'),
        'acknowledged_at' => $response['acknowledged_at'] ?? $row['sent_at'] ?? null,
        'order_count'     => $payload['summary']['order_count'] ?? count($payload['orders'] ?? []),
        'total_amount'    => $payload['summary']['total_amount'] ?? $payload['total_amount'] ?? null,
    ];
}

function classifyAndAddNotification(array &$lineage, array $parsed): void {
    $eventType = $parsed['event_type'] ?? '';
    $hasExec   = !empty($parsed['exec_id']);

    if ($hasExec || stripos($eventType, 'exec') !== false || stripos($eventType, 'confirm') !== false) {
        addExec($lineage, $parsed);
    } else {
        addBrokerNotif($lineage, $parsed);
    }
}

function addBrokerNotif(array &$lineage, array $parsed): void {
    foreach ($lineage['brokers'] as $existing) {
        if ($existing['id'] === $parsed['id']) return;
    }
    $lineage['brokers'][] = $parsed;
}

function addExec(array &$lineage, array $parsed): void {
    foreach ($lineage['execs'] as $existing) {
        if ($existing['id'] === $parsed['id']) return;
    }
    $lineage['execs'][] = $parsed;
}

// =========================================================================
// HELPERS — Sweep log
// =========================================================================

function addSweepLog(PDO $conn, string $batchId, array &$lineage): void {
    if ($lineage['sweep'] && ($lineage['sweep']['batch_id'] ?? null) === $batchId) return;

    $stmt = $conn->prepare("
        SELECT batch_id, started_at, completed_at,
               TIMESTAMPDIFF(SECOND, started_at, completed_at) as duration_seconds,
               merchants_processed, orders_processed, orders_confirmed, orders_failed,
               brokers_notified, errors
        FROM sweep_log WHERE batch_id = ?
        LIMIT 1
    ");
    $stmt->execute([$batchId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $lineage['sweep'] = $row;
    }
}

// =========================================================================
// HELPERS — ACH / payment batches
// =========================================================================

function addAch(PDO $conn, string $paidBatchId, array &$lineage): void {
    foreach ($lineage['ach'] as $existing) {
        if ($existing['paid_batch_id'] === $paidBatchId) return;
    }

    $stmt = $conn->prepare("
        SELECT paid_batch_id,
               COUNT(*) as order_count,
               SUM(executed_amount) as total_amount,
               MIN(paid_at) as paid_at,
               GROUP_CONCAT(DISTINCT broker) as brokers,
               GROUP_CONCAT(DISTINCT merchant_id) as merchants
        FROM orders WHERE paid_batch_id = ?
        GROUP BY paid_batch_id
    ");
    $stmt->execute([$paidBatchId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    // Match csv_files by merchant + broker + time proximity
    $files = [];
    if ($row && $row['merchants'] && $row['brokers']) {
        $stmt2 = $conn->prepare("
            SELECT file_id, filename, file_type, file_size, created_at
            FROM csv_files
            WHERE merchant_id = ? AND broker = ?
              AND created_at >= DATE_SUB(?, INTERVAL 10 MINUTE)
              AND created_at <= DATE_ADD(?, INTERVAL 10 MINUTE)
            ORDER BY created_at
        ");
        $paidAt = $row['paid_at'] ?? date('Y-m-d H:i:s');
        foreach (explode(',', $row['merchants']) as $m) {
            foreach (explode(',', $row['brokers']) as $b) {
                $stmt2->execute([trim($m), trim($b), $paidAt, $paidAt]);
                foreach ($stmt2->fetchAll(PDO::FETCH_ASSOC) as $f) {
                    $files[] = $f;
                }
            }
        }
    }

    $lineage['ach'][] = [
        'paid_batch_id' => $paidBatchId,
        'order_count'   => $row['order_count'] ?? 0,
        'total_amount'  => $row['total_amount'] ?? 0,
        'paid_at'       => $row['paid_at'] ?? null,
        'brokers'       => $row['brokers'] ?? '',
        'merchants'     => $row['merchants'] ?? '',
        'files'         => $files,
    ];
}
