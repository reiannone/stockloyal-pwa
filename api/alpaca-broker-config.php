<?php
/**
 * alpaca-broker-config.php
 * Bridges credentials to constants used by journal files.
 *
 * Migration path: tries SecretManager first (if available),
 * then falls back to $_ENV. Once all endpoints are config-driven,
 * the $_ENV fallback can be removed.
 */
require_once __DIR__ . '/_loadenv.php';

// Try SecretManager fallback if available
$_smAvailable = file_exists(__DIR__ . '/SecretManager.php');
if ($_smAvailable) {
    require_once __DIR__ . '/SecretManager.php';
}

if (!defined('BROKER_API_KEY')) {
    if ($_smAvailable) {
        define('BROKER_API_KEY', SecretManager::getWithFallback(
            'stockloyal/global/alpaca/broker_api_key',
            'ALPACA_BROKER_API_KEY'
        ) ?? '');
    } else {
        define('BROKER_API_KEY', $_ENV['ALPACA_BROKER_API_KEY'] ?? '');
    }
}
if (!defined('BROKER_API_SECRET')) {
    if ($_smAvailable) {
        define('BROKER_API_SECRET', SecretManager::getWithFallback(
            'stockloyal/global/alpaca/broker_api_secret',
            'ALPACA_BROKER_API_SECRET'
        ) ?? '');
    } else {
        define('BROKER_API_SECRET', $_ENV['ALPACA_BROKER_API_SECRET'] ?? '');
    }
}
if (!defined('BROKER_BASE_URL')) {
    define('BROKER_BASE_URL', $_ENV['ALPACA_BROKER_BASE_URL'] ?? 'https://broker-api.sandbox.alpaca.markets');
}
if (!defined('BROKER_FIRM_ACCOUNT_ID')) {
    if ($_smAvailable) {
        define('BROKER_FIRM_ACCOUNT_ID', SecretManager::getWithFallback(
            'stockloyal/global/alpaca/firm_account_id',
            'ALPACA_FIRM_ACCOUNT_ID'
        ) ?? '');
    } else {
        define('BROKER_FIRM_ACCOUNT_ID', $_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? '');
    }
}

if (!function_exists('brokerLog')) {
    function brokerLog(string $message): void
    {
        $logDir  = '/var/www/html/api/logs';
        $logFile = $logDir . '/broker-' . date('Y-m-d') . '.log';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0755, true);
        }
        $ts = date('Y-m-d H:i:s');
        @file_put_contents($logFile, "[$ts] $message\n", FILE_APPEND | LOCK_EX);
    }
}
