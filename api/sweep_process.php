<?php
declare(strict_types=1);

/**
 * sweep_process.php — Core Sweep Engine
 *
 * Called by trigger_sweep.php when admin clicks "Run Sweep" / "Run Sweep Now".
 *
 * Architecture:
 *   merchant → member basket_id → individual broker notification
 *
 * Per basket:
 *   1. Mark basket orders → status = 'placed'
 *   2. POST order detail to broker webhook_url
 *   3. Capture full response body (acknowledgement + timestamp)
 *   4. Log request + response to broker_notifications
 *   5. Return everything to admin UI
 *
 * Tables read:   orders, merchant, broker_master
 * Tables write:  orders (status), broker_notifications, sweep_log
 */

class SweepProcess
{
    private PDO    $conn;
    private string $logFile;
    private string $batchId;
    private array  $errors      = [];
    private array  $logMessages = [];

    public function __construct(PDO $conn)
    {
        $this->conn = $conn;

        $logDir = '/var/www/html/stockloyal-pwa/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0755, true);
        }
        $this->logFile = $logDir . '/sweep-process.log';
    }

    private function log(string $msg): void
    {
        $ts = gmdate('Y-m-d H:i:s');
        $line = "[{$ts}] {$msg}";
        $this->logMessages[] = $line;
        @file_put_contents($this->logFile, "{$line}\n", FILE_APPEND);
    }

    // ====================================================================
    // PUBLIC — run()
    // ====================================================================

    public function run(?string $merchantId = null): array
    {
        $this->batchId = 'SWP-' . date('Ymd-His') . '-' . substr(uniqid(), -6);
        $startTime     = microtime(true);
        $startedAt     = date('Y-m-d H:i:s');  // actual wall-clock start for sweep_log

        $this->log(str_repeat('=', 80));
        $this->log("SWEEP BATCH START: {$this->batchId}");
        $this->log($merchantId ? "Merchant: {$merchantId}" : "All merchants");

        // 1. Fetch pending orders
        $orders = $this->getPendingOrders($merchantId);

        if (empty($orders)) {
            $this->log("No pending orders — nothing to sweep.");
            return $this->buildResult(0, 0, 0, [], [], microtime(true) - $startTime);
        }

        // 2. Group: merchant+broker → baskets → orders[]
        $groups = $this->groupByMerchantBroker($orders);

        $this->log("Found " . count($orders) . " order(s) across "
                    . count($groups) . " merchant-broker group(s)");

        $totalPlaced   = 0;
        $totalFailed   = 0;
        $merchantSet   = [];
        $groupResults  = [];

        // 3. Process each merchant-broker group (one webhook per group)
        foreach ($groups as $comboKey => $group) {
            $merchId    = $group['merchant_id'];
            $merchName  = $group['merchant_name'];
            $brokerName = $group['broker'];
            $allOrders  = $group['orders'];

            if ($merchId) $merchantSet[$merchId] = true;

            $basketCount  = count(array_unique(array_column($allOrders, 'basket_id')));
            $memberCount  = count(array_unique(array_column($allOrders, 'member_id')));

            $this->log("=== Group: {$merchName} / {$brokerName}  "
                        . "members={$memberCount}  baskets={$basketCount}  "
                        . "orders=" . count($allOrders) . " ===");

            try {
                $result = $this->processMerchantBrokerGroup($group);
                $totalPlaced += $result['orders_placed'];
                $totalFailed += $result['orders_failed'];
                $groupResults[] = $result;
            } catch (\Exception $e) {
                $this->log("❌ Group {$comboKey} EXCEPTION: " . $e->getMessage());
                $this->errors[] = "Group {$comboKey}: " . $e->getMessage();
                $totalFailed += count($allOrders);

                $groupResults[] = [
                    'merchant_id'   => $merchId,
                    'merchant_name' => $merchName,
                    'broker'        => $brokerName,
                    'orders_placed' => 0,
                    'orders_failed' => count($allOrders),
                    'member_count'  => $memberCount,
                    'member_ids'    => array_values(array_unique(array_column($allOrders, 'member_id'))),
                    'basket_count'  => $basketCount,
                    'acknowledged'  => false,
                    'error'         => $e->getMessage(),
                    'request'       => null,
                    'response'      => null,
                ];
            }
        }

        $duration = microtime(true) - $startTime;

        // 4. Collect unique broker names that acknowledged
        $brokersNotified = array_values(array_unique(array_filter(
            array_map(fn($r) => $r['acknowledged'] ? $r['broker'] : null, $groupResults)
        )));

        // 5. Log batch to sweep_log
        $this->logSweepBatch($totalPlaced, $totalFailed,
                             count($merchantSet), $brokersNotified, $duration, $startedAt);

        // 6. Clear picks for one-time election members
        $oneTimeCleared = $this->clearOneTimePicks($groupResults);
        if ($oneTimeCleared > 0) {
            $this->log("Cleared picks for {$oneTimeCleared} one-time election member(s)");
        }

        $this->log("SWEEP DONE: placed={$totalPlaced}  failed={$totalFailed}  "
                    . "groups=" . count($groups) . "  duration=" . round($duration, 2) . "s");
        $this->log(str_repeat('-', 80));

        return $this->buildResult(
            $totalPlaced, $totalFailed, count($merchantSet),
            $brokersNotified, $groupResults, $duration
        );
    }

    // ====================================================================
    // PRIVATE — query
    // ====================================================================

    private function getPendingOrders(?string $merchantId): array
    {
        $sql = "
            SELECT o.order_id, o.member_id, o.merchant_id, o.basket_id,
                   o.symbol, o.shares, o.amount, o.points_used,
                   o.status, o.placed_at, o.broker, o.order_type,
                   m.merchant_name,
                   bc.username AS brokerage_id
            FROM   orders o
            LEFT JOIN merchant m ON o.merchant_id = m.merchant_id
            LEFT JOIN broker_credentials bc ON bc.member_id = o.member_id AND LOWER(bc.broker) = LOWER(o.broker)
            WHERE  LOWER(o.status) IN ('pending','queued')
        ";

        if ($merchantId) {
            $sql .= " AND o.merchant_id = ? ";
            $sql .= " ORDER BY o.basket_id, o.placed_at ASC";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute([$merchantId]);
        } else {
            $sql .= " ORDER BY o.merchant_id, o.basket_id, o.placed_at ASC";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute();
        }

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function groupByMerchantBroker(array $orders): array
    {
        $groups = [];
        foreach ($orders as $o) {
            $key = ($o['merchant_id'] ?? 'unknown') . '::' . ($o['broker'] ?? 'unknown');
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'merchant_id'   => $o['merchant_id'] ?? null,
                    'merchant_name' => $o['merchant_name'] ?? null,
                    'broker'        => $o['broker'] ?? 'unknown',
                    'orders'        => [],
                ];
            }
            $groups[$key]['orders'][] = $o;
        }
        return $groups;
    }

    private function getBrokerInfo(string $brokerName): array
    {
        $stmt = $this->conn->prepare("
            SELECT broker_id, broker_name, webhook_url, api_key
            FROM   broker_master
            WHERE  broker_name = ? OR broker_id = ?
            LIMIT  1
        ");
        $stmt->execute([$brokerName, $brokerName]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: ['broker_name' => $brokerName];
    }

    // ====================================================================
    // PRIVATE — per merchant-broker group processing
    // ====================================================================

    private function processMerchantBrokerGroup(array $group): array
    {
        $brokerName = $group['broker'];
        $merchId    = $group['merchant_id'];
        $merchName  = $group['merchant_name'];
        $allOrders  = $group['orders'];

        // 1. Look up broker webhook
        $brokerInfo = $this->getBrokerInfo($brokerName);
        $webhookUrl = $brokerInfo['webhook_url'] ?? null;

        // 2. Mark all orders → 'placed'
        $placedCount = $this->markOrdersPlaced($allOrders);
        $this->log("✅ {$placedCount} / " . count($allOrders) . " → 'placed'");

        // 3. Build grouped payload (all members/baskets for this merchant-broker)
        $payload = $this->buildGroupPayload($group, $brokerInfo);

        // 4. Send single webhook for entire merchant-broker group
        $response = null;
        if (!empty($webhookUrl)) {
            $this->log("📡 POST → {$webhookUrl}  ({$merchId} / {$brokerName})");
            $response = $this->sendWebhook($webhookUrl, $payload, $brokerInfo);
        } else {
            $this->log("⚠️ No webhook_url for '{$brokerName}' — skipping notification");
        }

        // 5. Log to broker_notifications
        $comboLabel = "{$merchId}::{$brokerName}";
        $this->logNotification($brokerInfo, $comboLabel, $comboLabel, $payload, $response);

        $basketIds   = array_unique(array_column($allOrders, 'basket_id'));
        $memberIds   = array_unique(array_column($allOrders, 'member_id'));

        return [
            'merchant_id'     => $merchId,
            'merchant_name'   => $merchName,
            'broker'          => $brokerName,
            'broker_id'       => $brokerInfo['broker_id'] ?? null,
            'member_count'    => count($memberIds),
            'member_ids'      => array_values($memberIds),
            'basket_count'    => count($basketIds),
            'orders_placed'   => $placedCount,
            'orders_failed'   => count($allOrders) - $placedCount,
            'order_count'     => count($allOrders),
            'total_amount'    => round((float) array_sum(array_column($allOrders, 'amount')), 2),
            'symbols'         => implode(', ', array_unique(array_column($allOrders, 'symbol'))),
            'webhook_url'     => $webhookUrl,
            'acknowledged'    => $response['acknowledged'] ?? false,
            'acknowledged_at' => $response['acknowledged_at'] ?? null,
            'broker_ref'      => $response['broker_ref'] ?? null,
            'http_status'     => $response['http_status'] ?? null,
            'request'         => $payload,
            'response'        => $response,
        ];
    }

    // ====================================================================
    // PRIVATE — mark placed
    // ====================================================================

    private function markOrdersPlaced(array $orders): int
    {
        $count = 0;
        foreach ($orders as $o) {
            $oid = $o['order_id'] ?? null;
            if (!$oid) continue;

            $stmt = $this->conn->prepare("
                UPDATE orders
                SET    status = 'placed', placed_at = NOW()
                WHERE  order_id = ?
                  AND  LOWER(status) IN ('pending','queued')
            ");
            $stmt->execute([$oid]);
            $count += $stmt->rowCount();
        }
        return $count;
    }

    // ====================================================================
    // PRIVATE — build grouped payload (merchant + broker + all members)
    // ====================================================================

    private function buildGroupPayload(array $group, array $brokerInfo): array
    {
        $allOrders  = $group['orders'];
        $merchId    = $group['merchant_id'];
        $merchName  = $group['merchant_name'];

        // Sub-group orders by member (basket)
        $byMember = [];
        foreach ($allOrders as $o) {
            $mid = $o['member_id'] ?? 'unknown';
            if (!isset($byMember[$mid])) {
                $byMember[$mid] = [
                    'member_id'    => $mid,
                    'brokerage_id' => $o['brokerage_id'] ?? null,
                    'basket_id'    => $o['basket_id'] ?? null,
                    'orders'       => [],
                ];
            }
            $byMember[$mid]['orders'][] = $o;
        }

        // Build per-member payload with nested orders
        $members     = [];
        $totalAmount = 0.0;
        $totalShares = 0.0;
        $totalPoints = 0;
        $allSymbols  = [];

        foreach ($byMember as $mid => $memberData) {
            $memberOrders = [];
            $mAmount = 0.0;
            $mShares = 0.0;
            $mPoints = 0;

            foreach ($memberData['orders'] as $o) {
                $amt = (float)  ($o['amount']     ?? 0);
                $shr = (float)  ($o['shares']      ?? 0);
                $pts = (int)    ($o['points_used'] ?? 0);
                $mAmount += $amt;
                $mShares += $shr;
                $mPoints += $pts;

                $memberOrders[] = [
                    'order_id'    => (int) $o['order_id'],
                    'symbol'      => $o['symbol'],
                    'shares'      => round($shr, 4),
                    'amount'      => round($amt, 2),
                    'points_used' => $pts,
                    'order_type'  => $o['order_type'] ?? 'market',
                ];

                $allSymbols[] = $o['symbol'];
            }

            $totalAmount += $mAmount;
            $totalShares += $mShares;
            $totalPoints += $mPoints;

            $members[] = [
                'member_id'    => $mid,
                'brokerage_id' => $memberData['brokerage_id'],
                'basket_id'    => $memberData['basket_id'],
                'orders'       => $memberOrders,
                'summary'      => [
                    'order_count'  => count($memberOrders),
                    'total_amount' => round($mAmount, 2),
                    'total_shares' => round($mShares, 6),
                    'total_points' => $mPoints,
                    'symbols'      => array_values(array_unique(array_column($memberOrders, 'symbol'))),
                ],
            ];
        }

        return [
            'event_type'    => 'order.placed',
            'batch_id'      => $this->batchId,
            'merchant_id'   => $merchId,
            'merchant_name' => $merchName,
            'broker_id'     => $brokerInfo['broker_id'] ?? null,
            'broker_name'   => $brokerInfo['broker_name'] ?? null,
            'members'       => $members,
            'summary'       => [
                'member_count' => count($members),
                'order_count'  => count($allOrders),
                'total_amount' => round($totalAmount, 2),
                'total_shares' => round($totalShares, 6),
                'total_points' => $totalPoints,
                'symbols'      => array_values(array_unique($allSymbols)),
            ],
            'placed_at'     => gmdate('c'),
            'request_id'    => uniqid('swp_', true),
        ];
    }

    // ====================================================================
    // PRIVATE — send webhook & capture full response
    // ====================================================================

    private function sendWebhook(string $url, array $payload, array $brokerInfo): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'X-Event-Type: order.placed',
            'X-Request-Id: ' . ($payload['request_id'] ?? ''),
            'X-Batch-Id: '   . $this->batchId,
        ];
        if (!empty($brokerInfo['api_key'])) {
            $headers[] = 'X-API-Key: ' . $brokerInfo['api_key'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $raw       = curl_exec($ch);
        $httpCode  = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        // cURL transport failure
        if ($curlError) {
            $this->log("❌ cURL: {$curlError}");
            $this->errors[] = "Webhook {$url}: {$curlError}";
            return [
                'acknowledged' => false,
                'http_status'  => 0,
                'error'        => $curlError,
                'body'         => null,
            ];
        }

        $this->log("HTTP {$httpCode} — " . strlen((string) $raw) . " bytes");

        // HTTP error
        if ($httpCode < 200 || $httpCode >= 300) {
            $this->log("❌ HTTP {$httpCode}: " . substr((string) $raw, 0, 500));
            $this->errors[] = "HTTP {$httpCode} from {$url}";
            return [
                'acknowledged' => false,
                'http_status'  => $httpCode,
                'error'        => "HTTP {$httpCode}",
                'body'         => $this->safeParse($raw),
            ];
        }

        // Parse response JSON
        $parsed = $this->safeParse($raw);

        $acked   = (bool) ($parsed['acknowledged'] ?? $parsed['success'] ?? false);
        $ackedAt = $parsed['acknowledged_at'] ?? $parsed['timestamp'] ?? gmdate('c');

        $this->log($acked
            ? "✅ ACK at {$ackedAt}"
            : "⚠️ 2xx but acknowledged=false");

        return [
            'acknowledged'    => $acked,
            'acknowledged_at' => $ackedAt,
            'broker_ref'      => $parsed['broker_batch_id']
                                 ?? $parsed['broker_order_id']
                                 ?? $parsed['request_id']
                                 ?? null,
            'http_status'     => $httpCode,
            'body'            => $parsed,
        ];
    }

    private function safeParse($raw): ?array
    {
        if (!$raw) return null;
        $decoded = json_decode((string) $raw, true);
        return (json_last_error() === JSON_ERROR_NONE) ? $decoded : ['raw' => substr((string) $raw, 0, 2000)];
    }

    // ====================================================================
    // PRIVATE — logging
    // ====================================================================

    private function logNotification(
        array   $brokerInfo,
        string  $basketId,
        string  $memberId,
        array   $payload,
        ?array  $response
    ): void {
        $acked = ($response && ($response['acknowledged'] ?? false));

        $status = $acked ? 'acknowledged' : ($response ? 'sent' : 'no_webhook');

        try {
            $stmt = $this->conn->prepare("
                INSERT INTO broker_notifications
                    (broker_id, broker_name, event_type, status,
                     member_id, basket_id, payload,
                     response_code, response_body, error_message, sent_at)
                VALUES (?, ?, 'order.placed', ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([
                $brokerInfo['broker_id']   ?? null,
                $brokerInfo['broker_name'] ?? null,
                $status,
                $memberId,
                $basketId,
                json_encode($payload, JSON_UNESCAPED_SLASHES),
                $response['http_status'] ?? null,
                $response['body'] ? json_encode($response['body'], JSON_UNESCAPED_SLASHES) : null,
                $response['error'] ?? null,
            ]);
            $this->log("📝 broker_notifications: basket={$basketId} status={$status}");
        } catch (\PDOException $e) {
            $this->log("⚠️ broker_notifications insert: " . $e->getMessage());
        }
    }

    private function logSweepBatch(
        int $placed, int $failed, int $merchants,
        array $brokers, float $duration, string $startedAt
    ): void {
        try {
            $stmt = $this->conn->prepare("
                INSERT INTO sweep_log
                    (batch_id, started_at, completed_at,
                     merchants_processed, orders_processed,
                     orders_confirmed, orders_failed,
                     brokers_notified, errors, log_data)
                VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $this->batchId,
                $startedAt,
                $merchants,
                $placed + $failed,
                $placed,
                $failed,
                json_encode($brokers),
                json_encode($this->errors),
                json_encode($this->logMessages),
            ]);
        } catch (\PDOException $e) {
            $this->log("⚠️ sweep_log insert: " . $e->getMessage());
        }
    }

    // ====================================================================
    // PRIVATE — clear picks for one-time election members
    // ====================================================================

    /**
     * After sweep completes, delete member_stock_picks for members
     * whose wallet.election_type = 'one-time'.
     *
     * @param  array $groupResults  Results from processMerchantBrokerGroup()
     * @return int   Number of members whose picks were cleared
     */
    private function clearOneTimePicks(array $groupResults): int
    {
        // Collect unique member_ids from successfully placed groups
        $memberIds = [];
        foreach ($groupResults as $r) {
            if (($r['orders_placed'] ?? 0) > 0 && !empty($r['member_ids'])) {
                foreach ($r['member_ids'] as $mid) {
                    $memberIds[$mid] = true;
                }
            }
        }

        if (empty($memberIds)) {
            return 0;
        }

        $memberList = array_keys($memberIds);
        $placeholders = implode(',', array_fill(0, count($memberList), '?'));

        // Find members with election_type = 'one-time'
        try {
            $stmt = $this->conn->prepare("
                SELECT member_id 
                FROM wallet 
                WHERE member_id IN ({$placeholders})
                  AND election_type = 'one-time'
            ");
            $stmt->execute($memberList);
            $oneTimeMembers = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        } catch (\PDOException $e) {
            $this->log("⚠️ Failed to query one-time members: " . $e->getMessage());
            return 0;
        }

        if (empty($oneTimeMembers)) {
            $this->log("No one-time election members to clear picks for.");
            return 0;
        }

        $this->log("Clearing picks for " . count($oneTimeMembers) 
                    . " one-time member(s): " . implode(', ', $oneTimeMembers));

        $deleteStmt = $this->conn->prepare(
            "DELETE FROM member_stock_picks WHERE member_id = ?"
        );

        $cleared = 0;
        foreach ($oneTimeMembers as $memberId) {
            try {
                $deleteStmt->execute([$memberId]);
                $count = $deleteStmt->rowCount();
                $this->log("  ✅ Cleared {$count} pick(s) for member {$memberId}");
                $cleared++;
            } catch (\PDOException $e) {
                $this->log("  ⚠️ Failed to clear picks for {$memberId}: " . $e->getMessage());
                $this->errors[] = "Clear picks for {$memberId}: " . $e->getMessage();
            }
        }

        return $cleared;
    }

    // ====================================================================
    // PRIVATE — result builder
    // ====================================================================

    private function buildResult(
        int $placed, int $failed, int $merchants,
        array $brokersNotified, array $basketResults, float $duration
    ): array {
        return [
            'batch_id'            => $this->batchId,
            'orders_placed'       => $placed,
            'orders_failed'       => $failed,
            'merchants_processed' => $merchants,
            'baskets_processed'   => count($basketResults),
            'brokers_notified'    => $brokersNotified,
            'basket_results'      => $basketResults,
            'duration_seconds'    => round($duration, 2),
            'errors'              => $this->errors,
        ];
    }
}
