<?php
declare(strict_types=1);
/**
 * PlaidClient.php — Plaid API wrapper for StockLoyal
 *
 * Reads credentials from $_ENV (populated by _loadenv.php):
 *   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
 *
 * Usage:
 *   require_once __DIR__ . '/PlaidClient.php';
 *   $plaid = new PlaidClient();
 *   $result = $plaid->createLinkToken(['user' => ['client_user_id' => 'merchant001']]);
 */

class PlaidClient {

    private string $baseUrl;
    private string $clientId;
    private string $secret;

    public function __construct() {
        $env = $_ENV['PLAID_ENV'] ?? 'sandbox';

        $this->baseUrl = match ($env) {
            'production'  => 'https://production.plaid.com',
            'development' => 'https://development.plaid.com',
            default       => 'https://sandbox.plaid.com',
        };

        $this->clientId = $_ENV['PLAID_CLIENT_ID'] ?? '';
        $this->secret   = $_ENV['PLAID_SECRET']    ?? '';

        if ($this->clientId === '' || $this->secret === '') {
            throw new RuntimeException('Plaid credentials missing. Check PLAID_CLIENT_ID and PLAID_SECRET in .env.production');
        }
    }

    // ── Link ──────────────────────────────────────────────

    /**
     * Create a Link token for initializing Plaid Link on the frontend.
     * @param array $params  Must include 'user' => ['client_user_id' => '...']
     */
    public function createLinkToken(array $params): array {
        return $this->post('/link/token/create', array_merge([
            'client_name'   => 'StockLoyal',
            'products'      => ['transfer'],
            'country_codes' => ['US'],
            'language'      => 'en',
        ], $params));
    }

    /**
     * Exchange a public_token (from Link onSuccess) for a permanent access_token.
     */
    public function exchangePublicToken(string $publicToken): array {
        return $this->post('/item/public_token/exchange', [
            'public_token' => $publicToken,
        ]);
    }

    // ── Transfer Authorization ────────────────────────────

    /**
     * Authorize a transfer (balance + risk check).
     * Required fields: access_token, account_id, type, network, amount, ach_class, user.legal_name
     */
    public function createTransferAuthorization(array $params): array {
        return $this->post('/transfer/authorization/create', $params);
    }

    // ── Transfer Creation ─────────────────────────────────

    /**
     * Create a transfer after authorization is approved.
     * Required: authorization_id, access_token, account_id, type, network, amount
     */
    public function createTransfer(array $params): array {
        return $this->post('/transfer/create', $params);
    }

    /**
     * Get details of a specific transfer.
     */
    public function getTransfer(string $transferId): array {
        return $this->post('/transfer/get', [
            'transfer_id' => $transferId,
        ]);
    }

    // ── Transfer Events (Webhook sync) ────────────────────

    /**
     * Sync transfer events since a given event_id.
     * Returns events in chronological order with has_more flag.
     */
    public function syncTransferEvents(array $params): array {
        return $this->post('/transfer/event/sync', $params);
    }

    /**
     * List transfer events with filters.
     */
    public function listTransferEvents(array $params = []): array {
        return $this->post('/transfer/event/list', $params);
    }

    // ── Ledger (Fund movement to/from StockLoyal bank) ────

    /**
     * Withdraw funds from Plaid Ledger to StockLoyal's linked bank.
     */
    public function withdrawLedger(array $params): array {
        return $this->post('/transfer/ledger/withdraw', $params);
    }

    /**
     * Deposit funds into Plaid Ledger from StockLoyal's linked bank.
     */
    public function depositLedger(array $params): array {
        return $this->post('/transfer/ledger/deposit', $params);
    }

    /**
     * Get current Plaid Ledger balance (available + pending).
     */
    public function getLedgerBalance(): array {
        return $this->post('/transfer/balance/get', []);
    }

    // ── Sandbox-only helpers ──────────────────────────────

    /**
     * Simulate a transfer event in Sandbox (e.g., posted, settled, failed).
     * Only works in sandbox environment.
     */
    public function sandboxSimulateTransfer(string $transferId, string $testEventType): array {
        return $this->post('/sandbox/transfer/simulate', [
            'transfer_id'   => $transferId,
            'test_event_type' => $testEventType,  // posted, settled, failed, returned
        ]);
    }

    /**
     * Simulate a sweep in Sandbox.
     * Only works in sandbox environment.
     */
    public function sandboxSimulateSweep(): array {
        return $this->post('/sandbox/transfer/sweep/simulate', []);
    }

    // ── Internal HTTP ─────────────────────────────────────

    /**
     * POST to Plaid API. Automatically injects client_id and secret.
     *
     * @param  string $endpoint  e.g. '/transfer/create'
     * @param  array  $body      Request body (will be JSON-encoded)
     * @return array             Decoded response
     * @throws RuntimeException  On HTTP error or Plaid error response
     */
    private function post(string $endpoint, array $body): array {
        $body['client_id'] = $this->clientId;
        $body['secret']    = $this->secret;

        $url = $this->baseUrl . $endpoint;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($body),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Plaid-Version: 2020-09-14',
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr) {
            throw new RuntimeException("Plaid cURL error: {$curlErr}");
        }

        $data = json_decode($response, true);

        if (!is_array($data)) {
            throw new RuntimeException("Plaid: invalid JSON response (HTTP {$httpCode})");
        }

        if ($httpCode >= 400 || isset($data['error_type'])) {
            $errType = $data['error_type']    ?? 'UNKNOWN';
            $errCode = $data['error_code']    ?? $httpCode;
            $errMsg  = $data['error_message'] ?? $data['display_message'] ?? 'Unknown Plaid error';

            // Log for server-side debugging
            error_log("[PlaidClient] {$errType}/{$errCode}: {$errMsg} | endpoint={$endpoint}");

            throw new RuntimeException("Plaid: {$errMsg} [{$errCode}]");
        }

        return $data;
    }

    // ── Utility ───────────────────────────────────────────

    /**
     * Return the current Plaid environment name.
     */
    public function getEnvironment(): string {
        return $_ENV['PLAID_ENV'] ?? 'sandbox';
    }

    /**
     * Check if we're running in sandbox mode.
     */
    public function isSandbox(): bool {
        return $this->getEnvironment() === 'sandbox';
    }
}
