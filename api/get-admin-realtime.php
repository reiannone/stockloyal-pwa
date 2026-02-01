<?php
// api/get-admin-realtime.php
// Fetches real-time counts from source tables
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $db = $conn;
    
    $result = [
        'success' => true,
        'timestamp' => gmdate('Y-m-d H:i:s'),
    ];

    // ── Members/Wallet Stats (wallet is the main member table with merchant) ─
    try {
        $stmt = $db->query("
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_7d,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as new_30d,
                COALESCE(SUM(points), 0) as total_points,
                COALESCE(SUM(cash_balance), 0) as total_cash,
                COALESCE(SUM(portfolio_value), 0) as total_portfolio
            FROM wallet
        ");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['members'] = [
            'total' => $row['total'] ?? 0,
            'active' => $row['total'] ?? 0,
            'new_7d' => $row['new_7d'] ?? 0,
            'new_30d' => $row['new_30d'] ?? 0,
        ];
        $result['wallets'] = [
            'total_wallets' => $row['total'] ?? 0,
            'total_points' => $row['total_points'] ?? 0,
            'total_cash' => $row['total_cash'] ?? 0,
            'total_portfolio' => $row['total_portfolio'] ?? 0,
        ];
    } catch (Throwable $e) {
        $result['members'] = ['total' => 0, 'active' => 0, 'error' => $e->getMessage()];
        $result['wallets'] = ['total_wallets' => 0, 'error' => $e->getMessage()];
    }

    // ── Members by Merchant ─────────────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COALESCE(merchant_id, 'Unknown') as merchant_id,
                COALESCE(merchant_name, merchant_id, 'Unknown') as merchant_name,
                COUNT(*) as member_count,
                COALESCE(SUM(points), 0) as total_points,
                COALESCE(SUM(cash_balance), 0) as total_cash,
                COALESCE(SUM(portfolio_value), 0) as total_portfolio
            FROM wallet
            GROUP BY merchant_id, merchant_name
            ORDER BY member_count DESC
            LIMIT 15
        ");
        $result['members_by_merchant'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['members_by_merchant'] = [];
    }

    // ── Members by Broker ───────────────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COALESCE(broker, 'Not Set') as broker,
                COUNT(*) as member_count,
                COALESCE(SUM(points), 0) as total_points,
                COALESCE(SUM(portfolio_value), 0) as total_portfolio
            FROM wallet
            GROUP BY broker
            ORDER BY member_count DESC
            LIMIT 15
        ");
        $result['members_by_broker'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['members_by_broker'] = [];
    }

    // ── Orders Stats ────────────────────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'placed' THEN 1 ELSE 0 END) as placed,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                COALESCE(SUM(amount), 0) as total_amount,
                COALESCE(SUM(CASE WHEN status = 'executed' THEN amount ELSE 0 END), 0) as executed_amount
            FROM orders
        ");
        $result['orders'] = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['orders'] = ['total' => 0, 'error' => $e->getMessage()];
    }

    // ── Orders by Status (for chart) ────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT status, COUNT(*) as count
            FROM orders
            GROUP BY status
            ORDER BY count DESC
        ");
        $result['orders_by_status'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['orders_by_status'] = [];
    }

    // ── Orders by Broker (all time) ─────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COALESCE(broker, 'Unknown') as broker,
                COUNT(*) as orders_count,
                COALESCE(SUM(amount), 0) as orders_amount,
                SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed_count
            FROM orders
            GROUP BY broker
            ORDER BY orders_count DESC
            LIMIT 15
        ");
        $result['orders_by_broker'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['orders_by_broker'] = [];
    }

    // ── Baskets Stats ───────────────────────────────────────────────────────
    try {
        $stmt = $db->query("SELECT COUNT(*) as total FROM basket");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['baskets'] = [
            'total' => $row['total'] ?? 0,
            'active' => $row['total'] ?? 0,
        ];
    } catch (Throwable $e) {
        $result['baskets'] = ['total' => 0, 'error' => $e->getMessage()];
    }

    // ── Social Stats ────────────────────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COUNT(*) as posts,
                SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as active_posts,
                COALESCE(SUM(like_count), 0) as total_likes,
                COALESCE(SUM(comment_count), 0) as total_comments
            FROM social_posts
        ");
        $socialPosts = $stmt->fetch(PDO::FETCH_ASSOC);

        $stmt = $db->query("SELECT COUNT(*) as count FROM social_comments");
        $socialComments = $stmt->fetch(PDO::FETCH_ASSOC);

        $stmt = $db->query("SELECT COUNT(*) as count FROM social_likes");
        $socialLikes = $stmt->fetch(PDO::FETCH_ASSOC);

        $result['social'] = [
            'posts' => $socialPosts['posts'] ?? 0,
            'active_posts' => $socialPosts['active_posts'] ?? 0,
            'comments' => $socialComments['count'] ?? 0,
            'likes' => $socialLikes['count'] ?? 0,
        ];
    } catch (Throwable $e) {
        $result['social'] = ['posts' => 0, 'error' => $e->getMessage()];
    }

    // ── Ledger/Points Stats ─────────────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN points_amount > 0 THEN points_amount ELSE 0 END), 0) as total_loaded,
                COALESCE(SUM(CASE WHEN points_amount < 0 THEN ABS(points_amount) ELSE 0 END), 0) as total_spent
            FROM transactions_ledger
        ");
        $ledgerStats = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['points'] = [
            'total_transactions' => $ledgerStats['total_transactions'] ?? 0,
            'total_loaded' => $ledgerStats['total_loaded'] ?? 0,
            'total_spent' => $ledgerStats['total_spent'] ?? 0,
        ];
    } catch (Throwable $e) {
        $result['points'] = ['total_transactions' => 0, 'error' => $e->getMessage()];
    }

    // ── Points by Merchant (from ledger) ────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COALESCE(merchant_id, 'Unknown') as merchant_id,
                COUNT(*) as transaction_count,
                COALESCE(SUM(CASE WHEN points_amount > 0 THEN points_amount ELSE 0 END), 0) as points_loaded
            FROM transactions_ledger
            WHERE points_amount > 0
            GROUP BY merchant_id
            ORDER BY points_loaded DESC
            LIMIT 15
        ");
        $result['points_by_merchant'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['points_by_merchant'] = [];
    }

    // ── Merchants Stats ─────────────────────────────────────────────────────
    try {
        $stmt = $db->query("SELECT COUNT(*) as total FROM merchant");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['merchants'] = ['total' => $row['total'] ?? 0];
    } catch (Throwable $e) {
        $result['merchants'] = ['total' => 0];
    }

    // ── Brokers Stats ───────────────────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
            FROM broker_master
        ");
        $result['brokers'] = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['brokers'] = ['total' => 0];
    }

    // ── Recent Orders (last 10) ─────────────────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT order_id, member_id, symbol, amount, status, placed_at, broker
            FROM orders
            ORDER BY placed_at DESC
            LIMIT 10
        ");
        $result['recent_orders'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['recent_orders'] = [];
    }

    // ── Recent Members (last 10 from wallet) ────────────────────────────────
    try {
        $stmt = $db->query("
            SELECT member_id, member_email, merchant_id, merchant_name, broker, created_at
            FROM wallet
            ORDER BY created_at DESC
            LIMIT 10
        ");
        $result['recent_members'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $result['recent_members'] = [];
    }

    echo json_encode($result);

} catch (Throwable $e) {
    error_log("get-admin-realtime.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
