# StockLoyal Multi-Merchant Secrets & Configuration Architecture

## Current State

### What Exists Today

**`broker_master` table** (managed by `AdminBroker.jsx`)
- Stores broker metadata: name, logo, ACH bank details, order limits, support info
- Also stores `api_key` and `webhook_url` — these are **global per broker**, not per merchant
- One row per broker (e.g., Alpaca, DriveWealth, Public.com)

**`merchant_brokers` junction table** (managed by `Admin.jsx` broker checkboxes)
- Simple many-to-many link: `merchant_id` ↔ `broker_id`
- No configuration, no credentials, no sweep account info
- Just controls which brokers appear in `SelectBroker.jsx` for that merchant's members

**`merchants` table** (managed by `Admin.jsx`)
- Stores merchant config: name, logo, conversion rates, tiers, sweep schedule
- Also stores merchant-level `api_key`, `webhook_url`, and Plaid bank link
- Single Plaid connection per merchant via `MerchantBankLink` component

**`SelectBroker.jsx`** (member-facing)
- Loads allowed brokers filtered by merchant's `merchant_brokers` assignments
- Member selects one broker, credentials stored on wallet + `broker_credentials` table
- Distinguishes Alpaca (API-based) vs webhook broker flows

### What Needs to Change

The core problem: credentials and sweep account configuration are stored at the wrong level. `broker_master.api_key` is one key for all merchants. But each merchant-broker pair needs its own Alpaca firm account, its own API credentials, and its own funding pipe. The `merchant_brokers` junction table needs to evolve from a simple link into a full configuration record.

---

## New Data Model

### Table: `brokers` (rename from `broker_master`)

**Purpose:** Broker metadata only. No credentials, no per-merchant config.

This table stays mostly the same but **loses** the `api_key` field (moves to `merchant_broker_config`). ACH bank details stay here only if they represent the broker's standard receiving bank (same for all merchants). If each merchant gets a unique receiving account at the broker, those move to the config table too.

```sql
CREATE TABLE brokers (
  broker_id          VARCHAR(50) PRIMARY KEY,
  broker_name        VARCHAR(100) NOT NULL,
  broker_type        ENUM('alpaca', 'drivewealth', 'public', 'webhook') DEFAULT 'webhook',
  logo_url           VARCHAR(500),
  
  -- Broker's standard receiving bank (if universal)
  ach_bank_name      VARCHAR(100),
  ach_routing_num    VARCHAR(20),
  ach_account_num    VARCHAR(50),
  ach_account_type   ENUM('checking', 'savings', 'other') DEFAULT 'checking',
  
  -- Order constraints (defaults, can be overridden per merchant)
  min_order_amount   DECIMAL(10,2) DEFAULT 1.00,
  max_order_amount   DECIMAL(10,2) DEFAULT 100000.00,
  max_securities_per_order INT DEFAULT 5,
  default_order_type ENUM('market', 'limit', 'stop', 'stop_limit', 'gtc') DEFAULT 'market',
  
  -- Support
  support_phone      VARCHAR(30),
  support_email      VARCHAR(100),
  contact_name       VARCHAR(100),
  website_url        VARCHAR(500),
  
  -- Address
  address_line1      VARCHAR(200),
  address_line2      VARCHAR(200),
  address_city       VARCHAR(100),
  address_state      VARCHAR(50),
  address_zip        VARCHAR(20),
  address_country    VARCHAR(50) DEFAULT 'USA',
  
  -- Capabilities (for broker adapter logic)
  supports_fractional    TINYINT(1) DEFAULT 0,
  supports_jnlc          TINYINT(1) DEFAULT 0,
  settlement_days        INT DEFAULT 2,
  api_base_url           VARCHAR(500),
  
  broker_created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  broker_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Fields REMOVED from `broker_master`:**
- `api_key` → moves to `merchant_broker_config` (via Secrets Manager)
- `webhook_url` → stays on broker if it's a broker-level endpoint, OR moves to config if per-merchant

---

### Table: `merchant_broker_config` (replaces `merchant_brokers`)

**Purpose:** The junction table that holds everything needed to operate a merchant-broker financial pipe. One row per merchant-broker relationship.

```sql
CREATE TABLE merchant_broker_config (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id           VARCHAR(50) NOT NULL,
  broker_id             VARCHAR(50) NOT NULL,
  
  -- Sweep account at this broker for this merchant
  sweep_account_id      VARCHAR(100),         -- e.g., Alpaca firm account ID
  sweep_account_status  ENUM('pending', 'active', 'suspended', 'closed') DEFAULT 'pending',
  
  -- Secrets Manager references (paths, NOT actual secrets)
  broker_api_key_path   VARCHAR(300),         -- e.g., stockloyal/merchant-42/alpaca/api_key
  broker_api_secret_path VARCHAR(300),        -- e.g., stockloyal/merchant-42/alpaca/api_secret
  
  -- Funding config
  funding_method        ENUM('plaid', 'wire', 'manual', 'none') DEFAULT 'none',
  plaid_access_token_path VARCHAR(300),       -- Secrets Manager path to Plaid access token
  plaid_funding_status  ENUM('not_linked', 'pending', 'active', 'failed') DEFAULT 'not_linked',
  
  -- Per-merchant order limit overrides (NULL = use broker defaults)
  min_order_amount      DECIMAL(10,2) DEFAULT NULL,
  max_order_amount      DECIMAL(10,2) DEFAULT NULL,
  
  -- Webhook for this merchant-broker pair (if different from broker-level)
  webhook_url           VARCHAR(500),
  webhook_api_key_path  VARCHAR(300),         -- Secrets Manager path
  
  -- Operational
  is_active             TINYINT(1) DEFAULT 1,
  daily_funding_limit   DECIMAL(12,2) DEFAULT NULL,
  
  -- Audit
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uq_merchant_broker (merchant_id, broker_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id),
  FOREIGN KEY (broker_id) REFERENCES brokers(broker_id)
);
```

---

### AWS Secrets Manager Structure

```
stockloyal/
├── global/
│   ├── plaid/
│   │   ├── client_id              ← StockLoyal's Plaid app credentials (shared)
│   │   └── secret
│   └── alpaca/
│       └── broker_api_base        ← (optional) if using sandbox vs production
│
├── {merchant_id}/
│   ├── plaid/
│   │   └── access_token           ← One per merchant (hybrid model)
│   ├── alpaca/
│   │   ├── api_key                ← Per merchant-broker pair
│   │   └── api_secret
│   ├── drivewealth/
│   │   ├── api_key
│   │   └── api_secret
│   └── public/
│       ├── api_key
│       └── api_secret
```

**Naming convention:** `stockloyal/{merchant_id}/{broker_type}/{secret_name}`

**IAM policy scoping:** A future microservice handling only Plaid can be restricted to `stockloyal/*/plaid/*`. A sweep job for a specific merchant can be scoped to `stockloyal/{merchant_id}/*`.

---

## PHP SecretManager Helper Class

```php
<?php
// lib/SecretManager.php

use Aws\SecretsManager\SecretsManagerClient;

class SecretManager {
    private static $client = null;
    private static $cache = [];       // In-memory cache per request
    private static $cacheExpiry = [];  // TTL tracking
    private static $ttl = 300;        // 5 minutes default

    /**
     * Get the Secrets Manager client (lazy singleton)
     */
    private static function getClient(): SecretsManagerClient {
        if (self::$client === null) {
            self::$client = new SecretsManagerClient([
                'region'  => getenv('AWS_REGION') ?: 'us-east-1',
                'version' => 'latest',
                // Uses EC2 instance profile — no hardcoded credentials
            ]);
        }
        return self::$client;
    }

    /**
     * Get a secret value by its Secrets Manager path
     * 
     * @param string $path  e.g., "stockloyal/merchant-42/alpaca/api_key"
     * @return string|null  The secret value, or null on failure
     */
    public static function get(string $path): ?string {
        // Check in-memory cache
        if (isset(self::$cache[$path]) && time() < (self::$cacheExpiry[$path] ?? 0)) {
            return self::$cache[$path];
        }

        try {
            $result = self::getClient()->getSecretValue([
                'SecretId' => $path,
            ]);
            $value = $result['SecretString'] ?? null;

            // Cache it
            if ($value !== null) {
                self::$cache[$path] = $value;
                self::$cacheExpiry[$path] = time() + self::$ttl;
            }

            return $value;
        } catch (\Exception $e) {
            error_log("[SecretManager] Failed to get secret '{$path}': " . $e->getMessage());
            return null;
        }
    }

    /**
     * Get a JSON secret and decode it
     * Useful if storing multiple values in one secret
     */
    public static function getJson(string $path): ?array {
        $raw = self::get($path);
        if ($raw === null) return null;
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * Bulk pre-fetch secrets for a merchant-broker pair
     * Call this at the start of a sweep job to avoid per-call latency
     * 
     * @param string $merchantId
     * @param string $brokerType  e.g., "alpaca", "drivewealth"
     * @return array  Associative array of secret_name => value
     */
    public static function preloadMerchantBrokerSecrets(
        string $merchantId, 
        string $brokerType
    ): array {
        $secrets = [];
        $prefix = "stockloyal/{$merchantId}/{$brokerType}";
        
        // Known secret names per broker type
        $knownKeys = ['api_key', 'api_secret'];
        
        foreach ($knownKeys as $key) {
            $path = "{$prefix}/{$key}";
            $value = self::get($path);
            if ($value !== null) {
                $secrets[$key] = $value;
            }
        }

        return $secrets;
    }

    /**
     * Pre-fetch Plaid access token for a merchant
     */
    public static function getMerchantPlaidToken(string $merchantId): ?string {
        return self::get("stockloyal/{$merchantId}/plaid/access_token");
    }

    /**
     * Get global Plaid app credentials
     */
    public static function getPlaidAppCredentials(): array {
        return [
            'client_id' => self::get('stockloyal/global/plaid/client_id'),
            'secret'    => self::get('stockloyal/global/plaid/secret'),
        ];
    }

    /**
     * Store a new secret (used during merchant onboarding)
     * 
     * @param string $path   Secrets Manager path
     * @param string $value  The secret value to store
     * @return bool
     */
    public static function put(string $path, string $value): bool {
        try {
            self::getClient()->createSecret([
                'Name'         => $path,
                'SecretString' => $value,
            ]);
            // Update cache
            self::$cache[$path] = $value;
            self::$cacheExpiry[$path] = time() + self::$ttl;
            return true;
        } catch (\Aws\SecretsManager\Exception\SecretsManagerException $e) {
            // If secret already exists, update it
            if ($e->getAwsErrorCode() === 'ResourceExistsException') {
                return self::update($path, $value);
            }
            error_log("[SecretManager] Failed to put secret '{$path}': " . $e->getMessage());
            return false;
        }
    }

    /**
     * Update an existing secret
     */
    public static function update(string $path, string $value): bool {
        try {
            self::getClient()->putSecretValue([
                'SecretId'     => $path,
                'SecretString' => $value,
            ]);
            self::$cache[$path] = $value;
            self::$cacheExpiry[$path] = time() + self::$ttl;
            return true;
        } catch (\Exception $e) {
            error_log("[SecretManager] Failed to update secret '{$path}': " . $e->getMessage());
            return false;
        }
    }

    /**
     * Clear the in-memory cache (call between sweep job iterations if needed)
     */
    public static function clearCache(): void {
        self::$cache = [];
        self::$cacheExpiry = [];
    }
}
```

---

## Broker Adapter Interface

```php
<?php
// lib/BrokerAdapter.php

interface BrokerAdapterInterface {
    /**
     * Initialize with merchant-broker credentials
     */
    public function __construct(array $credentials, array $config);

    /**
     * Create a new member brokerage account
     */
    public function createAccount(array $memberData): array;

    /**
     * Update an existing member account (KYC changes, etc.)
     */
    public function updateAccount(string $accountId, array $memberData): array;

    /**
     * Get account details/status
     */
    public function getAccount(string $accountId): array;

    /**
     * Journal/transfer funds from sweep account to member account
     */
    public function fundMemberAccount(string $accountId, float $amount, string $referenceId): array;

    /**
     * Execute a trade order
     */
    public function executeOrder(string $accountId, array $orderData): array;

    /**
     * Get member positions/holdings
     */
    public function getPositions(string $accountId): array;

    /**
     * Get account balance
     */
    public function getBalance(string $accountId): array;

    /**
     * Get market calendar (trading days, holidays)
     */
    public function getMarketCalendar(string $start, string $end): array;

    /**
     * Get sweep/firm account balance
     */
    public function getSweepBalance(): array;
}
```

### Factory Pattern for Instantiation

```php
<?php
// lib/BrokerAdapterFactory.php

class BrokerAdapterFactory {
    
    /**
     * Create a broker adapter for a specific merchant-broker pair
     * 
     * @param int $configId  merchant_broker_config.id
     * @return BrokerAdapterInterface
     */
    public static function fromConfig(int $configId): BrokerAdapterInterface {
        global $pdo;  // or inject your DB connection
        
        // Load the config row
        $stmt = $pdo->prepare("
            SELECT mbc.*, b.broker_type, b.api_base_url
            FROM merchant_broker_config mbc
            JOIN brokers b ON b.broker_id = mbc.broker_id
            WHERE mbc.id = ? AND mbc.is_active = 1
        ");
        $stmt->execute([$configId]);
        $config = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$config) {
            throw new \RuntimeException("No active merchant_broker_config found for id={$configId}");
        }
        
        // Load credentials from Secrets Manager
        $credentials = [];
        if ($config['broker_api_key_path']) {
            $credentials['api_key'] = SecretManager::get($config['broker_api_key_path']);
        }
        if ($config['broker_api_secret_path']) {
            $credentials['api_secret'] = SecretManager::get($config['broker_api_secret_path']);
        }
        $credentials['sweep_account_id'] = $config['sweep_account_id'];
        $credentials['api_base_url'] = $config['api_base_url'];
        
        // Instantiate the right adapter
        switch ($config['broker_type']) {
            case 'alpaca':
                return new AlpacaAdapter($credentials, $config);
            case 'drivewealth':
                return new DriveWealthAdapter($credentials, $config);
            case 'public':
                return new PublicAdapter($credentials, $config);
            default:
                return new WebhookBrokerAdapter($credentials, $config);
        }
    }

    /**
     * Create adapter for a specific merchant + broker combo
     */
    public static function forMerchantBroker(
        string $merchantId, 
        string $brokerId
    ): BrokerAdapterInterface {
        global $pdo;
        
        $stmt = $pdo->prepare("
            SELECT id FROM merchant_broker_config 
            WHERE merchant_id = ? AND broker_id = ? AND is_active = 1
        ");
        $stmt->execute([$merchantId, $brokerId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            throw new \RuntimeException(
                "No active config for merchant={$merchantId}, broker={$brokerId}"
            );
        }
        
        return self::fromConfig((int)$row['id']);
    }
}
```

### Usage in Existing Pipeline Code

```php
// BEFORE (global credentials):
$alpaca = new AlpacaClient(getenv('ALPACA_API_KEY'), getenv('ALPACA_API_SECRET'));
$alpaca->createJournal($firmAccountId, $memberAccountId, $amount);

// AFTER (config-driven):
$adapter = BrokerAdapterFactory::forMerchantBroker($merchantId, $brokerId);
$adapter->fundMemberAccount($memberAccountId, $amount, $orderId);
```

---

## Migration Plan

### Phase 1: Schema & Secrets Manager Setup

1. **Create `merchant_broker_config` table** with the schema above
2. **Migrate existing `merchant_brokers` data** — for each existing assignment, create a config row with `is_active = 1` and null credential paths
3. **Set up AWS Secrets Manager** — create the namespace structure, store existing Alpaca credentials under the appropriate merchant path
4. **Install AWS SDK for PHP** — `composer require aws/aws-sdk-php`
5. **Create the `SecretManager` helper class**
6. **Ensure EC2 IAM role** has `secretsmanager:GetSecretValue`, `secretsmanager:CreateSecret`, `secretsmanager:PutSecretValue` scoped to `arn:aws:secretsmanager:*:*:secret:stockloyal/*`

### Phase 2: Backend Refactor

7. **Create `BrokerAdapterInterface`** and `AlpacaAdapter` implementation
8. **Create `BrokerAdapterFactory`**
9. **Refactor existing Alpaca PHP endpoints** to use the factory pattern instead of global env vars:
   - `validate-broker-credentials.php` — look up merchant from member, get config
   - `create-alpaca-account.php` — use merchant-specific Alpaca credentials
   - `journal-funding.php` — use merchant-specific sweep account + credentials
   - `broker-execution.php` — use merchant-specific credentials for order execution
   - `sweep_process.php` — iterate merchant_broker_configs, use per-config credentials
10. **Create new endpoints:**
    - `get-merchant-broker-config.php` — returns config for a merchant-broker pair (admin use)
    - `save-merchant-broker-config.php` — upserts config including provisioning secrets
    - `test-broker-connection.php` — validates credentials by making a test API call

### Phase 3: Frontend Changes

11. **Evolve Admin.jsx broker section** — replace checkbox grid with config panel per broker
    - Each assigned broker shows: sweep account ID, credential status, funding status, connection test button
    - "Configure" button per broker opens detailed config panel
    - Credentials are never shown in the UI — only status (configured/not configured, last tested)
12. **AdminBroker.jsx** — remove `api_key` field, add `broker_type` and `capabilities` fields
13. **SelectBroker.jsx** — no visible changes needed; backend changes are transparent

### Phase 4: Plaid Integration Update

14. **Move Plaid access token** from wherever it currently lives to Secrets Manager at `stockloyal/{merchant_id}/plaid/access_token`
15. **Update `MerchantBankLink` component** — on successful Plaid Link, store token via new endpoint that writes to Secrets Manager
16. **Update Plaid transfer initiation** — pull access token from Secrets Manager per merchant, initiate separate transfers per broker sweep account

---

## Admin.jsx Broker Section Redesign

### Current: Simple Checkbox Grid
```
☑ Alpaca    ☑ DriveWealth    ☐ Public.com
[Save Broker Assignments]
```

### New: Configuration Cards Per Broker

```
┌─────────────────────────────────────────────────┐
│ 🟢 Alpaca Securities                    [Remove] │
│                                                   │
│ Sweep Account: ACCT-12345       Status: Active    │
│ API Credentials: ✅ Configured   Last Test: 2m ago │
│ Funding: ✅ Plaid ACH linked                      │
│                                                   │
│ [Test Connection]  [Configure Credentials]        │
├─────────────────────────────────────────────────┤
│ 🟡 DriveWealth                          [Remove] │
│                                                   │
│ Sweep Account: —                Status: Pending   │
│ API Credentials: ❌ Not configured                │
│ Funding: ❌ Not linked                            │
│                                                   │
│ [Configure Credentials]                           │
└─────────────────────────────────────────────────┘

[+ Add Broker]
```

The "Configure Credentials" modal collects the API key and secret, sends them to the backend, which stores them directly in Secrets Manager and saves only the path reference in `merchant_broker_config`. **Raw credentials never persist in MySQL.**

---

## Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Secret storage | AWS Secrets Manager | Encrypted, auditable, IAM-scoped, $0.40/secret/month |
| DB stores | Path references only | Secrets never touch MySQL |
| Network provider scope | Instance-level (env config) | One StockLoyal deployment per network provider |
| Plaid model | One access token per merchant, separate transfers per broker | Avoids custodial liability, single onboarding interaction |
| Funding flow | Issuer bank → broker sweep directly | StockLoyal never holds funds |
| Broker abstraction | Adapter interface + factory | Adding broker #2 = implement interface, not rewrite pipeline |
| Member broker selection | One broker per member, stored on wallet | Already built, no changes needed |
| Credential caching | In-memory per-request with 5min TTL | Avoids Secrets Manager rate limits under load |
| Onboarding | Hands-on per merchant | No self-service provisioning pipeline needed |
