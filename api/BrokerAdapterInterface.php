<?php
/**
 * BrokerAdapterInterface.php
 *
 * The contract every broker adapter must implement.
 * Each method returns: ['success' => bool, 'data' => [...], 'error' => '...']
 */
declare(strict_types=1);

interface BrokerAdapterInterface
{
    // --- Account Lifecycle ---

    public function createAccount(array $kycData): array;
    public function updateAccount(string $accountId, array $kycData): array;
    public function getAccount(string $accountId): array;
    public function findAccountByEmail(string $email): ?array;

    // --- Order Execution ---

    /**
     * @param string $accountId Broker-side account ID
     * @param array  $orderData Normalized: symbol, notional, side, type, time_in_force
     */
    public function submitOrder(string $accountId, array $orderData): array;
    public function getOrderStatus(string $accountId, string $orderId): array;
    public function cancelOrder(string $accountId, string $orderId): array;

    // --- Funding ---

    /** Fund member account from firm/sweep. Source configured per adapter. */
    public function fundAccount(string $toAccountId, string $amount): array;

    // --- Portfolio ---

    public function getPositions(string $accountId): array;
    public function getPortfolioHistory(string $accountId, string $period = '1M'): array;

    // --- Connectivity ---

    public function testConnection(): array;
    public function getBrokerType(): string;
}
