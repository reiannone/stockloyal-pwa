<?php
// api/AlpacaBrokerAPI.php
// Helper class for Alpaca Broker API integration
declare(strict_types=1);

class AlpacaBrokerAPI {

    private string $baseUrl;
    private string $apiKey;
    private string $apiSecret;

    public function __construct() {
        $this->baseUrl   = $_ENV['ALPACA_BROKER_BASE_URL'] ?? 'https://broker-api.sandbox.alpaca.markets';
        $this->apiKey    = $_ENV['ALPACA_BROKER_API_KEY']    ?? '';
        $this->apiSecret = $_ENV['ALPACA_BROKER_API_SECRET'] ?? '';

        if (empty($this->apiKey) || empty($this->apiSecret)) {
            throw new \RuntimeException('Alpaca Broker API credentials not configured');
        }
    }

    // ─── Core HTTP Methods ──────────────────────────────────

    private function request(string $method, string $endpoint, ?array $body = null): array {
        $url = rtrim($this->baseUrl, '/') . $endpoint;

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Basic ' . base64_encode($this->apiKey . ':' . $this->apiSecret),
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
        ]);

        if ($body !== null && in_array(strtoupper($method), ['POST', 'PATCH', 'PUT'])) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            error_log("[AlpacaBrokerAPI] cURL error on {$method} {$endpoint}: {$curlError}");
            return [
                'success'   => false,
                'http_code' => 0,
                'error'     => "Connection failed: {$curlError}",
            ];
        }

        $decoded = json_decode($response, true) ?? [];

        if ($httpCode >= 200 && $httpCode < 300) {
            return [
                'success'   => true,
                'http_code' => $httpCode,
                'data'      => $decoded,
            ];
        }

        error_log("[AlpacaBrokerAPI] HTTP {$httpCode} on {$method} {$endpoint}: {$response}");
        return [
            'success'   => false,
            'http_code' => $httpCode,
            'error'     => $decoded['message'] ?? $decoded['error'] ?? "HTTP {$httpCode}",
            'data'      => $decoded,
        ];
    }

    private function get(string $endpoint): array {
        return $this->request('GET', $endpoint);
    }

    private function post(string $endpoint, array $body): array {
        return $this->request('POST', $endpoint, $body);
    }

    private function patch(string $endpoint, array $body): array {
        return $this->request('PATCH', $endpoint, $body);
    }

    // ─── Account Management ─────────────────────────────────

    /**
     * Search for an account by email address.
     * Returns the account data if found, or null.
     */
    public function findAccountByEmail(string $email): ?array {
        $result = $this->get('/v1/accounts?query=' . urlencode($email));

        if (!$result['success']) {
            return null;
        }

        // Response is an array of accounts
        $accounts = $result['data'];
        if (!is_array($accounts) || empty($accounts)) {
            return null;
        }

        // Find exact email match
        foreach ($accounts as $acct) {
            $acctEmail = $acct['contact']['email_address'] ?? '';
            if (strtolower($acctEmail) === strtolower($email)) {
                return $acct;
            }
        }

        // If only one result, assume it's the match
        if (count($accounts) === 1) {
            return $accounts[0];
        }

        return null;
    }

    /**
     * Get account by Alpaca account ID.
     */
    public function getAccount(string $accountId): array {
        return $this->get('/v1/accounts/' . urlencode($accountId));
    }

    /**
     * Get trading details for an account.
     */
    public function getTradingAccount(string $accountId): array {
        return $this->get('/v1/trading/accounts/' . urlencode($accountId) . '/account');
    }

    /**
     * Create a new brokerage account with KYC data.
     *
     * @param array $kycData  Must include: contact, identity, disclosures, agreements
     * @return array  ['success' => bool, 'data' => [...], 'error' => '...']
     */
    public function createAccount(array $kycData): array {
        // Build the request body
        $body = [
            'contact' => [
                'email_address'  => $kycData['email'],
                'phone_number'   => $kycData['phone'] ?? '',
                'street_address' => [$kycData['street_address']],
                'city'           => $kycData['city'],
                'state'          => $kycData['state'] ?? '',
                'postal_code'    => $kycData['postal_code'] ?? '',
                'country'        => $kycData['country'] ?? 'USA',
            ],
            'identity' => [
                'given_name'               => $kycData['first_name'],
                'family_name'              => $kycData['last_name'],
                'date_of_birth'            => $kycData['date_of_birth'], // YYYY-MM-DD
                'country_of_tax_residence' => $kycData['tax_country'] ?? 'USA',
                'funding_source'           => [$kycData['funding_source'] ?? 'employment_income'],
            ],
            'disclosures' => [
                'is_control_person'              => (bool)($kycData['is_control_person'] ?? false),
                'is_affiliated_exchange_or_finra' => (bool)($kycData['is_affiliated'] ?? false),
                'is_politically_exposed'         => (bool)($kycData['is_politically_exposed'] ?? false),
                'immediate_family_exposed'       => (bool)($kycData['immediate_family_exposed'] ?? false),
            ],
            'agreements' => $this->buildAgreements($kycData['ip_address'] ?? '0.0.0.0'),
        ];

        // Optional: tax_id (SSN) for US residents
        if (!empty($kycData['tax_id'])) {
            $body['identity']['tax_id'] = $kycData['tax_id'];
            $body['identity']['tax_id_type'] = $kycData['tax_id_type'] ?? 'USA_SSN';
        }

        // Optional: middle name
        if (!empty($kycData['middle_name'])) {
            $body['identity']['middle_name'] = $kycData['middle_name'];
        }

        // Optional: trusted contact
        if (!empty($kycData['trusted_contact_name']) && !empty($kycData['trusted_contact_email'])) {
            $names = explode(' ', $kycData['trusted_contact_name'], 2);
            $body['trusted_contact'] = [
                'given_name'    => $names[0],
                'family_name'   => $names[1] ?? '',
                'email_address' => $kycData['trusted_contact_email'],
            ];
        }

        return $this->post('/v1/accounts', $body);
    }

    /**
     * Build the required agreements array with current timestamp.
     */
    private function buildAgreements(string $ipAddress): array {
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $agreements = ['customer_agreement', 'account_agreement', 'margin_agreement'];

        return array_map(function($agreement) use ($now, $ipAddress) {
            return [
                'agreement' => $agreement,
                'signed_at' => $now,
                'ip_address' => $ipAddress,
            ];
        }, $agreements);
    }

    // ─── Trading ────────────────────────────────────────────

    /**
     * Submit an order for an account.
     */
    public function createOrder(string $accountId, array $orderData): array {
        return $this->post(
            '/v1/trading/accounts/' . urlencode($accountId) . '/orders',
            $orderData
        );
    }

    /**
     * Get all orders for an account.
     */
    public function getOrders(string $accountId, string $status = 'all'): array {
        return $this->get(
            '/v1/trading/accounts/' . urlencode($accountId) . '/orders?status=' . $status
        );
    }

    /**
     * Get a single order by its Alpaca order ID.
     * Used to check execution status (filled, partially_filled, canceled, etc.)
     */
    public function getOrder(string $accountId, string $orderId): array {
        return $this->get(
            '/v1/trading/accounts/' . urlencode($accountId) . '/orders/' . urlencode($orderId)
        );
    }

    /**
     * Get positions for an account.
     */
    public function getPositions(string $accountId): array {
        return $this->get(
            '/v1/trading/accounts/' . urlencode($accountId) . '/positions'
        );
    }

    // ─── Funding ────────────────────────────────────────────

    /**
     * Journal cash from firm sweep account to a member's account (instant funding).
     * The firm_account_id can be set via ALPACA_FIRM_ACCOUNT_ID env var,
     * or passed explicitly.
     */
    public function journalCashToAccount(string $toAccountId, string $amount, ?string $fromAccountId = null): array {
        $firmId = $fromAccountId 
            ?? ($_ENV['ALPACA_FIRM_ACCOUNT_ID'] ?? '');

        $payload = [
            'entry_type'  => 'JNLC',
            'to_account'  => $toAccountId,
            'amount'      => $amount,
            'description' => 'StockLoyal points conversion funding',
        ];

        if (!empty($firmId)) {
            $payload['from_account'] = $firmId;
        }

        return $this->post('/v1/journals', $payload);
    }

    /**
     * Get transfers for an account.
     */
    public function getTransfers(string $accountId): array {
        return $this->get('/v1/accounts/' . urlencode($accountId) . '/transfers');
    }

    // ─── Utility ────────────────────────────────────────────

    /**
     * Quick connectivity test — list accounts (limit 1).
     */
    public function testConnection(): array {
        return $this->get('/v1/accounts?limit=1');
    }
}
