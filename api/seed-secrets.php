<?php
/**
 * seed-secrets.php - One-time migration of .env credentials to AWS Secrets Manager
 * 
 * Run ONCE from the command line on EC2:
 *   php /var/www/html/api/seed-secrets.php
 * 
 * Safe to re-run - uses put() which creates or updates.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/SecretManager.php';

echo "=== StockLoyal Secrets Migration ===\n\n";

// 1. Store global secrets
echo "--- Global Secrets ---\n";

$globalSecrets = [
    'stockloyal/global/plaid/client_id'        => $_ENV['PLAID_CLIENT_ID'] ?? null,
    'stockloyal/global/plaid/secret'            => $_ENV['PLAID_SECRET'] ?? null,
    'stockloyal/global/alpaca/data_api_key'     => $_ENV['ALPACA_DATA_API_KEY'] ?? null,
    'stockloyal/global/alpaca/data_api_secret'  => $_ENV['ALPACA_DATA_API_SECRET'] ?? null,
];

foreach ($globalSecrets as $path => $value) {
    if (empty($value)) {
        echo "  SKIP {$path} -- no value in .env\n";
        continue;
    }
    $ok = SecretManager::put($path, $value);
    echo $ok ? "  OK   {$path}\n" : "  FAIL {$path}\n";
}

// 2. Store per-merchant Alpaca broker secrets
echo "\n--- Per-Merchant Broker Secrets ---\n";

$alpacaApiKey    = $_ENV['ALPACA_BROKER_API_KEY'] ?? null;
$alpacaApiSecret = $_ENV['ALPACA_BROKER_API_SECRET'] ?? null;
$alpacaFirmAcct  = $_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? null;

$stmt = $conn->query("
    SELECT mbc.id, mbc.merchant_id, mbc.broker_id, bm.broker_type
    FROM merchant_broker_config mbc
    JOIN broker_master bm ON bm.broker_id = mbc.broker_id
    WHERE mbc.is_active = 1
");
$configs = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($configs)) {
    echo "  WARNING: No active merchant_broker_config rows found.\n";
} else {
    foreach ($configs as $cfg) {
        $mid = $cfg['merchant_id'];
        $btype = strtolower($cfg['broker_type'] ?: $cfg['broker_id']);
        $configId = $cfg['id'];

        echo "\n  Merchant: {$mid} / Broker: {$btype} (config #{$configId})\n";

        $keyPath    = "stockloyal/{$mid}/{$btype}/api_key";
        $secretPath = "stockloyal/{$mid}/{$btype}/api_secret";
        $firmPath   = "stockloyal/{$mid}/{$btype}/firm_account_id";

        if (!empty($alpacaApiKey)) {
            $ok = SecretManager::put($keyPath, $alpacaApiKey);
            echo $ok ? "    OK   {$keyPath}\n" : "    FAIL {$keyPath}\n";
        }

        if (!empty($alpacaApiSecret)) {
            $ok = SecretManager::put($secretPath, $alpacaApiSecret);
            echo $ok ? "    OK   {$secretPath}\n" : "    FAIL {$secretPath}\n";
        }

        if (!empty($alpacaFirmAcct)) {
            $ok = SecretManager::put($firmPath, $alpacaFirmAcct);
            echo $ok ? "    OK   {$firmPath}\n" : "    FAIL {$firmPath}\n";
        }

        $update = $conn->prepare("
            UPDATE merchant_broker_config 
            SET broker_api_key_path    = ?,
                broker_api_secret_path = ?,
                sweep_account_id       = ?,
                sweep_account_status   = 'active',
                updated_at             = NOW()
            WHERE id = ?
        ");
        $update->execute([$keyPath, $secretPath, $alpacaFirmAcct, $configId]);
        echo "    OK   merchant_broker_config #{$configId} updated with paths\n";
    }
}

// 3. Verify by reading back
echo "\n--- Verification ---\n";

SecretManager::clearCache();

$plaid = SecretManager::getPlaidAppCredentials();
echo "  Plaid client_id: " . ($plaid['client_id'] ? 'OK (' . strlen($plaid['client_id']) . ' chars)' : 'MISSING') . "\n";
echo "  Plaid secret:    " . ($plaid['secret'] ? 'OK (' . strlen($plaid['secret']) . ' chars)' : 'MISSING') . "\n";

$dataApi = SecretManager::getAlpacaDataCredentials();
echo "  Alpaca data key: " . ($dataApi['api_key'] ? 'OK (' . strlen($dataApi['api_key']) . ' chars)' : 'MISSING') . "\n";

foreach ($configs as $cfg) {
    $mid = $cfg['merchant_id'];
    $btype = strtolower($cfg['broker_type'] ?: $cfg['broker_id']);
    $creds = SecretManager::getMerchantBrokerSecrets($mid, $btype);
    echo "  {$mid}/{$btype}: " . (count($creds) >= 2 ? 'OK ' . count($creds) . ' secrets' : 'INCOMPLETE') . "\n";
}

echo "\n--- Final merchant_broker_config state ---\n";
$rows = $conn->query("
    SELECT id, merchant_id, broker_id, sweep_account_id, sweep_account_status, 
           broker_api_key_path, broker_api_secret_path 
    FROM merchant_broker_config
")->fetchAll();
foreach ($rows as $row) {
    echo "  #{$row['id']} {$row['merchant_id']}/{$row['broker_id']}:\n";
    echo "    sweep    = {$row['sweep_account_id']}\n";
    echo "    status   = {$row['sweep_account_status']}\n";
    echo "    key_path = {$row['broker_api_key_path']}\n";
}

echo "\n=== Migration complete ===\n\n";
