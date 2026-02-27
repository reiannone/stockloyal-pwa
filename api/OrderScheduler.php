<?php
/**
 * OrderScheduler.php
 *
 * Wraps StockLoyal's existing order pipeline with market-aware scheduling.
 * When a member redeems points outside market hours, orders are queued with
 * a scheduled_execution_date and the member sees clear messaging about timing.
 *
 * Database additions needed:
 *   ALTER TABLE orders ADD COLUMN scheduled_execution_date DATE NULL AFTER status;
 *   ALTER TABLE orders ADD COLUMN market_status_at_creation VARCHAR(20) NULL AFTER scheduled_execution_date;
 *   ALTER TABLE orders ADD COLUMN member_notified_queued TINYINT(1) DEFAULT 0 AFTER market_status_at_creation;
 *   ALTER TABLE orders ADD COLUMN executed_at DATETIME NULL AFTER member_notified_queued;
 *   CREATE INDEX idx_orders_scheduled ON orders(scheduled_execution_date, status);
 */

require_once __DIR__ . '/MarketCalendar.php';

class OrderScheduler
{
    private MarketCalendar $calendar;
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->calendar = new MarketCalendar();
    }

    // ─── Order Creation (called when member redeems points) ────────

    /**
     * Create a scheduled order. This replaces direct order submission.
     *
     * Returns an array with:
     *   order_id            - The new order ID
     *   status              - 'pending' (always, at this stage)
     *   scheduled_date      - When it will execute
     *   market_status       - Current market status snapshot
     *   member_message      - Display to the member
     *   member_message_short - For toast/banner
     *   is_immediate        - Whether it will execute right away
     */
    public function createScheduledOrder(array $params): array
    {
        // Required params
        $memberId   = $params['member_id'];
        $symbol     = $params['symbol'];
        $amount     = $params['amount'];       // Dollar amount (notional)
        $merchantId = $params['merchant_id'] ?? null;
        $source     = $params['source'] ?? 'points_redemption';

        // Get market status
        $marketStatus = $this->calendar->getMarketStatus();
        $scheduledDate = $this->calendar->getScheduledExecutionDate();
        $isImmediate = $marketStatus['is_open'];

        // Determine the market status label to store
        $marketLabel = $isImmediate ? 'market_open' : ($marketStatus['delay_reason'] ?? 'closed');

        // Insert the order with scheduling info
        $orderId = $this->insertOrder([
            'member_id'                => $memberId,
            'merchant_id'              => $merchantId,
            'symbol'                   => $symbol,
            'amount'                   => $amount,
            'status'                   => 'pending',
            'scheduled_execution_date' => $scheduledDate,
            'market_status_at_creation' => $marketLabel,
            'source'                   => $source,
        ]);

        // Build response for the frontend
        $memberMessage = $this->buildOrderConfirmationMessage(
            $symbol,
            $amount,
            $marketStatus,
            $scheduledDate,
            $isImmediate
        );

        // If market is open, kick off the pipeline immediately
        if ($isImmediate) {
            $this->dispatchImmediateExecution($orderId);
        }

        return [
            'order_id'              => $orderId,
            'status'                => 'pending',
            'scheduled_date'        => $scheduledDate,
            'market_status'         => $marketStatus,
            'member_message'        => $memberMessage,
            'member_message_short'  => $marketStatus['message_short'],
            'is_immediate'          => $isImmediate,
        ];
    }

    // ─── Cron: Process Scheduled Orders ────────────────────────────

    /**
     * Called by cron job at market open (or periodically during market hours).
     * Picks up all orders scheduled for today that haven't been executed yet.
     *
     * Suggested cron schedule:
     *   # Run at 9:31 AM ET on weekdays
     *   31 9 * * 1-5 php /path/to/cron/process-scheduled-orders.php
     *
     *   # Safety net: run every 15 min during market hours
     *   * /15 9-16 * * 1-5 php /path/to/cron/process-scheduled-orders.php
     */
    public function processScheduledOrders(): array
    {
        $marketStatus = $this->calendar->getMarketStatus();

        // Don't process if market isn't open
        if (!$marketStatus['is_open']) {
            return [
                'processed' => 0,
                'skipped'   => 0,
                'reason'    => 'Market is not open',
            ];
        }

        $today = date('Y-m-d');

        // Fetch orders scheduled for today (or earlier, in case any were missed)
        $stmt = $this->db->prepare("
            SELECT o.*, m.alpaca_account_id, m.email, m.first_name
            FROM orders o
            JOIN members m ON m.id = o.member_id
            WHERE o.scheduled_execution_date <= :today
              AND o.status = 'pending'
              AND o.executed_at IS NULL
            ORDER BY o.created_at ASC
            FOR UPDATE
        ");
        $stmt->execute(['today' => $today]);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $processed = 0;
        $errors = [];

        foreach ($orders as $order) {
            try {
                $this->executeOrderPipeline($order);
                $processed++;
            } catch (Exception $e) {
                $errors[] = [
                    'order_id' => $order['id'],
                    'error'    => $e->getMessage(),
                ];
                error_log("OrderScheduler: Failed to process order {$order['id']}: {$e->getMessage()}");

                // Mark as failed so we don't retry endlessly
                $this->updateOrderStatus($order['id'], 'failed', $e->getMessage());
            }
        }

        return [
            'processed' => $processed,
            'errors'    => $errors,
            'total'     => count($orders),
        ];
    }

    // ─── Pipeline Execution ────────────────────────────────────────

    /**
     * Execute the full 5-stage pipeline for a single order:
     *   1. Validate member account
     *   2. JNLC from sweep → member account
     *   3. Submit buy order to Alpaca
     *   4. Update order status
     *   5. Notify member
     */
    private function executeOrderPipeline(array $order): void
    {
        $orderId = $order['id'];

        // Stage 1: Validate
        $this->updateOrderStatus($orderId, 'validating');

        if (empty($order['alpaca_account_id'])) {
            throw new Exception("Member {$order['member_id']} has no Alpaca account");
        }

        // Stage 2: Journal cash (JNLC)
        $this->updateOrderStatus($orderId, 'journaling');
        $jnlcResult = $this->executeJNLC($order['alpaca_account_id'], $order['amount']);

        if (!$jnlcResult['success']) {
            throw new Exception("JNLC failed: " . ($jnlcResult['error'] ?? 'Unknown error'));
        }

        // Stage 3: Submit buy order
        $this->updateOrderStatus($orderId, 'submitting');
        $alpacaOrder = $this->submitAlpacaOrder(
            $order['alpaca_account_id'],
            $order['symbol'],
            $order['amount']
        );

        // Stage 4: Update order with Alpaca details
        $this->updateOrderWithAlpacaResponse($orderId, $alpacaOrder);
        $this->updateOrderStatus($orderId, 'submitted');

        // Mark execution timestamp
        $stmt = $this->db->prepare("
            UPDATE orders SET executed_at = NOW() WHERE id = :id
        ");
        $stmt->execute(['id' => $orderId]);

        // Stage 5: Notify member
        $this->notifyMemberOrderExecuted($order, $alpacaOrder);
    }

    /**
     * For immediate execution when market is already open.
     * Dispatches asynchronously (or inline for simplicity).
     */
    private function dispatchImmediateExecution(int $orderId): void
    {
        // Option A: Execute inline (simpler, blocks the request slightly)
        // $order = $this->getOrderWithMember($orderId);
        // $this->executeOrderPipeline($order);

        // Option B: Queue for near-immediate async processing (preferred)
        // This just flags it — the cron running every 15 min will pick it up,
        // or you can trigger a one-off worker:
        //   exec("php /path/to/process-single-order.php {$orderId} > /dev/null 2>&1 &");

        // For now, we'll let the cron handle it since it runs frequently during market hours
    }

    // ─── Alpaca Integration Stubs ──────────────────────────────────
    // Replace these with your actual Alpaca Broker API calls

    private function executeJNLC(string $accountId, float $amount): array
    {
        // TODO: Call your existing JNLC function
        // POST /v1/journals
        // {
        //   "from_account": SWEEP_ACCOUNT_ID,
        //   "entry_type": "JNLC",
        //   "to_account": $accountId,
        //   "amount": $amount
        // }

        // Placeholder — replace with actual implementation
        return ['success' => true, 'journal_id' => null];
    }

    private function submitAlpacaOrder(string $accountId, string $symbol, float $amount): array
    {
        // TODO: Call your existing order submission function
        // POST /v1/trading/accounts/{accountId}/orders
        // {
        //   "symbol": $symbol,
        //   "notional": $amount,
        //   "side": "buy",
        //   "type": "market",
        //   "time_in_force": "day"
        // }

        // Placeholder — replace with actual implementation
        return ['id' => null, 'status' => 'accepted', 'symbol' => $symbol];
    }

    // ─── Database Helpers ──────────────────────────────────────────

    private function insertOrder(array $data): int
    {
        $stmt = $this->db->prepare("
            INSERT INTO orders (
                member_id, merchant_id, symbol, amount, status,
                scheduled_execution_date, market_status_at_creation, source,
                created_at
            ) VALUES (
                :member_id, :merchant_id, :symbol, :amount, :status,
                :scheduled_execution_date, :market_status_at_creation, :source,
                NOW()
            )
        ");

        $stmt->execute([
            'member_id'                 => $data['member_id'],
            'merchant_id'               => $data['merchant_id'],
            'symbol'                    => $data['symbol'],
            'amount'                    => $data['amount'],
            'status'                    => $data['status'],
            'scheduled_execution_date'  => $data['scheduled_execution_date'],
            'market_status_at_creation' => $data['market_status_at_creation'],
            'source'                    => $data['source'],
        ]);

        return (int) $this->db->lastInsertId();
    }

    private function updateOrderStatus(int $orderId, string $status, ?string $errorMessage = null): void
    {
        $sql = "UPDATE orders SET status = :status, updated_at = NOW()";
        $params = ['status' => $status, 'id' => $orderId];

        if ($errorMessage) {
            $sql .= ", error_message = :error_message";
            $params['error_message'] = $errorMessage;
        }

        $sql .= " WHERE id = :id";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
    }

    private function updateOrderWithAlpacaResponse(int $orderId, array $alpacaOrder): void
    {
        $stmt = $this->db->prepare("
            UPDATE orders
            SET alpaca_order_id = :alpaca_order_id,
                alpaca_status = :alpaca_status,
                updated_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([
            'alpaca_order_id' => $alpacaOrder['id'] ?? null,
            'alpaca_status'   => $alpacaOrder['status'] ?? null,
            'id'              => $orderId,
        ]);
    }

    private function getOrderWithMember(int $orderId): array
    {
        $stmt = $this->db->prepare("
            SELECT o.*, m.alpaca_account_id, m.email, m.first_name
            FROM orders o
            JOIN members m ON m.id = o.member_id
            WHERE o.id = :id
        ");
        $stmt->execute(['id' => $orderId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // ─── Member Messaging ──────────────────────────────────────────

    private function buildOrderConfirmationMessage(
        string $symbol,
        float $amount,
        array $marketStatus,
        string $scheduledDate,
        bool $isImmediate
    ): string {
        $amountFormatted = '$' . number_format($amount, 2);

        if ($isImmediate) {
            return "Your {$amountFormatted} investment in {$symbol} is being processed now.";
        }

        $dateLabel = $this->formatFriendlyScheduledDate($scheduledDate);

        $reason = match ($marketStatus['delay_reason']) {
            'weekend'     => "The market is closed for the weekend.",
            'holiday'     => "The market is closed today for a holiday.",
            'after_hours' => "The market has closed for today.",
            'pre_market'  => "The market hasn't opened yet.",
            default       => "The market is currently closed.",
        };

        return "{$reason} Your {$amountFormatted} investment in {$symbol} has been received and will be executed when trading opens on {$dateLabel}.";
    }

    private function notifyMemberOrderExecuted(array $order, array $alpacaOrder): void
    {
        // TODO: Hook into your existing notification system
        // - Push notification (if PWA supports it)
        // - In-app notification
        // - Email (optional)
        //
        // Example payload:
        // $notification = [
        //     'member_id' => $order['member_id'],
        //     'type'      => 'order_executed',
        //     'title'     => 'Investment Order Executed',
        //     'body'      => "Your ${$order['amount']} investment in {$order['symbol']} has been placed.",
        //     'data'      => ['order_id' => $order['id']],
        // ];

        $stmt = $this->db->prepare("
            UPDATE orders SET member_notified_queued = 1 WHERE id = :id
        ");
        $stmt->execute(['id' => $order['id']]);
    }

    private function formatFriendlyScheduledDate(string $date): string
    {
        $target = new DateTimeImmutable($date, new DateTimeZone('America/New_York'));
        $now    = new DateTimeImmutable('now', new DateTimeZone('America/New_York'));

        $tomorrow = $now->modify('+1 day')->format('Y-m-d');

        if ($date === $tomorrow) {
            return 'tomorrow (' . $target->format('l') . ')';
        }

        return $target->format('l, M j'); // "Monday, Jan 6"
    }
}
