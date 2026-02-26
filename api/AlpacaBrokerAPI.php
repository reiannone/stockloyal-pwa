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

    private function delete(string $endpoint): array {
        return $this->request('DELETE', $endpoint);
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

    /**
     * Update an existing brokerage account (contact, identity, disclosures).
     * Uses PATCH /v1/accounts/{account_id} — only sends non-empty sections.
     *
     * @param string $accountId  Alpaca broker account ID
     * @param array  $kycData    Same keys as createAccount (only changed fields needed)
     * @return array  ['success' => bool, 'data' => [...], 'error' => '...']
     */
    public function updateAccount(string $accountId, array $kycData): array {
        $body = [];

        // ── Contact ──
        $contact = [];
        if (!empty($kycData['email']))          $contact['email_address']  = $kycData['email'];
        if (!empty($kycData['phone']))          $contact['phone_number']   = $kycData['phone'];
        if (!empty($kycData['street_address'])) $contact['street_address'] = [$kycData['street_address']];
        if (!empty($kycData['city']))           $contact['city']           = $kycData['city'];
        if (!empty($kycData['state']))          $contact['state']          = $kycData['state'];
        if (!empty($kycData['postal_code']))    $contact['postal_code']    = $kycData['postal_code'];
        if (!empty($kycData['country']))        $contact['country']        = $kycData['country'];
        if (!empty($contact)) $body['contact'] = $contact;

        // ── Identity (exclude immutable fields: date_of_birth, tax_id, country_of_tax_residence) ──
        $identity = [];
        if (!empty($kycData['first_name']))     $identity['given_name']    = $kycData['first_name'];
        if (!empty($kycData['middle_name']))    $identity['middle_name']   = $kycData['middle_name'];
        if (!empty($kycData['last_name']))      $identity['family_name']   = $kycData['last_name'];
        if (!empty($kycData['funding_source'])) $identity['funding_source'] = [$kycData['funding_source']];
        if (!empty($identity)) $body['identity'] = $identity;

        // ── Disclosures ──
        $disclosures = [];
        if (isset($kycData['is_control_person']))        $disclosures['is_control_person']              = (bool)$kycData['is_control_person'];
        if (isset($kycData['is_affiliated']))            $disclosures['is_affiliated_exchange_or_finra'] = (bool)$kycData['is_affiliated'];
        if (isset($kycData['is_politically_exposed']))   $disclosures['is_politically_exposed']         = (bool)$kycData['is_politically_exposed'];
        if (isset($kycData['immediate_family_exposed'])) $disclosures['immediate_family_exposed']       = (bool)$kycData['immediate_family_exposed'];
        if (!empty($disclosures)) $body['disclosures'] = $disclosures;

        if (empty($body)) {
            return [
                'success'   => true,
                'http_code' => 200,
                'data'      => ['status' => 'UNCHANGED'],
            ];
        }

        return $this->patch('/v1/accounts/' . urlencode($accountId), $body);
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
     * Cancel an open order.
     */
    public function cancelOrder(string $accountId, string $orderId): array {
        return $this->delete(
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

    /**
     * Get a single position by symbol.
     */
    public function getPosition(string $accountId, string $symbol): array {
        return $this->get(
            '/v1/trading/accounts/' . urlencode($accountId) . '/positions/' . urlencode($symbol)
        );
    }

    /**
     * Close (sell) an entire position by symbol.
     * Alpaca handles fractional shares cleanly via DELETE.
     */
    public function closePosition(string $accountId, string $symbol): array {
        return $this->delete(
            '/v1/trading/accounts/' . urlencode($accountId) . '/positions/' . urlencode($symbol)
        );
    }

    /**
     * Close all positions for an account.
     */
    public function closeAllPositions(string $accountId): array {
        return $this->delete(
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

    // ─── Market / Assets ────────────────────────────────────

    /**
     * Get market clock — is the market open?
     * Returns: { timestamp, is_open, next_open, next_close }
     */
    public function getMarketClock(): array {
        return $this->get('/v1/clock');
    }

    /**
     * Get asset info by symbol.
     * Returns: { id, symbol, name, status, tradable, fractionable, ... }
     * Use to validate symbols before order submission.
     */
    // ─── Documents ───────────────────────────────────────────

    /**
     * List documents for an account.
     * @param string $accountId
     * @param array  $params  Optional filters: type, start, end
     *   type: trade_confirmation | account_statement | tax_1099_b | tax_1099_div | tax_w8 | tax_1042_s
     *   start: YYYY-MM-DD  end: YYYY-MM-DD
     */
    public function getDocuments(string $accountId, array $params = []): array {
        $query = http_build_query($params);
        $endpoint = '/v1/accounts/' . urlencode($accountId) . '/documents';
        if ($query) $endpoint .= '?' . $query;
        return $this->get($endpoint);
    }

    /**
     * Get a pre-signed download URL for a document (PDF).
     * Alpaca returns a 301 redirect to the actual URL.
     * We follow the redirect and return the final URL.
     */
    public function getDocumentDownloadUrl(string $accountId, string $documentId): array {
        $url = rtrim($this->baseUrl, '/') . '/v1/accounts/' . urlencode($accountId)
            . '/documents/' . urlencode($documentId) . '/download';

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Basic ' . base64_encode($this->apiKey . ':' . $this->apiSecret),
            'Accept: application/pdf',
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);  // Don't follow — capture redirect
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $redirectUrl = curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        curl_close($ch);

        // Parse Location header from response
        if ($httpCode === 301 || $httpCode === 302) {
            if (preg_match('/^Location:\s*(.+)$/mi', $response, $matches)) {
                return ['success' => true, 'url' => trim($matches[1])];
            }
            if ($redirectUrl) {
                return ['success' => true, 'url' => $redirectUrl];
            }
        }

        return [
            'success' => false,
            'error'   => "Document download failed (HTTP $httpCode)",
        ];
    }

    // ─── Assets ────────────────────────────────────────────

    public function getAsset(string $symbol): array {
        return $this->get('/v1/assets/' . urlencode($symbol));
    }

    // ─── Utility ────────────────────────────────────────────

    /**
     * Quick connectivity test — list accounts (limit 1).
     */
    public function testConnection(): array {
        return $this->get('/v1/accounts?limit=1');
    }
}
