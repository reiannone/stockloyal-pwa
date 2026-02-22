<?php
// api/test-alpaca-connection.php
// Quick test to verify Alpaca Broker API connectivity
// Run: php /var/www/html/api/test-alpaca-connection.php
// Or hit via browser (remove after testing)
declare(strict_types=1);
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

header("Content-Type: application/json");

try {
    $alpaca = new AlpacaBrokerAPI();
    
    echo "=== Alpaca Broker API Connection Test ===\n\n";

    // Test 1: Basic connectivity
    echo "1. Testing connection...\n";
    $result = $alpaca->testConnection();
    if ($result['success']) {
        echo "   ✅ Connected! HTTP " . $result['http_code'] . "\n";
        $accounts = $result['data'];
        echo "   Found " . (is_array($accounts) ? count($accounts) : 0) . " account(s)\n\n";
    } else {
        echo "   ❌ Connection failed: " . ($result['error'] ?? 'Unknown error') . "\n";
        echo "   HTTP Code: " . $result['http_code'] . "\n\n";
    }

    // Test 2: Search for the test account
    echo "2. Searching for testmember1@stockloyal.com...\n";
    $account = $alpaca->findAccountByEmail('testmember1@stockloyal.com');
    if ($account) {
        echo "   ✅ Found account:\n";
        echo "      ID:     " . ($account['id'] ?? 'N/A') . "\n";
        echo "      Number: " . ($account['account_number'] ?? 'N/A') . "\n";
        echo "      Status: " . ($account['status'] ?? 'N/A') . "\n";
        echo "      Email:  " . ($account['contact']['email_address'] ?? 'N/A') . "\n";
        echo "      Name:   " . ($account['identity']['given_name'] ?? '') . ' ' . ($account['identity']['family_name'] ?? '') . "\n\n";
    } else {
        echo "   ⚠️  Account not found\n\n";
    }

    // Test 3: Get trading account details (if found)
    if ($account && !empty($account['id'])) {
        echo "3. Getting trading account details...\n";
        $trading = $alpaca->getTradingAccount($account['id']);
        if ($trading['success']) {
            $t = $trading['data'];
            echo "   ✅ Trading account:\n";
            echo "      Cash:     $" . ($t['cash'] ?? '0') . "\n";
            echo "      Equity:   $" . ($t['equity'] ?? '0') . "\n";
            echo "      Status:   " . ($t['status'] ?? 'N/A') . "\n";
            echo "      PDT:      " . ($t['pattern_day_trader'] ?? 'N/A') . "\n";
        } else {
            echo "   ⚠️  Could not fetch trading details: " . ($trading['error'] ?? '') . "\n";
        }
    }

    echo "\n=== Test Complete ===\n";

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}
