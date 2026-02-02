<?php
/**
 * run_sweep.php - Cron-callable script to execute the sweep process
 * 
 * Add to crontab to run daily:
 * 0 9 * * * /usr/bin/php /var/www/html/api/run_sweep.php >> /var/log/stockloyal/sweep.log 2>&1
 * 
 * Or run manually:
 * php run_sweep.php
 * php run_sweep.php --merchant=SKY001  (for specific merchant)
 */

declare(strict_types=1);

// Handle both CLI and web requests
$isCli = php_sapi_name() === 'cli';

if (!$isCli) {
    // Web request - require authentication
    require_once __DIR__ . '/cors.php';
    header("Content-Type: application/json");
    
    // Simple API key check for cron/webhook triggers
    $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? null;
    $expectedKey = getenv('SWEEP_API_KEY') ?: 'stockloyal_sweep_2025';
    
    if ($apiKey !== $expectedKey) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        exit;
    }
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/sweep_process.php';

// Parse arguments
$merchantId = null;

if ($isCli) {
    // CLI arguments
    $options = getopt('', ['merchant::', 'help']);
    
    if (isset($options['help'])) {
        echo "Usage: php run_sweep.php [options]\n";
        echo "Options:\n";
        echo "  --merchant=ID    Process only this merchant\n";
        echo "  --help           Show this help message\n";
        exit(0);
    }
    
    $merchantId = $options['merchant'] ?? null;
} else {
    // Web request - check for merchant parameter
    $input = json_decode(file_get_contents('php://input'), true);
    $merchantId = $input['merchant_id'] ?? $_GET['merchant_id'] ?? null;
}

try {
    $sweep = new SweepProcess($conn);
    $results = $sweep->run($merchantId);
    
    if ($isCli) {
        // CLI output
        echo "\n";
        echo "========================================\n";
        echo "SWEEP PROCESS RESULTS\n";
        echo "========================================\n";
        echo "Batch ID:            {$results['batch_id']}\n";
        echo "Started:             {$results['started_at']}\n";
        echo "Completed:           {$results['completed_at']}\n";
        echo "Duration:            {$results['duration_seconds']}s\n";
        echo "----------------------------------------\n";
        echo "Merchants Processed: {$results['merchants_processed']}\n";
        echo "Orders Processed:    {$results['orders_processed']}\n";
        echo "Orders Confirmed:    {$results['orders_confirmed']}\n";
        echo "Orders Failed:       {$results['orders_failed']}\n";
        echo "Brokers Notified:    " . implode(', ', $results['brokers_notified']) . "\n";
        
        if (!empty($results['errors'])) {
            echo "----------------------------------------\n";
            echo "ERRORS:\n";
            foreach ($results['errors'] as $error) {
                echo "  - {$error}\n";
            }
        }
        
        echo "========================================\n";
        echo "\nFull log:\n";
        foreach ($results['log'] as $line) {
            echo "  {$line}\n";
        }
        echo "\n";
        
        // Exit with appropriate code
        exit(empty($results['errors']) ? 0 : 1);
    } else {
        // Web output
        echo json_encode([
            'success' => true,
            'results' => $results
        ], JSON_PRETTY_PRINT);
    }
    
} catch (Exception $e) {
    $error = [
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ];
    
    if ($isCli) {
        echo "FATAL ERROR: {$e->getMessage()}\n";
        echo $e->getTraceAsString() . "\n";
        exit(1);
    } else {
        http_response_code(500);
        echo json_encode($error);
    }
}
