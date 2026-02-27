#!/usr/bin/env php
<?php
/**
 * cron/process-scheduled-orders.php
 *
 * Processes orders that are scheduled for today (or earlier if missed).
 * Only executes when the market is actually open.
 *
 * Crontab setup (all times ET):
 *   # Primary: Run at 9:31 AM ET on weekdays
 *   31 9 * * 1-5 cd /var/www/stockloyal && php cron/process-scheduled-orders.php >> /var/log/stockloyal/cron.log 2>&1
 *
 *   # Safety net: Every 15 min during market hours (9:30 AM - 4:00 PM ET)
 *   */15 9-15 * * 1-5 cd /var/www/stockloyal && php cron/process-scheduled-orders.php >> /var/log/stockloyal/cron.log 2>&1
 *
 *   # Final sweep at 3:45 PM to catch any stragglers before close
 *   45 15 * * 1-5 cd /var/www/stockloyal && php cron/process-scheduled-orders.php >> /var/log/stockloyal/cron.log 2>&1
 */

require_once __DIR__ . '/../MarketCalendar.php';
require_once __DIR__ . '/../OrderScheduler.php';
require_once __DIR__ . '/../config/database.php';

$startTime = microtime(true);
$timestamp = date('Y-m-d H:i:s T');

echo "[{$timestamp}] Starting scheduled order processing...\n";

try {
    $db = getDbConnection();
    $scheduler = new OrderScheduler($db);

    $result = $scheduler->processScheduledOrders();

    $elapsed = round(microtime(true) - $startTime, 2);

    echo "[{$timestamp}] Complete in {$elapsed}s\n";
    echo "  Total queued:  {$result['total']}\n";
    echo "  Processed:     {$result['processed']}\n";

    if (!empty($result['errors'])) {
        echo "  Errors:        " . count($result['errors']) . "\n";
        foreach ($result['errors'] as $err) {
            echo "    - Order #{$err['order_id']}: {$err['error']}\n";
        }
    }

    if (isset($result['reason'])) {
        echo "  Skipped:       {$result['reason']}\n";
    }

} catch (Exception $e) {
    echo "[{$timestamp}] FATAL: {$e->getMessage()}\n";
    error_log("process-scheduled-orders FATAL: " . $e->getMessage());
    exit(1);
}
