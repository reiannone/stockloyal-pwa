<?php
declare(strict_types=1);

/**
 * CurrencyAllianceAPI.php
 *
 * PHP client for the Currency Alliance API v3.
 * Handles HMAC-SHA256 request signing per the CA authentication spec.
 *
 * StockLoyal use-case: accept partner loyalty currency redemptions,
 * receive confirmed fiat value, pass to Alpaca order pipeline.
 *
 * Usage:
 *   $ca = new CurrencyAllianceAPI($_ENV['CA_PUBLIC_KEY'], $_ENV['CA_SECRET_KEY']);
 *   $member  = $ca->lookupMember('PARTNER_CURRENCY_CODE', ['id' => 'M12334532']);
 *   $sim     = $ca->simulateRedemption('PARTNER_CURRENCY_CODE', ['id' => 'M12334532'], 50.00, 'USD');
 *   $redeem  = $ca->executeRedemption('PARTNER_CURRENCY_CODE', ['id' => 'M12334532'], 50.00, 'USD', 'order-uuid-123');
 *   $cancel  = $ca->cancelRedemption('tx_abc123', 'ext-ref-123', 'Alpaca order failed');
 */
class CurrencyAllianceAPI
{
    private const PRODUCTION_URL = 'https://api.currencyalliance.com/public/v3.0';
    private const SANDBOX_URL    = 'https://sandbox.api.currencyalliance.com/public/v3.0';

    private string $publicKey;
    private string $secretKey;
    private string $baseUrl;

    /**
     * @param string $publicKey  pub_... from Loyalty API → Credentials
     * @param string $secretKey  sec_... from Loyalty API → Credentials
     * @param bool   $sandbox    true = use sandbox.api.currencyalliance.com
     */
    public function __construct(string $publicKey, string $secretKey, bool $sandbox = false)
    {
        $this->publicKey = $publicKey;
        $this->secretKey = $secretKey;
        $this->baseUrl   = $sandbox ? self::SANDBOX_URL : self::PRODUCTION_URL;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MEMBERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Validate a member exists and retrieve their balance.
     *
     * @param  string $loyaltyCurrency  Partner currency shortcode (e.g. "SCENEPLUS")
     * @param  array  $memberIdentifiers e.g. ['id' => 'M12334532']
     * @param  array  $loyaltySystemData Additional data required by some partners
     * @return array  Member object including balance
     * @throws RuntimeException on API error
     */
    public function lookupMember(
        string $loyaltyCurrency,
        array  $memberIdentifiers,
        array  $loyaltySystemData = []
    ): array {
        $body = [
            'loyalty_currency'           => $loyaltyCurrency,
            'loyalty_program_identifiers' => $memberIdentifiers,
        ];
        if (!empty($loyaltySystemData)) {
            $body['loyalty_system_data'] = $loyaltySystemData;
        }

        return $this->post('/members/lookup', $body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REDEMPTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Simulate a redemption — shows points cost without debiting anything.
     * Use this to show the member "X points = $Y investment" before confirming.
     *
     * @param  string     $loyaltyCurrency  Partner currency shortcode
     * @param  array      $memberIdentifiers e.g. ['id' => 'M12334532']
     * @param  float      $fiatAmount       Investment amount in USD
     * @param  string     $fiatCurrency     ISO 4217 (default "USD")
     * @param  string     $description      Product description shown to member
     * @return array      Simulation result including total_loyalty_amount, sufficient_balance
     */
    public function simulateRedemption(
        string $loyaltyCurrency,
        array  $memberIdentifiers,
        float  $fiatAmount,
        string $fiatCurrency  = 'USD',
        string $description   = 'Fractional stock investment via StockLoyal'
    ): array {
        $body = [
            'loyalty_currency' => $loyaltyCurrency,
            'member'           => $memberIdentifiers,
            'redemption_items' => [
                [
                    'category'            => 'general',
                    'fiat_amount'         => number_format($fiatAmount, 2, '.', ''),
                    'fiat_currency'       => $fiatCurrency,
                    'product_description' => $description,
                ],
            ],
        ];

        return $this->post('/redemptions/standard/simulate', $body);
    }

    /**
     * Execute a redemption — deducts points from the member's account.
     * Call this only after simulation confirmed sufficient_balance === true.
     * The returned fiat_amount is the confirmed cash value to pass to Alpaca.
     *
     * @param  string $loyaltyCurrency    Partner currency shortcode
     * @param  array  $memberIdentifiers  e.g. ['id' => 'M12334532']
     * @param  float  $fiatAmount         Investment amount in USD
     * @param  string $fiatCurrency       ISO 4217 (default "USD")
     * @param  string $externalReference  StockLoyal order UUID for reconciliation
     * @param  string $description        Product description shown in member's history
     * @param  array  $loyaltySystemData  Additional data required by some partners
     * @return array  Redemption result including transaction id and confirmed amounts
     */
    public function executeRedemption(
        string $loyaltyCurrency,
        array  $memberIdentifiers,
        float  $fiatAmount,
        string $fiatCurrency      = 'USD',
        string $externalReference = '',
        string $description       = 'Stock investment via StockLoyal',
        array  $loyaltySystemData = []
    ): array {
        $body = [
            'loyalty_currency'   => $loyaltyCurrency,
            'member'             => $memberIdentifiers,
            'external_reference' => $externalReference ?: uniqid('sl_', true),
            'reason'             => 'Stock investment',
            'redemption_items'   => [
                [
                    'category'            => 'general',
                    'fiat_amount'         => number_format($fiatAmount, 2, '.', ''),
                    'fiat_currency'       => $fiatCurrency,
                    'product_description' => $description,
                ],
            ],
        ];
        if (!empty($loyaltySystemData)) {
            $body['loyalty_system_data'] = $loyaltySystemData;
        }

        return $this->post('/redemptions/standard', $body);
    }

    /**
     * Cancel a redemption — refunds points to the member.
     * Call this if the Alpaca order fails AFTER a successful executeRedemption.
     *
     * @param  string $previousTransactionId  Transaction ID from executeRedemption response
     * @param  string $previousExternalRef    external_reference used in executeRedemption
     * @param  string $reason                 Human-readable cancel reason
     * @return array  Cancellation result
     */
    public function cancelRedemption(
        string $previousTransactionId,
        string $previousExternalRef,
        string $reason = 'Order could not be completed'
    ): array {
        $body = [
            'previous_transaction_id'  => $previousTransactionId,
            'previous_external_reference' => $previousExternalRef,
            'reason'                   => $reason,
        ];

        return $this->post('/redemptions/standard/cancel', $body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PARTNERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * List all active redemption partners (currency owners whose points
     * StockLoyal accepts as payment).
     */
    public function listRedemptionPartners(int $page = 1, int $pageSize = 50): array
    {
        return $this->get('/partners/currency-owners-for-redemption', [
            'page'      => $page,
            'page_size' => $pageSize,
        ]);
    }

    /**
     * Get details and required fields for a specific partner.
     */
    public function getPartner(string $partnerIdOrCurrency): array
    {
        return $this->get('/partners', ['partner_id' => $partnerIdOrCurrency]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSACTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retrieve a specific transaction by its Currency Alliance ID.
     */
    public function getTransaction(string $transactionId): array
    {
        return $this->get('/transactions/' . urlencode($transactionId), []);
    }

    /**
     * List all transactions (filterable by type, status, date range).
     */
    public function listTransactions(
        array  $filters   = [],
        int    $page      = 1,
        int    $pageSize  = 50
    ): array {
        $params = array_merge($filters, ['page' => $page, 'page_size' => $pageSize]);
        return $this->get('/transactions', $params);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FIAT CONVERSION UTILITY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Convert a fiat amount to loyalty currency units.
     * Useful for showing members "your $50 = X points" before they commit.
     */
    public function convertFiatToLoyalty(
        float  $amount,
        string $fiatCurrency,
        string $loyaltyCurrency,
        string $priceType = 'customers_perceived_value'
    ): array {
        $body = [
            'amount'          => number_format($amount, 2, '.', ''),
            'fiat_currency'   => $fiatCurrency,
            'loyalty_currency' => $loyaltyCurrency,
            'price_type'      => $priceType,
        ];

        return $this->post('/loyalty-currencies/fiat-convert', $body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HTTP LAYER
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Execute a POST request with HMAC-SHA256 body signature.
     */
    private function post(string $path, array $body): array
    {
        // The body string used for signing MUST match exactly what is sent.
        $bodyJson  = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = hash_hmac('sha256', $bodyJson, $this->secretKey);

        return $this->request('POST', $path, $bodyJson, [], $signature);
    }

    /**
     * Execute a GET request with HMAC-SHA256 query-string signature.
     * An empty query string is signed as an empty string per the CA spec.
     */
    private function get(string $path, array $params = []): array
    {
        $queryString = http_build_query($params);
        // CA spec: sign query string WITHOUT the leading "?"
        $signature   = hash_hmac('sha256', $queryString, $this->secretKey);

        return $this->request('GET', $path, null, $params, $signature);
    }

    /**
     * Core HTTP request using cURL.
     */
    private function request(
        string  $method,
        string  $path,
        ?string $bodyJson,
        array   $queryParams,
        string  $signature
    ): array {
        $url = $this->baseUrl . $path;
        if (!empty($queryParams)) {
            $url .= '?' . http_build_query($queryParams);
        }

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            sprintf(
                'Authorization: Credential=%s, Signature=%s',
                $this->publicKey,
                $signature
            ),
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyJson);
        }

        $responseBody = curl_exec($ch);
        $httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError    = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            throw new RuntimeException("CurrencyAlliance cURL error: $curlError");
        }

        $decoded = json_decode($responseBody, true);
        if ($decoded === null) {
            throw new RuntimeException(
                "CurrencyAlliance invalid JSON response (HTTP $httpCode): $responseBody"
            );
        }

        // 2xx = success; anything else = throw with details
        if ($httpCode < 200 || $httpCode >= 300) {
            $detail = is_array($decoded) ? json_encode($decoded) : $responseBody;
            throw new RuntimeException(
                "CurrencyAlliance API error HTTP $httpCode on $method $path: $detail"
            );
        }

        return $decoded;
    }
}
