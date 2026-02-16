<?php
/**
 * get_sweep_status.php — Read API for SweepAdmin dashboard
 *
 * Called by SweepAdmin.jsx → apiPost("get_sweep_status.php", { action })
 *
 * Actions:
 *   overview          → Stats cards, pending by merchant, upcoming schedule
 *   history           → sweep_log rows for the History tab
 *   pending           → Pending/queued orders for the Pending tab
 *   merchant_schedule → Merchant sweep day config for the Schedules tab
 */

declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input      = json_decode(file_get_contents("php://input"), true);
$action     = $input['action'] ?? 'overview';
$merchantId = $input['merchant_id'] ?? null;
$limit      = (int) ($input['limit'] ?? 50);

try {
    switch ($action) {

        // ==============================================================
        // OVERVIEW — stat cards + pending summary + upcoming schedule
        // ==============================================================
        case 'overview':
            echo json_encode(getOverview($conn));
            break;

        // ==============================================================
        // HISTORY — sweep_log rows
        // ==============================================================
        case 'history':
            echo json_encode(getHistory($conn, $limit));
            break;

        // ==============================================================
        // PENDING — individual pending/queued orders
        // ==============================================================
        case 'pending':
            echo json_encode(getPendingOrders($conn, $merchantId));
            break;

        // ==============================================================
        // MERCHANT_SCHEDULE — merchants with sweep_day config
        // ==============================================================
        case 'merchant_schedule':
            echo json_encode(getMerchantSchedules($conn));
            break;

        // ==============================================================
        // SWEEP_ORDERS — orders processed in a specific sweep batch
        // ==============================================================
        case 'sweep_orders':
            $batchId = $input['batch_id'] ?? null;
            if (!$batchId) throw new Exception("batch_id required for sweep_orders");
            echo json_encode(getSweepOrders($conn, $batchId));
            break;

        default:
            throw new Exception("Unknown action: {$action}");
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ]);
}


// ==================================================================
// OVERVIEW
// ==================================================================

function getOverview(PDO $conn): array
{
    $today          = date('Y-m-d');
    $dayOfMonth     = (int) date('j');
    $lastDayOfMonth = (int) date('t');

    // Total pending orders + amount
    $stmt = $conn->query("
        SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amt
        FROM   orders
        WHERE  LOWER(status) IN ('pending','queued')
    ");
    $pending = $stmt->fetch(PDO::FETCH_ASSOC);

    // Today's sweep activity from sweep_log
    $stmt = $conn->prepare("
        SELECT COUNT(*)                    AS sweeps_run,
               COALESCE(SUM(orders_confirmed), 0) AS orders_confirmed,
               COALESCE(SUM(orders_failed), 0)     AS orders_failed
        FROM   sweep_log
        WHERE  DATE(started_at) = ?
    ");
    $stmt->execute([$today]);
    $todayStats = $stmt->fetch(PDO::FETCH_ASSOC);

    // Merchants scheduled for today
    $stmt = $conn->prepare("
        SELECT merchant_id, merchant_name, sweep_day
        FROM   merchant
        WHERE  sweep_day IS NOT NULL
          AND  (sweep_day = ? OR (sweep_day = -1 AND ? = ?))
    ");
    $stmt->execute([$dayOfMonth, $dayOfMonth, $lastDayOfMonth]);
    $scheduledToday = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Pending orders by merchant
    $stmt = $conn->query("
        SELECT o.merchant_id,
               m.merchant_name,
               m.sweep_day,
               COUNT(*)             AS pending_orders,
               SUM(o.amount)        AS pending_amount,
               MIN(o.placed_at)     AS oldest_order
        FROM   orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        WHERE  LOWER(o.status) IN ('pending','queued')
        GROUP  BY o.merchant_id, m.merchant_name, m.sweep_day
        ORDER  BY pending_orders DESC
    ");
    $pendingByMerchant = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Upcoming schedule (next 7 days)
    $upcoming = [];
    for ($d = 0; $d < 7; $d++) {
        $date       = date('Y-m-d', strtotime("+{$d} days"));
        $dayNum     = (int) date('j', strtotime("+{$d} days"));
        $dayName    = date('D', strtotime("+{$d} days"));
        $isLastDay  = ($dayNum === (int) date('t', strtotime("+{$d} days")));

        $stmt = $conn->prepare("
            SELECT merchant_id, merchant_name, sweep_day
            FROM   merchant
            WHERE  sweep_day IS NOT NULL
              AND  (sweep_day = ? OR (sweep_day = -1 AND ? = 1))
        ");
        $stmt->execute([$dayNum, $isLastDay ? 1 : 0]);
        $dayMerchants = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!empty($dayMerchants)) {
            $upcoming[] = [
                'date'         => $date,
                'day_name'     => $dayName,
                'day_of_month' => $dayNum,
                'merchants'    => $dayMerchants,
            ];
        }
    }

    return [
        'success'              => true,
        'total_pending_orders' => (int) $pending['cnt'],
        'total_pending_amount' => (float) $pending['amt'],
        'today'                => [
            'date'                => $today,
            'sweeps_run'          => (int) $todayStats['sweeps_run'],
            'orders_confirmed'    => (int) $todayStats['orders_confirmed'],
            'orders_failed'       => (int) $todayStats['orders_failed'],
            'scheduled_merchants' => $scheduledToday,
        ],
        'pending_by_merchant'  => $pendingByMerchant,
        'upcoming_schedule'    => $upcoming,
    ];
}


// ==================================================================
// HISTORY — sweep_log rows
// ==================================================================

function getHistory(PDO $conn, int $limit): array
{
    try {
        // Cast limit directly into SQL (already validated as int) to avoid PDO string-binding issue
        $safeLimit = max(1, min($limit, 200));
        $stmt = $conn->query("
            SELECT batch_id, started_at, completed_at,
                   merchants_processed, orders_processed,
                   orders_confirmed, orders_failed,
                   brokers_notified, errors, log_data
            FROM   sweep_log
            ORDER  BY started_at DESC
            LIMIT  {$safeLimit}
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        // Return error details so frontend can log them for debugging
        return ['success' => false, 'history' => [], 'error' => $e->getMessage()];
    }

    foreach ($rows as &$row) {
        $row['merchants_processed'] = (int)   ($row['merchants_processed'] ?? 0);
        $row['orders_processed']    = (int)   ($row['orders_processed'] ?? 0);
        $row['orders_confirmed']    = (int)   ($row['orders_confirmed'] ?? 0);
        $row['orders_failed']       = (int)   ($row['orders_failed'] ?? 0);

        // Compute duration_seconds from started_at / completed_at for frontend
        if ($row['started_at'] && $row['completed_at']) {
            $start = strtotime($row['started_at']);
            $end   = strtotime($row['completed_at']);
            $row['duration_seconds'] = max(0, $end - $start);
        } else {
            $row['duration_seconds'] = 0;
        }

        // Decode brokers_notified JSON → array
        if (is_string($row['brokers_notified'])) {
            $decoded = json_decode($row['brokers_notified'], true);
            $row['brokers_notified'] = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($row['brokers_notified'])) {
            $row['brokers_notified'] = [];
        }

        // Decode errors JSON → array, compute has_errors boolean
        if (is_string($row['errors'])) {
            $decoded = json_decode($row['errors'], true);
            $row['errors'] = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($row['errors'])) {
            $row['errors'] = [];
        }
        $row['has_errors'] = !empty($row['errors']);

        // Decode log_data JSON → array
        if (is_string($row['log_data'])) {
            $decoded = json_decode($row['log_data'], true);
            $row['log_data'] = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($row['log_data'])) {
            $row['log_data'] = [];
        }
    }
    unset($row);

    return [
        'success' => true,
        'history' => $rows,
    ];
}


// ==================================================================
// PENDING — individual orders
// ==================================================================

function getPendingOrders(PDO $conn, ?string $merchantId): array
{
    $sql = "
        SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
               o.symbol, o.shares, o.amount, o.points_used, o.broker,
               o.status, o.placed_at, o.order_type,
               m.merchant_name,
               bc.username AS brokerage_id
        FROM   orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        LEFT JOIN broker_credentials bc ON bc.member_id = o.member_id AND LOWER(bc.broker) = LOWER(o.broker)
        WHERE  LOWER(o.status) IN ('pending','queued')
    ";

    $params = [];
    if ($merchantId) {
        $sql .= " AND o.merchant_id = ? ";
        $params[] = $merchantId;
    }
    $sql .= " ORDER BY o.placed_at DESC LIMIT 500";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'success'        => true,
        'pending_orders' => $rows,
    ];
}


// ==================================================================
// MERCHANT SCHEDULES
// ==================================================================

function getMerchantSchedules(PDO $conn): array
{
    $stmt = $conn->query("
        SELECT m.merchant_id,
               m.merchant_name,
               m.sweep_day,
               m.sweep_modified_at,
               COALESCE(p.pending_orders, 0) AS pending_orders,
               COALESCE(p.pending_amount, 0) AS pending_amount
        FROM   merchant m
        LEFT JOIN (
            SELECT merchant_id,
                   COUNT(*)      AS pending_orders,
                   SUM(amount)   AS pending_amount
            FROM   orders
            WHERE  LOWER(status) IN ('pending','queued')
            GROUP  BY merchant_id
        ) p ON m.merchant_id = p.merchant_id
        ORDER  BY m.merchant_name ASC
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'success'   => true,
        'schedules' => $rows,
    ];
}


// ==================================================================
// SWEEP_ORDERS — orders processed in a specific sweep batch
// Uses the sweep_log time window (started_at → completed_at) to find
// orders whose placed_at falls within that range.
// Returns the same column shape as getPendingOrders so SweepHierarchy works.
// ==================================================================

function getSweepOrders(PDO $conn, string $batchId): array
{
    // Get the sweep's time window
    $stmt = $conn->prepare("
        SELECT started_at, completed_at
        FROM   sweep_log
        WHERE  batch_id = ?
    ");
    $stmt->execute([$batchId]);
    $sweep = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$sweep) {
        return ['success' => false, 'error' => 'Sweep batch not found'];
    }

    // Load orders placed during this sweep window.
    // Use a buffer: 30s before started_at to handle legacy rows where
    // started_at = completed_at (both were NOW() at log-insert time,
    // but orders were placed_at = NOW() during processing, i.e. earlier).
    $stmt = $conn->prepare("
        SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
               o.symbol, o.shares, o.amount, o.points_used, o.broker,
               o.status, o.placed_at, o.order_type,
               m.merchant_name,
               bc.username AS brokerage_id
        FROM   orders o
        LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
        LEFT JOIN broker_credentials bc
               ON bc.member_id = o.member_id
              AND LOWER(bc.broker) = LOWER(o.broker)
        WHERE  o.placed_at BETWEEN DATE_SUB(?, INTERVAL 30 SECOND) AND ?
        ORDER BY o.merchant_id, o.broker, o.basket_id, o.symbol
        LIMIT 1000
    ");
    $stmt->execute([$sweep['started_at'], $sweep['completed_at']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'success' => true,
        'orders'  => $rows,
    ];
}
