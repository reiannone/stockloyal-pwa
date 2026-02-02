<?php
/**
 * SweepProcess - Batch processor for scheduled order sweeps
 * 
 * This class handles the automated sweep process that:
 * 1. Identifies merchants whose sweep_day matches today
 * 2. Finds all pending/queued orders for those merchants
 * 3. Submits trade orders to each broker
 * 4. Updates order status to 'confirmed' with timestamp
 */

declare(strict_types=1);

class SweepProcess {
    private PDO $conn;
    private array $log = [];
    private string $batchId;
    
    public function __construct(PDO $conn) {
        $this->conn = $conn;
        $this->batchId = 'SWEEP_' . date('Ymd_His') . '_' . substr(uniqid(), -6);
    }
    
    /**
     * Run the sweep process for all eligible merchants
     * @param int|null $forceMerchantId - If set, only process this merchant (for manual triggers)
     * @return array - Results of the sweep process
     */
    public function run(?string $forceMerchantId = null): array {
        $startTime = microtime(true);
        $this->log("=== Sweep Process Started ===");
        $this->log("Batch ID: {$this->batchId}");
        $this->log("Timestamp: " . date('Y-m-d H:i:s'));
        
        $results = [
            'batch_id' => $this->batchId,
            'started_at' => date('Y-m-d H:i:s'),
            'merchants_processed' => 0,
            'orders_processed' => 0,
            'orders_confirmed' => 0,
            'orders_failed' => 0,
            'brokers_notified' => [],
            'errors' => [],
            'log' => []
        ];
        
        try {
            // Get eligible merchants
            $merchants = $this->getEligibleMerchants($forceMerchantId);
            $this->log("Found " . count($merchants) . " eligible merchant(s)");
            
            if (empty($merchants)) {
                $this->log("No merchants to process today");
                $results['log'] = $this->log;
                return $results;
            }
            
            foreach ($merchants as $merchant) {
                $merchantResult = $this->processMerchant($merchant);
                $results['merchants_processed']++;
                $results['orders_processed'] += $merchantResult['orders_processed'];
                $results['orders_confirmed'] += $merchantResult['orders_confirmed'];
                $results['orders_failed'] += $merchantResult['orders_failed'];
                
                if (!empty($merchantResult['brokers_notified'])) {
                    $results['brokers_notified'] = array_merge(
                        $results['brokers_notified'], 
                        $merchantResult['brokers_notified']
                    );
                }
                
                if (!empty($merchantResult['errors'])) {
                    $results['errors'] = array_merge($results['errors'], $merchantResult['errors']);
                }
            }
            
        } catch (Exception $e) {
            $this->log("FATAL ERROR: " . $e->getMessage());
            $results['errors'][] = $e->getMessage();
        }
        
        $results['completed_at'] = date('Y-m-d H:i:s');
        $results['duration_seconds'] = round(microtime(true) - $startTime, 3);
        $results['log'] = $this->log;
        
        // Log the sweep execution
        $this->logSweepExecution($results);
        
        $this->log("=== Sweep Process Completed ===");
        $this->log("Duration: {$results['duration_seconds']}s");
        
        return $results;
    }
    
    /**
     * Get merchants whose sweep_day matches today (or forced merchant)
     */
    private function getEligibleMerchants(?string $forceMerchantId = null): array {
        $today = (int) date('j'); // Day of month (1-31)
        $lastDayOfMonth = (int) date('t'); // Last day of current month
        
        if ($forceMerchantId) {
            // Manual trigger - get specific merchant
            $sql = "SELECT merchant_id, merchant_name, sweep_day 
                    FROM merchant 
                    WHERE merchant_id = :merchant_id 
                    AND sweep_day IS NOT NULL";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([':merchant_id' => $forceMerchantId]);
        } else {
            // Scheduled run - find merchants matching today
            $sql = "SELECT merchant_id, merchant_name, sweep_day 
                    FROM merchant 
                    WHERE sweep_day IS NOT NULL 
                    AND (
                        sweep_day = :today 
                        OR (sweep_day = -1 AND :today = :last_day)
                    )";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([
                ':today' => $today,
                ':last_day' => $lastDayOfMonth
            ]);
        }
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    /**
     * Process all pending orders for a merchant
     */
    private function processMerchant(array $merchant): array {
        $merchantId = $merchant['merchant_id'];
        $merchantName = $merchant['merchant_name'] ?? $merchantId;
        
        $this->log("--- Processing merchant: {$merchantName} ({$merchantId}) ---");
        
        $result = [
            'merchant_id' => $merchantId,
            'orders_processed' => 0,
            'orders_confirmed' => 0,
            'orders_failed' => 0,
            'brokers_notified' => [],
            'errors' => []
        ];
        
        // Get pending orders for this merchant
        $orders = $this->getPendingOrders($merchantId);
        $this->log("Found " . count($orders) . " pending order(s)");
        
        if (empty($orders)) {
            return $result;
        }
        
        // Group orders by broker
        $ordersByBroker = [];
        foreach ($orders as $order) {
            $broker = $order['broker'] ?? 'Unknown';
            if (!isset($ordersByBroker[$broker])) {
                $ordersByBroker[$broker] = [];
            }
            $ordersByBroker[$broker][] = $order;
        }
        
        // Process each broker batch
        foreach ($ordersByBroker as $broker => $brokerOrders) {
            $this->log("Processing " . count($brokerOrders) . " order(s) for broker: {$broker}");
            
            $brokerResult = $this->submitToBroker($broker, $brokerOrders, $merchantId);
            
            $result['orders_processed'] += count($brokerOrders);
            $result['orders_confirmed'] += $brokerResult['confirmed'];
            $result['orders_failed'] += $brokerResult['failed'];
            
            if ($brokerResult['notified']) {
                $result['brokers_notified'][] = $broker;
            }
            
            if (!empty($brokerResult['errors'])) {
                $result['errors'] = array_merge($result['errors'], $brokerResult['errors']);
            }
        }
        
        return $result;
    }
    
    /**
     * Get all pending orders for a merchant
     */
    private function getPendingOrders(string $merchantId): array {
        $sql = "SELECT o.*, w.member_id as wallet_member_id
                FROM orders o
                LEFT JOIN wallet w ON o.member_id = w.member_id
                WHERE o.merchant_id = :merchant_id 
                AND o.status IN ('pending', 'Pending', 'queued')
                ORDER BY o.placed_at ASC";
        
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([':merchant_id' => $merchantId]);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    /**
     * Submit orders to broker and update status
     */
    private function submitToBroker(string $brokerName, array $orders, string $merchantId): array {
        $result = [
            'confirmed' => 0,
            'failed' => 0,
            'notified' => false,
            'errors' => []
        ];
        
        // Get broker configuration
        $broker = $this->getBrokerConfig($brokerName, $merchantId);
        
        if (!$broker) {
            $this->log("WARNING: No broker configuration found for: {$brokerName}");
            // Still confirm orders but mark as needing manual processing
            foreach ($orders as $order) {
                $this->updateOrderStatus($order['order_id'], 'confirmed', 'Sweep processed - broker config missing');
                $result['confirmed']++;
            }
            return $result;
        }
        
        // Prepare the sweep payload
        $payload = [
            'event_type' => 'sweep_batch',
            'batch_id' => $this->batchId,
            'merchant_id' => $merchantId,
            'broker' => $brokerName,
            'sweep_date' => date('Y-m-d'),
            'orders' => array_map(function($order) {
                return [
                    'order_id' => $order['order_id'],
                    'member_id' => $order['member_id'],
                    'basket_id' => $order['basket_id'],
                    'symbol' => $order['symbol'],
                    'shares' => (float) $order['shares'],
                    'amount' => (float) $order['amount'],
                    'points_used' => (float) ($order['points_used'] ?? 0),
                    'order_type' => $order['order_type'] ?? 'market'
                ];
            }, $orders),
            'total_amount' => array_sum(array_column($orders, 'amount')),
            'total_orders' => count($orders),
            'timestamp' => date('c')
        ];
        
        // Submit to broker webhook
        $response = $this->callBrokerWebhook($broker, $payload);
        
        if ($response['success']) {
            $result['notified'] = true;
            $this->log("Broker notified successfully");
            
            // Update all orders to confirmed
            foreach ($orders as $order) {
                try {
                    $this->updateOrderStatus(
                        $order['order_id'], 
                        'confirmed',
                        $response['external_ref'] ?? null
                    );
                    $result['confirmed']++;
                } catch (Exception $e) {
                    $result['failed']++;
                    $result['errors'][] = "Order {$order['order_id']}: " . $e->getMessage();
                }
            }
        } else {
            $this->log("ERROR: Broker notification failed - " . ($response['error'] ?? 'Unknown error'));
            $result['errors'][] = "Broker {$brokerName}: " . ($response['error'] ?? 'Unknown error');
            
            // Mark orders as needing retry
            foreach ($orders as $order) {
                $result['failed']++;
            }
        }
        
        return $result;
    }
    
    /**
     * Get broker configuration from broker_master table
     */
    private function getBrokerConfig(string $brokerName, string $merchantId): ?array {
        // First try merchant-specific broker relationship
        $sql = "SELECT bm.* 
                FROM broker_master bm
                INNER JOIN merchant_broker mb ON bm.broker_id = mb.broker_id
                WHERE mb.merchant_id = :merchant_id
                AND (bm.broker_name = :broker_name OR bm.broker_id = :broker_name)
                LIMIT 1";
        
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([
            ':merchant_id' => $merchantId,
            ':broker_name' => $brokerName
        ]);
        
        $broker = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$broker) {
            // Fall back to global broker lookup
            $sql = "SELECT * FROM broker_master 
                    WHERE broker_name = :broker_name OR broker_id = :broker_name
                    LIMIT 1";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([':broker_name' => $brokerName]);
            $broker = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        
        return $broker ?: null;
    }
    
    /**
     * Call broker webhook with payload
     */
    private function callBrokerWebhook(array $broker, array $payload): array {
        $webhookUrl = $broker['webhook_url'] ?? null;
        $apiKey = $broker['api_key'] ?? null;
        
        if (!$webhookUrl) {
            return [
                'success' => false,
                'error' => 'No webhook URL configured'
            ];
        }
        
        $headers = [
            'Content-Type: application/json',
            'Accept: application/json'
        ];
        
        if ($apiKey) {
            $headers[] = "Authorization: Bearer {$apiKey}";
            $headers[] = "X-API-Key: {$apiKey}";
        }
        
        $ch = curl_init($webhookUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            return [
                'success' => false,
                'error' => "cURL error: {$error}"
            ];
        }
        
        if ($httpCode >= 200 && $httpCode < 300) {
            $decoded = json_decode($response, true);
            return [
                'success' => true,
                'http_code' => $httpCode,
                'response' => $decoded,
                'external_ref' => $decoded['reference_id'] ?? $decoded['batch_id'] ?? null
            ];
        }
        
        return [
            'success' => false,
            'error' => "HTTP {$httpCode}: {$response}"
        ];
    }
    
    /**
     * Update order status to confirmed
     */
    private function updateOrderStatus(int $orderId, string $status, ?string $note = null): void {
        $sql = "UPDATE orders 
                SET status = :status,
                    executed_at = NOW()
                WHERE order_id = :order_id";
        
        $stmt = $this->conn->prepare($sql);
        $stmt->execute([
            ':status' => $status,
            ':order_id' => $orderId
        ]);
        
        $this->log("Order {$orderId} updated to '{$status}'" . ($note ? " ({$note})" : ""));
    }
    
    /**
     * Log sweep execution to database
     */
    private function logSweepExecution(array $results): void {
        try {
            $sql = "INSERT INTO sweep_log 
                    (batch_id, started_at, completed_at, merchants_processed, 
                     orders_processed, orders_confirmed, orders_failed, 
                     brokers_notified, errors, log_data)
                    VALUES 
                    (:batch_id, :started_at, :completed_at, :merchants_processed,
                     :orders_processed, :orders_confirmed, :orders_failed,
                     :brokers_notified, :errors, :log_data)";
            
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([
                ':batch_id' => $results['batch_id'],
                ':started_at' => $results['started_at'],
                ':completed_at' => $results['completed_at'] ?? date('Y-m-d H:i:s'),
                ':merchants_processed' => $results['merchants_processed'],
                ':orders_processed' => $results['orders_processed'],
                ':orders_confirmed' => $results['orders_confirmed'],
                ':orders_failed' => $results['orders_failed'],
                ':brokers_notified' => json_encode($results['brokers_notified']),
                ':errors' => json_encode($results['errors']),
                ':log_data' => json_encode($results['log'])
            ]);
        } catch (Exception $e) {
            $this->log("WARNING: Could not log sweep execution: " . $e->getMessage());
        }
    }
    
    /**
     * Add message to log
     */
    private function log(string $message): void {
        $timestamp = date('Y-m-d H:i:s');
        $this->log[] = "[{$timestamp}] {$message}";
        error_log("[SweepProcess] {$message}");
    }
}
