<?php
/**
 * AlpacaAdapter.php
 *
 * Wraps AlpacaBrokerAPI behind the BrokerAdapterInterface.
 * Translates between the normalized interface and Alpaca-specific API calls.
 *
 * Usage:
 *   $adapter = new AlpacaAdapter($credentials);
 *   // or via factory:
 *   $adapter = BrokerAdapterFactory::fromConfig($configRow);
 */
declare(strict_types=1);

require_once __DIR__ . '/BrokerAdapterInterface.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

class AlpacaAdapter implements BrokerAdapterInterface
{
    private AlpacaBrokerAPI $api;
    private string $firmAccountId;

    /**
     * @param array $credentials [
     *   'api_key'         => string,
     *   'api_secret'      => string,
     *   'firm_account_id' => string,
     *   'base_url'        => string (optional),
     * ]
     */
    public function __construct(array $credentials)
    {
        $this->api = new AlpacaBrokerAPI($credentials);
        $this->firmAccountId = $credentials['firm_account_id'] ?? '';
    }

    // --- Account Lifecycle -------------------------------------------

    public function createAccount(array $kycData): array
    {
        return $this->api->createAccount($kycData);
    }

    public function updateAccount(string $accountId, array $kycData): array
    {
        return $this->api->updateAccount($accountId, $kycData);
    }

    public function getAccount(string $accountId): array
    {
        return $this->api->getAccount($accountId);
    }

    public function findAccountByEmail(string $email): ?array
    {
        return $this->api->findAccountByEmail($email);
    }

    // --- Order Execution ---------------------------------------------

    public function submitOrder(string $accountId, array $orderData): array
    {
        // Normalize to Alpaca format
        $alpacaOrder = [
            'symbol'        => strtoupper($orderData['symbol']),
            'notional'      => number_format((float)($orderData['notional'] ?? $orderData['amount'] ?? 0), 2, '.', ''),
            'side'          => $orderData['side'] ?? 'buy',
            'type'          => $orderData['type'] ?? 'market',
            'time_in_force' => $orderData['time_in_force'] ?? 'day',
        ];

        // If shares specified instead of notional
        if (!empty($orderData['qty']) || !empty($orderData['shares'])) {
            unset($alpacaOrder['notional']);
            $alpacaOrder['qty'] = (string)($orderData['qty'] ?? $orderData['shares']);
        }

        $result = $this->api->createOrder($accountId, $alpacaOrder);

        // Normalize response: ensure 'order_id' key exists
        if ($result['success'] && isset($result['data'])) {
            $result['data']['order_id'] = $result['data']['id'] ?? null;
        }

        return $result;
    }

    public function getOrderStatus(string $accountId, string $orderId): array
    {
        return $this->api->getOrder($accountId, $orderId);
    }

    public function cancelOrder(string $accountId, string $orderId): array
    {
        return $this->api->cancelOrder($accountId, $orderId);
    }

    // --- Funding -----------------------------------------------------

    public function fundAccount(string $toAccountId, string $amount): array
    {
        if (empty($this->firmAccountId)) {
            return [
                'success' => false,
                'error'   => 'No firm_account_id configured for this adapter',
            ];
        }

        return $this->api->journalCashToAccount($toAccountId, $amount);
    }

    // --- Portfolio ----------------------------------------------------

    public function getPositions(string $accountId): array
    {
        return $this->api->getPositions($accountId);
    }

    public function getPortfolioHistory(string $accountId, string $period = '1M'): array
    {
        return $this->api->getPortfolioHistory($accountId, $period);
    }

    // --- Connectivity ------------------------------------------------

    public function testConnection(): array
    {
        return $this->api->testConnection();
    }

    public function getBrokerType(): string
    {
        return 'alpaca';
    }

    // --- Alpaca-specific (not on the interface) ----------------------

    /** Access the underlying AlpacaBrokerAPI for broker-specific calls. */
    public function getApi(): AlpacaBrokerAPI
    {
        return $this->api;
    }

    public function getFirmAccountId(): string
    {
        return $this->firmAccountId;
    }
}
