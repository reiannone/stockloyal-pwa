<?php
/**
 * SecretManager.php — AWS Secrets Manager helper for StockLoyal
 * 
 * Provides cached access to secrets stored in AWS Secrets Manager.
 * On EC2, uses IAM instance profile automatically (no hardcoded credentials).
 * Locally (XAMPP), uses ~/.aws/credentials file.
 * 
 * Usage:
 *   require_once __DIR__ . '/SecretManager.php';
 * 
 *   // Get a single secret
 *   $apiKey = SecretManager::get('stockloyal/merchant001/alpaca/api_key');
 * 
 *   // Get all broker credentials for a merchant-broker pair
 *   $creds = SecretManager::getMerchantBrokerSecrets('merchant001', 'alpaca');
 *   // Returns: ['api_key' => '...', 'api_secret' => '...']
 * 
 *   // Get global Plaid app credentials
 *   $plaid = SecretManager::getPlaidAppCredentials();
 *   // Returns: ['client_id' => '...', 'secret' => '...']
 * 
 *   // Store a new secret (during merchant onboarding)
 *   SecretManager::put('stockloyal/merchant001/alpaca/api_key', 'AKXXXXXXXXX');
 */

require_once __DIR__ . '/vendor/autoload.php';

use Aws\SecretsManager\SecretsManagerClient;
use Aws\Exception\AwsException;

class SecretManager
{
    /** @var SecretsManagerClient|null */
    private static $client = null;

    /** @var array In-memory secret cache */
    private static $cache = [];

    /** @var array TTL tracking per cached key */
    private static $cacheExpiry = [];

    /** @var int Cache TTL in seconds (5 minutes) */
    private static $ttl = 300;

    /** @var string AWS region — matches your RDS/SES region */
    private static $region = 'us-east-1';

    // ─────────────────────────────────────────────
    //  Client
    // ─────────────────────────────────────────────

    /**
     * Get the Secrets Manager client (lazy singleton).
     * On EC2: uses instance profile automatically.
     * Locally: uses ~/.aws/credentials file.
     */
    private static function getClient(): SecretsManagerClient
    {
        if (self::$client === null) {
            self::$client = new SecretsManagerClient([
                'region'  => self::$region,
                'version' => 'latest',
                // No credentials specified — SDK auto-detects:
                //   EC2 → instance profile
                //   Local → ~/.aws/credentials
            ]);
        }
        return self::$client;
    }

    // ─────────────────────────────────────────────
    //  Core Read / Write
    // ─────────────────────────────────────────────

    /**
     * Get a single secret value by path.
     *
     * @param  string $path  e.g. "stockloyal/merchant001/alpaca/api_key"
     * @return string|null   The secret value, or null on failure
     */
    public static function get(string $path): ?string
    {
        // Check in-memory cache first
        if (isset(self::$cache[$path]) && time() < (self::$cacheExpiry[$path] ?? 0)) {
            return self::$cache[$path];
        }

        try {
            $result = self::getClient()->getSecretValue([
                'SecretId' => $path,
            ]);

            $value = $result['SecretString'] ?? null;

            if ($value !== null) {
                self::$cache[$path] = $value;
                self::$cacheExpiry[$path] = time() + self::$ttl;
            }

            return $value;
        } catch (AwsException $e) {
            error_log("[SecretManager] GET '{$path}' failed: " . $e->getAwsErrorCode() . ' — ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Get a secret that contains JSON, decoded to array.
     *
     * @param  string $path
     * @return array|null
     */
    public static function getJson(string $path): ?array
    {
        $raw = self::get($path);
        if ($raw === null) return null;
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * Store a new secret in Secrets Manager.
     * If the secret already exists, updates it instead.
     *
     * @param  string $path   e.g. "stockloyal/merchant001/alpaca/api_key"
     * @param  string $value  The secret value to store
     * @param  string $description  Optional description for new secrets
     * @return bool
     */
    public static function put(string $path, string $value, string $description = ''): bool
    {
        try {
            self::getClient()->createSecret([
                'Name'         => $path,
                'SecretString' => $value,
                'Description'  => $description ?: "StockLoyal secret: {$path}",
            ]);

            // Update cache
            self::$cache[$path] = $value;
            self::$cacheExpiry[$path] = time() + self::$ttl;
            return true;

        } catch (AwsException $e) {
            // Secret already exists — update it
            if ($e->getAwsErrorCode() === 'ResourceExistsException') {
                return self::update($path, $value);
            }
            error_log("[SecretManager] PUT '{$path}' failed: " . $e->getAwsErrorCode() . ' — ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Update an existing secret's value.
     *
     * @param  string $path
     * @param  string $value
     * @return bool
     */
    public static function update(string $path, string $value): bool
    {
        try {
            self::getClient()->putSecretValue([
                'SecretId'     => $path,
                'SecretString' => $value,
            ]);

            self::$cache[$path] = $value;
            self::$cacheExpiry[$path] = time() + self::$ttl;
            return true;

        } catch (AwsException $e) {
            error_log("[SecretManager] UPDATE '{$path}' failed: " . $e->getAwsErrorCode() . ' — ' . $e->getMessage());
            return false;
        }
    }

    // ─────────────────────────────────────────────
    //  Merchant-Broker Helpers
    // ─────────────────────────────────────────────

    /**
     * Get all broker credentials for a merchant-broker pair.
     * Fetches api_key and api_secret from Secrets Manager.
     *
     * @param  string $merchantId  e.g. "merchant001"
     * @param  string $brokerType  e.g. "alpaca", "drivewealth"
     * @return array  ['api_key' => '...', 'api_secret' => '...'] or empty on failure
     */
    public static function getMerchantBrokerSecrets(string $merchantId, string $brokerType): array
    {
        $prefix = "stockloyal/{$merchantId}/{$brokerType}";
        $secrets = [];

        $knownKeys = ['api_key', 'api_secret'];

        foreach ($knownKeys as $key) {
            $value = self::get("{$prefix}/{$key}");
            if ($value !== null) {
                $secrets[$key] = $value;
            }
        }

        return $secrets;
    }

    /**
     * Get the Alpaca firm/sweep account ID for a merchant.
     * This is also stored in merchant_broker_config.sweep_account_id,
     * but this method provides a Secrets Manager fallback.
     *
     * @param  string $merchantId
     * @return string|null
     */
    public static function getMerchantAlpacaFirmAccountId(string $merchantId): ?string
    {
        return self::get("stockloyal/{$merchantId}/alpaca/firm_account_id");
    }

    // ─────────────────────────────────────────────
    //  Plaid Helpers
    // ─────────────────────────────────────────────

    /**
     * Get global Plaid app credentials (shared across all merchants).
     *
     * @return array ['client_id' => '...', 'secret' => '...']
     */
    public static function getPlaidAppCredentials(): array
    {
        return [
            'client_id' => self::get('stockloyal/global/plaid/client_id'),
            'secret'    => self::get('stockloyal/global/plaid/secret'),
        ];
    }

    /**
     * Get a merchant's Plaid access token (for ACH funding).
     *
     * @param  string $merchantId
     * @return string|null
     */
    public static function getMerchantPlaidToken(string $merchantId): ?string
    {
        return self::get("stockloyal/{$merchantId}/plaid/access_token");
    }

    // ─────────────────────────────────────────────
    //  Market Data Helpers
    // ─────────────────────────────────────────────

    /**
     * Get global Alpaca market data API credentials.
     * These are shared — not per-merchant.
     *
     * @return array ['api_key' => '...', 'api_secret' => '...']
     */
    public static function getAlpacaDataCredentials(): array
    {
        return [
            'api_key'    => self::get('stockloyal/global/alpaca/data_api_key'),
            'api_secret' => self::get('stockloyal/global/alpaca/data_api_secret'),
        ];
    }

    // ─────────────────────────────────────────────
    //  Fallback: .env Override
    // ─────────────────────────────────────────────

    /**
     * Get a secret with .env fallback.
     * During migration, this lets you gradually move secrets to Secrets Manager
     * while keeping .env as a fallback for anything not yet migrated.
     *
     * @param  string $secretPath   Secrets Manager path
     * @param  string $envKey       $_ENV key to fall back to
     * @return string|null
     */
    public static function getWithFallback(string $secretPath, string $envKey): ?string
    {
        // Try Secrets Manager first
        $value = self::get($secretPath);
        if ($value !== null) {
            return $value;
        }

        // Fall back to .env
        $envValue = $_ENV[$envKey] ?? null;
        if ($envValue !== null) {
            error_log("[SecretManager] FALLBACK to \$_ENV['{$envKey}'] — secret '{$secretPath}' not found in Secrets Manager");
        }

        return $envValue;
    }

    // ─────────────────────────────────────────────
    //  Config-Driven Helpers
    // ─────────────────────────────────────────────

    /**
     * Load broker credentials using merchant_broker_config paths.
     * Pass the config row from the database and this resolves the actual secrets.
     *
     * @param  array $config  A row from merchant_broker_config
     * @return array ['api_key' => '...', 'api_secret' => '...', 'sweep_account_id' => '...']
     */
    public static function resolveConfigCredentials(array $config): array
    {
        $credentials = [
            'sweep_account_id' => $config['sweep_account_id'] ?? null,
        ];

        if (!empty($config['broker_api_key_path'])) {
            $credentials['api_key'] = self::get($config['broker_api_key_path']);
        }
        if (!empty($config['broker_api_secret_path'])) {
            $credentials['api_secret'] = self::get($config['broker_api_secret_path']);
        }
        if (!empty($config['plaid_access_token_path'])) {
            $credentials['plaid_access_token'] = self::get($config['plaid_access_token_path']);
        }

        return $credentials;
    }

    // ─────────────────────────────────────────────
    //  Cache Management
    // ─────────────────────────────────────────────

    /**
     * Clear the in-memory cache.
     * Useful between sweep job iterations or after key rotation.
     */
    public static function clearCache(): void
    {
        self::$cache = [];
        self::$cacheExpiry = [];
    }

    /**
     * Preload all secrets for a merchant-broker pair into cache.
     * Call at the start of a sweep job to front-load latency.
     *
     * @param  string $merchantId
     * @param  string $brokerType
     */
    public static function preload(string $merchantId, string $brokerType): void
    {
        self::getMerchantBrokerSecrets($merchantId, $brokerType);
        self::getMerchantPlaidToken($merchantId);
    }
}
