<?php
declare(strict_types=1);

/**
 * webhook-admin.php
 * 
 * Admin dashboard for viewing webhook logs and statistics
 * 
 * Deploy to: https://app.stockloyal.com/webhooks/admin.php
 * 
 * IMPORTANT: Add authentication before deploying to production!
 */

require_once __DIR__ . '/config.php';

// IMPORTANT: Add your authentication here
// Example: session-based auth, IP whitelist, etc.
// if (!isset($_SESSION['admin']) || $_SESSION['admin'] !== true) {
//     die('Unauthorized');
// }

header('Content-Type: text/html; charset=UTF-8');

// Parameters
$page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$per_page = 50;
$offset = ($page - 1) * $per_page;

$filter_event = isset($_GET['event']) ? trim($_GET['event']) : '';
$filter_ip = isset($_GET['ip']) ? trim($_GET['ip']) : '';
$filter_date = isset($_GET['date']) ? trim($_GET['date']) : '';
$filter_verified = isset($_GET['verified']) ? $_GET['verified'] : '';

// Build query
$where = [];
$params = [];

if ($filter_event !== '') {
    $where[] = "event_type = ?";
    $params[] = $filter_event;
}

if ($filter_ip !== '') {
    $where[] = "source_ip = ?";
    $params[] = $filter_ip;
}

if ($filter_date !== '') {
    $where[] = "DATE(received_at) = ?";
    $params[] = $filter_date;
}

if ($filter_verified !== '') {
    $where[] = "signature_verified = ?";
    $params[] = (int)$filter_verified;
}

$where_clause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

// Get total count
$count_sql = "SELECT COUNT(*) FROM webhook_logs $where_clause";
$stmt = $pdo->prepare($count_sql);
$stmt->execute($params);
$total = (int)$stmt->fetchColumn();
$total_pages = ceil($total / $per_page);

// Get logs
$sql = "
    SELECT 
        id,
        request_id,
        event_type,
        payload,
        signature_verified,
        source_ip,
        origin,
        received_at,
        created_at
    FROM webhook_logs
    $where_clause
    ORDER BY received_at DESC
    LIMIT ? OFFSET ?
";

$stmt = $pdo->prepare($sql);
$stmt->execute(array_merge($params, [$per_page, $offset]));
$logs = $stmt->fetchAll();

// Get statistics
$stats_sql = "
    SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT event_type) as unique_events,
        COUNT(DISTINCT source_ip) as unique_ips,
        SUM(signature_verified) as verified_count,
        MIN(received_at) as first_webhook,
        MAX(received_at) as last_webhook
    FROM webhook_logs
    WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
";

$stats = $pdo->query($stats_sql)->fetch();

// Get event type breakdown
$events_sql = "
    SELECT 
        event_type,
        COUNT(*) as count,
        SUM(signature_verified) as verified
    FROM webhook_logs
    WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY event_type
    ORDER BY count DESC
    LIMIT 10
";

$event_breakdown = $pdo->query($events_sql)->fetchAll();

// Get recent errors (invalid signatures)
$errors_sql = "
    SELECT 
        request_id,
        event_type,
        source_ip,
        received_at
    FROM webhook_logs
    WHERE signature_verified = 0
        AND received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ORDER BY received_at DESC
    LIMIT 10
";

$recent_errors = $pdo->query($errors_sql)->fetchAll();

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Webhook Logs - StockLoyal Admin</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            background: #2563eb;
            color: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        header h1 {
            font-size: 24px;
            font-weight: 600;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .stat-card h3 {
            font-size: 14px;
            color: #666;
            margin-bottom: 8px;
            font-weight: 500;
        }
        
        .stat-card .value {
            font-size: 32px;
            font-weight: 700;
            color: #2563eb;
        }
        
        .filters {
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .filters form {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            align-items: end;
        }
        
        .filter-group label {
            display: block;
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
            font-weight: 500;
        }
        
        .filter-group input,
        .filter-group select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        
        .btn {
            padding: 8px 16px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }
        
        .btn:hover {
            background: #1d4ed8;
        }
        
        .btn-secondary {
            background: #6b7280;
        }
        
        .btn-secondary:hover {
            background: #4b5563;
        }
        
        table {
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        
        th {
            background: #f9fafb;
            font-weight: 600;
            font-size: 14px;
            color: #374151;
        }
        
        td {
            font-size: 14px;
        }
        
        tr:last-child td {
            border-bottom: none;
        }
        
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .badge-success {
            background: #d1fae5;
            color: #065f46;
        }
        
        .badge-error {
            background: #fee2e2;
            color: #991b1b;
        }
        
        .badge-info {
            background: #dbeafe;
            color: #1e40af;
        }
        
        .payload-preview {
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #6b7280;
            cursor: pointer;
        }
        
        .payload-preview:hover {
            color: #2563eb;
        }
        
        .pagination {
            display: flex;
            gap: 10px;
            justify-content: center;
            align-items: center;
            margin: 20px 0;
        }
        
        .pagination a {
            padding: 8px 12px;
            background: white;
            color: #2563eb;
            text-decoration: none;
            border-radius: 4px;
            border: 1px solid #e5e7eb;
        }
        
        .pagination a:hover {
            background: #f3f4f6;
        }
        
        .pagination .active {
            background: #2563eb;
            color: white;
        }
        
        .section {
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .section h2 {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #111827;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #6b7280;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        
        .modal.active {
            display: flex;
        }
        
        .modal-content {
            background: white;
            padding: 30px;
            border-radius: 8px;
            max-width: 800px;
            max-height: 80vh;
            overflow: auto;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        
        .modal-header h3 {
            font-size: 18px;
            font-weight: 600;
        }
        
        .close-btn {
            cursor: pointer;
            font-size: 24px;
            color: #6b7280;
            background: none;
            border: none;
        }
        
        pre {
            background: #f9fafb;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 Webhook Logs Dashboard</h1>
            <p>StockLoyal Webhook Receiver</p>
        </header>
        
        <!-- Statistics -->
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Last 24 Hours</h3>
                <div class="value"><?= number_format($stats['total']) ?></div>
            </div>
            <div class="stat-card">
                <h3>Unique Events</h3>
                <div class="value"><?= number_format($stats['unique_events']) ?></div>
            </div>
            <div class="stat-card">
                <h3>Verified</h3>
                <div class="value"><?= number_format($stats['verified_count']) ?></div>
            </div>
            <div class="stat-card">
                <h3>Unique IPs</h3>
                <div class="value"><?= number_format($stats['unique_ips']) ?></div>
            </div>
        </div>
        
        <!-- Event Breakdown -->
        <?php if (count($event_breakdown) > 0): ?>
        <div class="section">
            <h2>Top Event Types (24h)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Event Type</th>
                        <th>Count</th>
                        <th>Verified</th>
                        <th>Verification Rate</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($event_breakdown as $event): ?>
                    <tr>
                        <td><code><?= htmlspecialchars($event['event_type']) ?></code></td>
                        <td><?= number_format($event['count']) ?></td>
                        <td><?= number_format($event['verified']) ?></td>
                        <td>
                            <?php 
                            $rate = $event['count'] > 0 ? ($event['verified'] / $event['count']) * 100 : 0;
                            $color = $rate >= 90 ? 'success' : ($rate >= 50 ? 'info' : 'error');
                            ?>
                            <span class="badge badge-<?= $color ?>"><?= number_format($rate, 1) ?>%</span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
        
        <!-- Recent Errors -->
        <?php if (count($recent_errors) > 0): ?>
        <div class="section">
            <h2>Recent Signature Failures (24h)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Request ID</th>
                        <th>Event Type</th>
                        <th>Source IP</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($recent_errors as $error): ?>
                    <tr>
                        <td><code><?= htmlspecialchars($error['request_id']) ?></code></td>
                        <td><?= htmlspecialchars($error['event_type']) ?></td>
                        <td><?= htmlspecialchars($error['source_ip']) ?></td>
                        <td><?= date('Y-m-d H:i:s', strtotime($error['received_at'])) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
        
        <!-- Filters -->
        <div class="filters">
            <form method="GET">
                <div class="filter-group">
                    <label>Event Type</label>
                    <input type="text" name="event" value="<?= htmlspecialchars($filter_event) ?>" placeholder="e.g. points.redeemed">
                </div>
                <div class="filter-group">
                    <label>Source IP</label>
                    <input type="text" name="ip" value="<?= htmlspecialchars($filter_ip) ?>" placeholder="e.g. 203.0.113.1">
                </div>
                <div class="filter-group">
                    <label>Date</label>
                    <input type="date" name="date" value="<?= htmlspecialchars($filter_date) ?>">
                </div>
                <div class="filter-group">
                    <label>Signature</label>
                    <select name="verified">
                        <option value="">All</option>
                        <option value="1" <?= $filter_verified === '1' ? 'selected' : '' ?>>Verified</option>
                        <option value="0" <?= $filter_verified === '0' ? 'selected' : '' ?>>Not Verified</option>
                    </select>
                </div>
                <div class="filter-group">
                    <button type="submit" class="btn">Filter</button>
                    <a href="?" class="btn btn-secondary">Clear</a>
                </div>
            </form>
        </div>
        
        <!-- Webhook Logs -->
        <div class="section">
            <h2>Webhook Logs (<?= number_format($total) ?> total)</h2>
            
            <?php if (count($logs) > 0): ?>
            <table>
                <thead>
                    <tr>
                        <th>Request ID</th>
                        <th>Event Type</th>
                        <th>Source IP</th>
                        <th>Signature</th>
                        <th>Payload</th>
                        <th>Received At</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($logs as $log): ?>
                    <tr>
                        <td><code><?= htmlspecialchars($log['request_id']) ?></code></td>
                        <td><?= htmlspecialchars($log['event_type']) ?></td>
                        <td><?= htmlspecialchars($log['source_ip']) ?></td>
                        <td>
                            <span class="badge badge-<?= $log['signature_verified'] ? 'success' : 'error' ?>">
                                <?= $log['signature_verified'] ? '✓ Verified' : '✗ Not Verified' ?>
                            </span>
                        </td>
                        <td>
                            <div class="payload-preview" onclick="showPayload(<?= $log['id'] ?>, <?= htmlspecialchars(json_encode($log['payload'])) ?>)">
                                <?= htmlspecialchars(substr($log['payload'], 0, 50)) ?>...
                            </div>
                        </td>
                        <td><?= date('Y-m-d H:i:s', strtotime($log['received_at'])) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            
            <!-- Pagination -->
            <?php if ($total_pages > 1): ?>
            <div class="pagination">
                <?php if ($page > 1): ?>
                    <a href="?page=<?= $page - 1 ?>&event=<?= urlencode($filter_event) ?>&ip=<?= urlencode($filter_ip) ?>&date=<?= urlencode($filter_date) ?>&verified=<?= urlencode($filter_verified) ?>">← Previous</a>
                <?php endif; ?>
                
                <span>Page <?= $page ?> of <?= $total_pages ?></span>
                
                <?php if ($page < $total_pages): ?>
                    <a href="?page=<?= $page + 1 ?>&event=<?= urlencode($filter_event) ?>&ip=<?= urlencode($filter_ip) ?>&date=<?= urlencode($filter_date) ?>&verified=<?= urlencode($filter_verified) ?>">Next →</a>
                <?php endif; ?>
            </div>
            <?php endif; ?>
            
            <?php else: ?>
            <div class="empty-state">
                <p>No webhook logs found</p>
            </div>
            <?php endif; ?>
        </div>
    </div>
    
    <!-- Payload Modal -->
    <div id="payloadModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Webhook Payload</h3>
                <button class="close-btn" onclick="closeModal()">×</button>
            </div>
            <pre id="payloadContent"></pre>
        </div>
    </div>
    
    <script>
        function showPayload(id, payload) {
            const modal = document.getElementById('payloadModal');
            const content = document.getElementById('payloadContent');
            
            try {
                const formatted = JSON.stringify(JSON.parse(payload), null, 2);
                content.textContent = formatted;
            } catch (e) {
                content.textContent = payload;
            }
            
            modal.classList.add('active');
        }
        
        function closeModal() {
            document.getElementById('payloadModal').classList.remove('active');
        }
        
        // Close modal on outside click
        document.getElementById('payloadModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
        
        // Close modal on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        });
    </script>
</body>
</html>
