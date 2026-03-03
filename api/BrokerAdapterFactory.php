<?php
/**
 * BrokerAdapterFactory.php
 *
 * Creates the right BrokerAdapter for a given merchant + broker config.
 * Resolves credentials from SecretManager, returns a ready-to-use adapter.
 *
 * Usage:
 *   $adapter = BrokerAdapterFactory::fromConfig($configRow);
 *   $adapter = BrokerAdapterFactory::forMerchant($pdo, 'merchant001', 'Alpaca');
 *   $adapters = BrokerAdapterFactory::allForMerchant($pdo, 'merchant001');
 */
declare(strict_types=1);

require_once __DIR__ . '/BrokerAdapterInterface.php';
require_once __DIR__ . '/AlpacaAdapter.php';
require_once __DIR__ . '/SecretManager.php';

class BrokerAdapterFactory
{
    /**
     * Build an adapter from a merchant_broker_config row.
     *
     * @param  array $configRow  Must include broker_type from JOIN with broker_master
     * @return BrokerAdapterInterface
     * @throws RuntimeException if broker type unsupported or credentials missing
     */
    public static function fromConfig(array $configRow): BrokerAdapterInterface
    {
        $brokerType = strtolower($configRow['broker_type'] ?? '');

        switch ($brokerType) {
            case 'alpaca':
                return self::buildAlpacaAdapter($configRow);
            default:
                throw new RuntimeException("Unsupported broker type: {$brokerType}");
        }
    }

    /**
     * Look up config from DB and build adapter in one call.
     */
    public static function forMerchant(PDO $pdo, string $merchantId, string $brokerId): BrokerAdapterInterface
    {
        $stmt = $pdo->prepare("
            SELECT mbc.*, bm.broker_type
            FROM merchant_broker_config mbc
            JOIN broker_master bm ON bm.broker_id = mbc.broker_id
            WHERE mbc.merchant_id = ?
              AND mbc.broker_id = ?
              AND mbc.is_active = 1
            LIMIT 1
        ");
        $stmt->execute([$merchantId, $brokerId]);
        $configRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$configRow) {
            throw new RuntimeException(
                "No active broker config for merchant={$merchantId} broker={$brokerId}"
            );
        }

        return self::fromConfig($configRow);
    }

    /**
     * Get all active adapters for a merchant (one per configured broker).
     *
     * @return BrokerAdapterInterface[]  Keyed by broker_id
     */
    public static function allForMerchant(PDO $pdo, string $merchantId): array
    {
        $stmt = $pdo->prepare("
            SELECT mbc.*, bm.broker_type
            FROM merchant_broker_config mbc
            JOIN broker_master bm ON bm.broker_id = mbc.broker_id
            WHERE mbc.merchant_id = ?
              AND mbc.is_active = 1
            ORDER BY mbc.broker_id
        ");
        $stmt->execute([$merchantId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $adapters = [];
        foreach ($rows as $row) {
            try {
                $adapters[$row['broker_id']] = self::fromConfig($row);
            } catch (RuntimeException $e) {
                error_log("[BrokerAdapterFactory] Skipping {$row['broker_id']} for {$merchantId}: " . $e->getMessage());
            }
        }
        return $adapters;
    }

    // --- Private builders --------------------------------------------

    private static function buildAlpacaAdapter(array $configRow): AlpacaAdapter
    {
        $sm = new SecretManager();

        // Resolve credentials from Secrets Manager paths
        $apiKey    = null;
        $apiSecret = null;
        $firmAcct  = $configRow['sweep_account_id'] ?? '';

        if (!empty($configRow['broker_api_key_path'])) {
            $apiKey = $sm->get($configRow['broker_api_key_path']);
        }
        if (!empty($configRow['broker_api_secret_path'])) {
            $apiSecret = $sm->get($configRow['broker_api_secret_path']);
        }

        // Fallback to ENV during migration
        if (empty($apiKey)) {
            require_once __DIR__ . '/_loadenv.php';
            $apiKey = $_ENV['ALPACA_BROKER_API_KEY'] ?? '';
        }
        if (empty($apiSecret)) {
            require_once __DIR__ . '/_loadenv.php';
            $apiSecret = $_ENV['ALPACA_BROKER_API_SECRET'] ?? '';
        }
        if (empty($firmAcct)) {
            require_once __DIR__ . '/_loadenv.php';
            $firmAcct = $_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? '';
        }

        if (empty($apiKey) || empty($apiSecret)) {
            $merchant = $configRow['merchant_id'] ?? 'unknown';
            throw new RuntimeException(
                "Missing Alpaca credentials for merchant={$merchant}. " .
                "Check SecretManager paths or ENV fallback."
            );
        }

        $baseUrl = $_ENV['ALPACA_BROKER_BASE_URL']
                   ?? 'https://broker-api.sandbox.alpaca.markets';

        return new AlpacaAdapter([
            'api_key'         => $apiKey,
            'api_secret'      => $apiSecret,
            'firm_account_id' => $firmAcct,
            'base_url'        => $baseUrl,
        ]);
    }
}
