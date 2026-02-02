<?php
// api/get-admin-realtime.php
// Fetches real-time counts from source tables with optional date filtering
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

// Parse input for days parameter
$raw = file_get_contents('php://input');
$input = json_decode($raw ?: "{}", true) ?: [];

$days = isset($input['days']) ? (int)$input['days'] : 0; // 0 = all time
if ($days < 0) $days = 0;
if ($days > 365) $days = 365;

try {
    $db = $conn;
    
    $result = [
        'success' => true,
        'timestamp' => gmdate('Y-m-d H:i:s'),
        'days' => $days,
        'filter' => $days > 0 ? "Last {$days} days" : "All time",
    ];

    // ── Members/Wallet Stats ───────────────────────────────────────────────
    try {
        // Always get all-time total for members
        $sqlAllTime = "SELECT COUNT(*) as total_all_time FROM wallet";
        $stmt = $db->query($sqlAllTime);
        $allTimeRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $totalAllTime = $allTimeRow['total_all_time'] ?? 0;
        
        // Get filtered stats
        $sql = "
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(points), 0) as total_points,
                COALESCE(SUM(cash_balance), 0) as total_cash,
                COALESCE(SUM(portfolio_value), 0) as total_portfolio
            FROM wallet
            " . ($days > 0 ? "WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
        ";
        $stmt = $db->query($sql);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['members'] = [
            'total_all_time' => $totalAllTime,
            'total' => $row['total'] ?? 0,
            'new_in_period' => $days > 0 ? ($row['total'] ?? 0) : $totalAllTime,
        ];
        $result['wallets'] = [
            'total_wallets' => $row['total'] ?? 0,
            'total_points' => $row['total_points'] ?? 0,
            'total_cash' => $row['total_cash'] ?? 0,
            'total_portfolio' => $row['total_portfolio'] ?? 0,
        ];
    } catch (Throwable $e) {
        $result['members'] = ['total_all_time' => 0, 'total' => 0, 'error' => $e->getMessage()];
        $result['wallets'] = ['total_wallets' => 0, 'error' => $e->getMessage()];
    }

    // ── Members by Merchant ────────────────────────────────────────────────
    try {
        $sql = "
            SELECT 
                COALESCE(merchant_id, 'Unknown') as merchant_id,
                COALESCE(merchant_name, merchant_id, 'Unknown') as merchant_name,
                COUNT(*) as member_count,
                COALESCE(SUM(points), 0) as total_points,
                COALESCE(SUM(cash_balance), 0) as total_cash,
                COALESCE(SUM(portfolio_value), 0) as total_portfolio
            FROM wallet
            " . ($days > 0 ? "WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
            GROUP BY merchant_id, merchant_name
            ORDER BY member_count DESC
            LIMIT 15
        ";
        $stmt = $db->query($sql);
        $result['members_by_merchant'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['members_by_merchant'] = [];
    }

    // ── Members by Broker ──────────────────────────────────────────────────
    try {
        $sql = "
            SELECT 
                COALESCE(broker, 'Not Set') as broker,
                COUNT(*) as member_count,
                COALESCE(SUM(points), 0) as total_points,
                COALESCE(SUM(portfolio_value), 0) as total_portfolio
            FROM wallet
            " . ($days > 0 ? "WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
            GROUP BY broker
            ORDER BY member_count DESC
            LIMIT 15
        ";
        $stmt = $db->query($sql);
        $result['members_by_broker'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['members_by_broker'] = [];
    }

    // ── Orders Stats ───────────────────────────────────────────────────────
    try {
        $sql = "
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'placed' THEN 1 ELSE 0 END) as placed,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                COALESCE(SUM(amount), 0) as total_amount,
                COALESCE(SUM(CASE WHEN status IN ('executed', 'confirmed') THEN amount ELSE 0 END), 0) as executed_amount
            FROM orders
            " . ($days > 0 ? "WHERE placed_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
        ";
        $stmt = $db->query($sql);
        $result['orders'] = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['orders'] = ['total' => 0, 'error' => $e->getMessage()];
    }

    // ── Orders by Status (for chart) ───────────────────────────────────────
    try {
        $sql = "
            SELECT status, COUNT(*) as count
            FROM orders
            " . ($days > 0 ? "WHERE placed_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
            GROUP BY status
            ORDER BY count DESC
        ";
        $stmt = $db->query($sql);
        $result['orders_by_status'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['orders_by_status'] = [];
    }

    // ── Orders by Broker ───────────────────────────────────────────────────
    try {
        $sql = "
            SELECT 
                COALESCE(broker, 'Unknown') as broker,
                COUNT(*) as orders_count,
                COALESCE(SUM(amount), 0) as orders_amount,
                SUM(CASE WHEN status IN ('executed', 'confirmed') THEN 1 ELSE 0 END) as executed_count
            FROM orders
            " . ($days > 0 ? "WHERE placed_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
            GROUP BY broker
            ORDER BY orders_count DESC
            LIMIT 15
        ";
        $stmt = $db->query($sql);
        $result['orders_by_broker'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['orders_by_broker'] = [];
    }

    // ── Baskets Stats (from orders table - count distinct basket_id) ─────────
    try {
        $sql = "
            SELECT COUNT(DISTINCT basket_id) as total
            FROM orders
            WHERE basket_id IS NOT NULL
            " . ($days > 0 ? "AND placed_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
        ";
        $stmt = $db->query($sql);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['baskets'] = ['total' => $row['total'] ?? 0];
    } catch (Throwable $e) {
        $result['baskets'] = ['total' => 0, 'error' => $e->getMessage()];
    }

    // ── Social Stats ───────────────────────────────────────────────────────
    // Note: These tables may not exist in all deployments
    $socialPosts = 0;
    $socialActivePosts = 0;
    $socialComments = 0;
    $socialLikes = 0;
    
    try {
        $sql = "
            SELECT 
                COUNT(*) as posts,
                SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as active_posts
            FROM social_posts
            " . ($days > 0 ? "WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
        ";
        $stmt = $db->query($sql);
        $socialStats = $stmt->fetch(PDO::FETCH_ASSOC);
        $socialPosts = $socialStats['posts'] ?? 0;
        $socialActivePosts = $socialStats['active_posts'] ?? 0;
    } catch (Throwable $e) {
        // Table may not exist - that's ok
    }

    try {
        $sql = "SELECT COUNT(*) as cnt FROM social_comments" . 
            ($days > 0 ? " WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "");
        $stmt = $db->query($sql);
        $socialComments = $stmt->fetch(PDO::FETCH_ASSOC)['cnt'] ?? 0;
    } catch (Throwable $e) {
        // Table may not exist
    }

    try {
        $sql = "SELECT COUNT(*) as cnt FROM social_likes" .
            ($days > 0 ? " WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "");
        $stmt = $db->query($sql);
        $socialLikes = $stmt->fetch(PDO::FETCH_ASSOC)['cnt'] ?? 0;
    } catch (Throwable $e) {
        // Table may not exist
    }

    $result['social'] = [
        'posts' => $socialPosts,
        'active_posts' => $socialActivePosts,
        'comments' => $socialComments,
        'likes' => $socialLikes,
    ];

    // ── Ledger/Points Stats ────────────────────────────────────────────────
    try {
        $sql = "
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN amount_points > 0 THEN amount_points ELSE 0 END), 0) as total_loaded
            FROM transactions_ledger
            " . ($days > 0 ? "WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
        ";
        $stmt = $db->query($sql);
        $ledgerStats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Get points spent from orders table (points_used column)
        $sql = "
            SELECT COALESCE(SUM(points_used), 0) as total_spent
            FROM orders
            " . ($days > 0 ? "WHERE placed_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
        ";
        $stmt = $db->query($sql);
        $ordersStats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $result['points'] = [
            'total_transactions' => $ledgerStats['total_transactions'] ?? 0,
            'total_loaded' => $ledgerStats['total_loaded'] ?? 0,
            'total_spent' => $ordersStats['total_spent'] ?? 0,
        ];
    } catch (Throwable $e) {
        $result['points'] = ['total_transactions' => 0, 'error' => $e->getMessage()];
    }

    // ── Transactions Ledger Comprehensive Stats ────────────────────────────
    try {
        $sql = "
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
                SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound,
                COALESCE(SUM(CASE WHEN direction = 'inbound' THEN amount_points ELSE 0 END), 0) as inbound_points,
                COALESCE(SUM(CASE WHEN direction = 'outbound' THEN ABS(amount_points) ELSE 0 END), 0) as outbound_points,
                COALESCE(SUM(CASE WHEN direction = 'inbound' THEN amount_cash ELSE 0 END), 0) as inbound_cash,
                COALESCE(SUM(CASE WHEN direction = 'outbound' THEN ABS(amount_cash) ELSE 0 END), 0) as outbound_cash,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'reversed' THEN 1 ELSE 0 END) as reversed
            FROM transactions_ledger
            " . ($days > 0 ? "WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
        ";
        $stmt = $db->query($sql);
        $ledger = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['ledger'] = [
            'total' => $ledger['total'] ?? 0,
            'inbound' => $ledger['inbound'] ?? 0,
            'outbound' => $ledger['outbound'] ?? 0,
            'inbound_points' => $ledger['inbound_points'] ?? 0,
            'outbound_points' => $ledger['outbound_points'] ?? 0,
            'inbound_cash' => $ledger['inbound_cash'] ?? 0,
            'outbound_cash' => $ledger['outbound_cash'] ?? 0,
            'pending' => $ledger['pending'] ?? 0,
            'confirmed' => $ledger['confirmed'] ?? 0,
            'failed' => $ledger['failed'] ?? 0,
            'reversed' => $ledger['reversed'] ?? 0,
        ];
    } catch (Throwable $e) {
        $result['ledger'] = ['total' => 0, 'error' => $e->getMessage()];
    }

    // ── Points by Merchant (from ledger) ───────────────────────────────────
    try {
        $sql = "
            SELECT 
                COALESCE(merchant_id, 'Unknown') as merchant_id,
                COUNT(*) as transaction_count,
                COALESCE(SUM(CASE WHEN amount_points > 0 THEN amount_points ELSE 0 END), 0) as points_loaded
            FROM transactions_ledger
            WHERE amount_points > 0
            " . ($days > 0 ? "AND created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
            GROUP BY merchant_id
            ORDER BY points_loaded DESC
            LIMIT 15
        ";
        $stmt = $db->query($sql);
        $result['points_by_merchant'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['points_by_merchant'] = [];
    }

    // ── Recent Members ─────────────────────────────────────────────────────
    try {
        $sql = "
            SELECT member_id, member_email, name, merchant_id, merchant_name, broker, created_at
            FROM wallet
            " . ($days > 0 ? "WHERE created_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY)" : "") . "
            ORDER BY created_at DESC
            LIMIT 10
        ";
        $stmt = $db->query($sql);
        $result['recent_members'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['recent_members'] = [];
    }

    echo json_encode($result);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
