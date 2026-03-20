<?php
/**
 * PipelineOrchestrator.php
 *
 * Executes pipeline stages for a given cycle row.
 * Called by pipeline-cycles.php action=run_stage.
 *
 * Each stage makes an internal loopback HTTP call to the relevant
 * existing endpoint — no logic is duplicated here.
 *
 * Deploy: /var/www/html/api/PipelineOrchestrator.php
 *
 * Orders stage is now split into two admin steps:
 *   stage=orders         → prepare only  → stage_orders='staged' (awaiting review)
 *   stage=orders_approve → approve only  → stage_orders='completed'
 */

// ── Custom exception: stage is waiting (polling), not truly failed ────────────
class StageWaitingException extends \RuntimeException {}

class PipelineOrchestrator
{
    private PDO $conn;

    public function __construct(PDO $conn)
    {
        $this->conn = $conn;
    }

    // =========================================================================
    //  Public entry point
    // =========================================================================

    /**
     * Run a single pipeline stage.
     *
     * Returns an array always — never throws to the caller.
     * Shape on success: ['success'=>true,  'message'=>'...', ...]
     * Shape on waiting: ['success'=>false, 'waiting'=>true,  'error'=>'...', 'message'=>'...']
     * Shape on failure: ['success'=>false, 'waiting'=>false, 'error'=>'...', 'message'=>'...']
     */
    public function runStage(array $cycle, string $stage, array $body = []): array
    {
        $cycleId = (int) $cycle['id'];

        // ── Combined baskets_orders stage (legacy, kept for compatibility) ──────
        if ($stage === 'baskets_orders') {
            return $this->runBasketsAndPrepare($cycle, $cycleId);
        }

        // ── Orders: prepare only — leaves stage_orders='staged' for admin review ─
        if ($stage === 'orders') {
            return $this->runOrdersPrepare($cycle, $cycleId);
        }

        // ── Orders: admin-triggered approve — advances stage_orders to 'completed' ─
        if ($stage === 'orders_approve') {
            return $this->runOrdersApprove($cycle, $cycleId);
        }

        // ── Generic stage handler ────────────────────────────────────────────
        $alreadyStarted = !empty($cycle["stage_{$stage}"])
                          && $cycle["stage_{$stage}"] !== 'pending';
        $this->setStageStatus($cycleId, $stage, 'in_progress', !$alreadyStarted);

        try {
            $result = match ($stage) {
                'baskets'    => $this->runBaskets($cycle),
                'payment'    => $this->runPayment($cycle),
                'funding'    => $this->runFunding($cycle),
                'journal'    => $this->runJournal($cycle),
                'placement'  => $this->runPlacement($cycle),
                'submission' => $this->runSubmission($cycle),
                'execution'  => $this->runExecution($cycle),
                'settlement' => $this->runSettlement($cycle),
                default      => throw new \Exception("Unknown stage: {$stage}"),
            };

            // ── Success path ──
            $this->setStageStatus($cycleId, $stage, 'completed', false);
            $this->advanceCycleStage($cycleId, $stage);
            $this->syncCounts($cycleId);
            $this->clearLastError($cycleId);

            return ['success' => true, 'waiting' => false] + $result;

        } catch (StageWaitingException $e) {
            $this->setLastError($cycleId, "[{$stage} · waiting] " . $e->getMessage());
            return [
                'success' => false,
                'waiting' => true,
                'error'   => $e->getMessage(),
                'message' => $e->getMessage(),
            ];

        } catch (\Exception $e) {
            $this->setStageStatus($cycleId, $stage, 'failed', false);
            $this->setLastError($cycleId, "[{$stage}] " . $e->getMessage());
            return [
                'success' => false,
                'waiting' => false,
                'error'   => $e->getMessage(),
                'message' => $e->getMessage(),
            ];
        }
    }

    // =========================================================================
    //  Stage runners
    // =========================================================================

    /**
     * Combined: Baskets validation then Orders prepare (no approve).
     * Legacy entry point — equivalent to clicking both manually.
     */
    private function runBasketsAndPrepare(array $cycle, int $cycleId): array
    {
        $basketStatus = $cycle['stage_baskets'] ?? 'pending';
        $orderStatus  = $cycle['stage_orders']  ?? 'pending';

        // ── Baskets (skip if already completed) ──────────────────────────────
        if ($basketStatus !== 'completed') {
            $this->setStageStatus($cycleId, 'baskets', 'in_progress', $basketStatus === 'pending');
            try {
                $bResult = $this->runBaskets($cycle);
                $this->setStageStatus($cycleId, 'baskets', 'completed', false);
                $this->advanceCycleStage($cycleId, 'baskets');
                $this->clearLastError($cycleId);
            } catch (\Throwable $e) {
                $this->setStageStatus($cycleId, 'baskets', 'failed', false);
                $this->setLastError($cycleId, '[baskets] ' . $e->getMessage());
                return ['success' => false, 'waiting' => false, 'error' => '[baskets] ' . $e->getMessage()];
            }
        }

        // Re-fetch cycle to get updated stage_baskets
        $cycleRow = $this->conn->prepare("SELECT * FROM pipeline_cycles WHERE id = ?");
        $cycleRow->execute([$cycleId]);
        $cycle = $cycleRow->fetch(\PDO::FETCH_ASSOC) ?: $cycle;

        // ── Orders prepare (leaves stage_orders='staged') ────────────────────
        if (!in_array($orderStatus, ['staged', 'completed'])) {
            $this->setStageStatus($cycleId, 'orders', 'in_progress', $orderStatus === 'pending');
            try {
                $oResult = $this->runOrdersPrepareInternal($cycle, $cycleId);
                $this->setStageStatus($cycleId, 'orders', 'staged', false);
                $this->clearLastError($cycleId);
            } catch (\Throwable $e) {
                $this->setStageStatus($cycleId, 'orders', 'failed', false);
                $this->setLastError($cycleId, '[orders] ' . $e->getMessage());
                return ['success' => false, 'waiting' => false, 'error' => '[orders] ' . $e->getMessage()];
            }
        }

        return [
            'success'          => true,
            'waiting'          => false,
            'baskets'          => $bResult ?? ['skipped' => true],
            'orders'           => $oResult ?? ['skipped' => true],
            'eligible_members' => ($bResult ?? [])['eligible_members'] ?? null,
            'orders_staged'    => ($oResult ?? [])['orders_staged']    ?? null,
            'batch_id'         => ($oResult ?? [])['batch_id']         ?? null,
            'message'          => ($oResult ?? [])['message']          ?? 'Batch staged — review on Prepare Orders page.',
        ];
    }

    /**
     * BASKETS — validate eligible members for this merchant.
     */
    private function runBaskets(array $cycle): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        $res = $this->internalPost('prepare_orders.php', [
            'action'      => 'preview',
            'merchant_id' => $mid,
        ]);

        if (empty($res['success'])) {
            throw new \Exception(
                'Preview failed: ' . ($res['error'] ?? 'prepare_orders.php preview returned no data.')
            );
        }

        $eligible = (int) ($res['eligible_members'] ?? 0);

        if ($eligible === 0) {
            throw new \Exception(
                "No eligible members found for merchant '{$mid}'. " .
                "Members need points, an active basket, and an investment election before orders can be prepared."
            );
        }

        $byMerchant  = $res['by_merchant'] ?? [];
        $totalAmount = 0;
        foreach ($byMerchant as $m) {
            $totalAmount += (float) ($m['total_amount'] ?? $m['amount'] ?? 0);
        }

        return [
            'eligible_members' => $eligible,
            'total_amount'     => $totalAmount,
            'by_merchant'      => $byMerchant,
            'message'          => "{$eligible} eligible member(s) with active baskets ready" .
                                  ($totalAmount > 0 ? " — estimated $" . number_format($totalAmount, 2) : "") . ".",
        ];
    }

    /**
     * ORDERS PREPARE — run the prepare step only.
     *
     * Public entry point called by runStage('orders').
     * Sets stage_orders = 'staged' and waits for admin approval.
     */
    private function runOrdersPrepare(array $cycle, int $cycleId): array
    {
        $alreadyStarted = !empty($cycle['stage_orders'])
                          && $cycle['stage_orders'] !== 'pending';
        $this->setStageStatus($cycleId, 'orders', 'in_progress', !$alreadyStarted);

        try {
            $result = $this->runOrdersPrepareInternal($cycle, $cycleId);

            // Leave at 'staged' — admin must approve before completing
            $this->setStageStatus($cycleId, 'orders', 'staged', false);
            $this->clearLastError($cycleId);

            return ['success' => true, 'waiting' => false] + $result;

        } catch (\Exception $e) {
            $this->setStageStatus($cycleId, 'orders', 'failed', false);
            $this->setLastError($cycleId, '[orders] ' . $e->getMessage());
            return [
                'success' => false,
                'waiting' => false,
                'error'   => $e->getMessage(),
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Internal prepare logic shared by runOrdersPrepare and runBasketsAndPrepare.
     */
    private function runOrdersPrepareInternal(array $cycle, int $cycleId): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        $prep = $this->internalPost('prepare_orders.php', [
            'action'      => 'prepare',
            'merchant_id' => $mid,
        ]);

        if (empty($prep['success'])) {
            throw new \Exception($prep['error'] ?? 'prepare_orders prepare step failed.');
        }

        $batchId = $prep['batch_id'] ?? null;
        if (!$batchId) {
            throw new \Exception('prepare_orders returned no batch_id.');
        }

        // Attach batch to cycle so subsequent stages can reference it
        $this->attachBatch($cycleId, $batchId);

        $staged   = (int)   ($prep['results']['total_orders']  ?? 0);
        $members  = (int)   ($prep['results']['total_members'] ?? 0);
        $amount   = (float) ($prep['results']['total_amount']  ?? 0);
        $duration = (float) ($prep['results']['duration_seconds'] ?? 0);
        $isRefresh = (bool) ($prep['is_refresh'] ?? false);

        $mode = $isRefresh ? 'refreshed' : 'staged';

        return [
            'batch_id'      => $batchId,
            'orders_staged' => $staged,
            'members'       => $members,
            'total_amount'  => $amount,
            'is_refresh'    => $isRefresh,
            'message'       => "Batch {$batchId}: {$staged} order(s) {$mode} for {$members} member(s)" .
                               ($amount > 0 ? " ($" . number_format($amount, 2) . ")" : "") .
                               " — review on Prepare Orders page, then click Approve.",
        ];
    }

    /**
     * ORDERS APPROVE — run the approve step only.
     *
     * Called by runStage('orders_approve') after admin has reviewed the staged batch.
     * Advances stage_orders to 'completed'.
     */
    private function runOrdersApprove(array $cycle, int $cycleId): array
    {
        // Validate: stage_orders must be 'staged'
        $orderStatus = $cycle['stage_orders'] ?? 'pending';
        if ($orderStatus !== 'staged') {
            return [
                'success' => false,
                'waiting' => false,
                'error'   => "Orders stage is '{$orderStatus}' — must be 'staged' before approving. Run the prepare step first.",
                'message' => "Orders stage is '{$orderStatus}' — must be 'staged' before approving.",
            ];
        }

        // Resolve batch_id
        $batchId = $cycle['batch_id'] ?? null;
        if (!$batchId) {
            return [
                'success' => false,
                'waiting' => false,
                'error'   => 'No batch_id attached to this cycle. Run the prepare step first.',
                'message' => 'No batch attached — run prepare first.',
            ];
        }

        $this->setStageStatus($cycleId, 'orders', 'in_progress', false);

        try {
            $appr = $this->internalPost('prepare_orders.php', [
                'action'   => 'approve',
                'batch_id' => $batchId,
            ]);

            if (empty($appr['success'])) {
                throw new \Exception(
                    "Approve failed for batch {$batchId}: " .
                    ($appr['error'] ?? 'unknown error')
                );
            }

            $created  = (int)   ($appr['orders_created']   ?? 0);
            $skipped  = (int)   ($appr['orders_skipped']   ?? 0);
            $flagged  = (int)   ($appr['orders_flagged']   ?? 0);
            $duration = (float) ($appr['duration_seconds'] ?? 0);

            // Advance to completed and move pipeline forward
            $this->setStageStatus($cycleId, 'orders', 'completed', false);
            $this->advanceCycleStage($cycleId, 'orders');
            $this->syncCounts($cycleId);
            $this->clearLastError($cycleId);

            $suffix = '';
            if ($skipped > 0) $suffix .= ", {$skipped} skipped";
            if ($flagged > 0) $suffix .= ", {$flagged} flagged";
            if ($duration > 0) $suffix .= " in {$duration}s";

            return [
                'success'        => true,
                'waiting'        => false,
                'batch_id'       => $batchId,
                'orders_created' => $created,
                'orders_skipped' => $skipped,
                'orders_flagged' => $flagged,
                'message'        => "Batch {$batchId}: {$created} order(s) approved and ready for payment{$suffix}.",
            ];

        } catch (\Exception $e) {
            $this->setStageStatus($cycleId, 'orders', 'failed', false);
            $this->setLastError($cycleId, '[orders_approve] ' . $e->getMessage());
            return [
                'success' => false,
                'waiting' => false,
                'error'   => $e->getMessage(),
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * PAYMENT — initiate merchant funding via Plaid ACH or generate CSV export.
     */
    private function runPayment(array $cycle): array
    {
        $mid    = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';
        $broker = $cycle['broker_id'];
        $method = $cycle['funding_method'] ?? 'manual';

        if ($method === 'plaid') {
            $res = $this->internalPost('plaid-initiate-funding.php', [
                'merchant_id' => $mid,
                'broker'      => $broker,
            ]);

            if (empty($res['success'])) {
                throw new \Exception(
                    'Plaid funding initiation failed: ' . ($res['error'] ?? 'unknown')
                );
            }

            return [
                'method'              => 'plaid',
                'transfer_id'         => $res['transfer_id']        ?? null,
                'order_count'         => $res['order_count']        ?? 0,
                'amount'              => $res['amount']             ?? 0,
                'status'              => $res['status']             ?? 'pending',
                'expected_settlement' => $res['expected_settlement'] ?? null,
                'institution'         => $res['institution']        ?? null,
                'account_mask'        => $res['account_mask']       ?? null,
                'message'             => 'Plaid ACH transfer initiated. Funds will settle in 1–3 business days.',
            ];
        }

        // ── CSV / manual ACH export ──────────────────────────────────────────
        $res = $this->internalPost('export-payments-file.php', [
            'merchant_id' => $mid,
            'broker'      => $broker,
        ]);

        if (empty($res['success'])) {
            throw new \Exception('Payment file export failed: ' . ($res['error'] ?? 'unknown'));
        }

        return [
            'method'       => 'manual_ach',
            'batch_id'     => $res['batch_id']    ?? null,
            'order_count'  => $res['order_count'] ?? 0,
            'total_amount' => $res['total_amount'] ?? 0,
            'xlsx'         => $res['xlsx']         ?? null,
            'detail_csv'   => $res['detail_csv']   ?? null,
            'ach_csv'      => $res['ach_csv']      ?? null,
            'message'      => 'ACH export files generated. Upload the ACH CSV to your bank portal.',
        ];
    }

    /**
     * FUNDING — verify all batch orders have paid_flag = 1.
     */
    private function runFunding(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        if (!$batchId) {
            throw new \Exception(
                'No batch attached to this cycle. Complete the Orders stage first.'
            );
        }

        $stmt = $this->conn->prepare("
            SELECT
                COUNT(*)                                              AS total,
                SUM(CASE WHEN paid_flag = 1 THEN 1 ELSE 0 END)      AS paid,
                SUM(CASE WHEN paid_flag = 0 OR paid_flag IS NULL
                         THEN 1 ELSE 0 END)                          AS unpaid,
                COALESCE(SUM(amount), 0)                             AS total_amount
            FROM orders
            WHERE batch_id = ?
        ");
        $stmt->execute([$batchId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        $total  = (int)   ($row['total']        ?? 0);
        $paid   = (int)   ($row['paid']         ?? 0);
        $unpaid = (int)   ($row['unpaid']        ?? 0);
        $amount = (float) ($row['total_amount'] ?? 0);

        if ($total === 0) {
            throw new \Exception("No orders found in batch {$batchId}.");
        }

        if ($unpaid > 0) {
            throw new StageWaitingException(
                "{$unpaid} of {$total} order(s) not yet marked as paid. " .
                "Run 'Mark Payments Paid' in Payments Processing, then re-run this check."
            );
        }

        return [
            'batch_id'     => $batchId,
            'total_orders' => $total,
            'paid_orders'  => $paid,
            'total_amount' => $amount,
            'message'      => "All {$paid} order(s) ($" . number_format($amount, 2) . ") confirmed as funded.",
        ];
    }

    /**
     * JOURNAL — sweep journal entries to member Alpaca accounts.
     */
    private function runJournal(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        if ($batchId) {
            $stmt = $this->conn->prepare("
                SELECT DISTINCT member_id
                FROM   orders
                WHERE  batch_id  = ?
                  AND  status    = 'approved'
                  AND  paid_flag = 1
            ");
            $stmt->execute([$batchId]);
        } else {
            $stmt = $this->conn->prepare("
                SELECT DISTINCT member_id
                FROM   orders
                WHERE  merchant_id = ?
                  AND  status      = 'approved'
                  AND  paid_flag   = 1
            ");
            $stmt->execute([$mid]);
        }

        $memberIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        if (empty($memberIds)) {
            throw new \Exception(
                'No approved + paid orders found to journal. ' .
                'Ensure Orders and Funding stages are complete.'
            );
        }

        $res = $this->internalPost('cron-journal-sweep.php', [
            'action'     => 'run',
            'member_ids' => $memberIds,
        ]);

        if (empty($res['success'])) {
            throw new \Exception('Journal sweep failed: ' . ($res['error'] ?? 'unknown'));
        }

        $funded   = $res['members_funded']   ?? 0;
        $journals = $res['journals_created'] ?? 0;
        $total    = $res['total_journaled']  ?? 0;

        return [
            'member_count'     => count($memberIds),
            'members_funded'   => $funded,
            'journals_created' => $journals,
            'total_journaled'  => $total,
            'message'          => "Journaled $" . number_format($total, 2) .
                                  " to {$funded} member account(s). {$journals} journal(s) created.",
        ];
    }

    /**
     * PLACEMENT — sweep orders to 'placed' status.
     */
    private function runPlacement(array $cycle): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        $res = $this->internalPost('trigger_sweep.php', [
            'action'      => 'run',
            'merchant_id' => $mid,
        ]);

        if (empty($res['success'])) {
            throw new \Exception('Sweep / placement failed: ' . ($res['error'] ?? 'unknown'));
        }

        $placed = $res['orders_placed'] ?? ($res['count'] ?? ($res['total_processed'] ?? 0));

        return [
            'merchant_id'   => $mid,
            'orders_placed' => (int) $placed,
            'message'       => "{$placed} order(s) placed for merchant {$mid}.",
        ];
    }

    /**
     * SUBMISSION — submit placed orders to broker.
     */
    private function runSubmission(array $cycle): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        $res = $this->internalPost('broker-execute.php', [
            'action'      => 'execute_merchant',
            'merchant_id' => $mid,
        ]);

        if (empty($res['success'])) {
            throw new \Exception('Broker submission failed: ' . ($res['error'] ?? 'unknown'));
        }

        $executed = (int)   ($res['orders_executed']  ?? 0);
        $failed   = (int)   ($res['orders_failed']    ?? 0);
        $duration = (float) ($res['duration_seconds'] ?? 0);
        $execId   = $res['exec_id'] ?? null;

        if ($executed === 0 && $failed > 0) {
            throw new \Exception(
                "All {$failed} order(s) failed broker submission. Check broker logs."
            );
        }

        return [
            'exec_id'           => $execId,
            'orders_executed'   => $executed,
            'orders_failed'     => $failed,
            'baskets_processed' => $res['baskets_processed'] ?? 0,
            'duration_seconds'  => $duration,
            'message'           => "Submitted {$executed} order(s) to broker" .
                                   ($failed > 0 ? " ({$failed} failed)" : "") .
                                   ($execId ? ". Exec ID: {$execId}" : "."),
        ];
    }

    /**
     * EXECUTION — poll for broker fill confirmation.
     */
    private function runExecution(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        $where = $batchId ? "batch_id = ?" : "merchant_id = ?";
        $param = $batchId ?? $mid;

        $stmt = $this->conn->prepare("
            SELECT
                COUNT(*)                                                             AS total,
                SUM(CASE WHEN status IN ('executed','confirmed') THEN 1 ELSE 0 END) AS executed,
                SUM(CASE WHEN status = 'submitted'              THEN 1 ELSE 0 END) AS submitted,
                SUM(CASE WHEN status = 'placed'                 THEN 1 ELSE 0 END) AS placed,
                SUM(CASE WHEN status = 'failed'                 THEN 1 ELSE 0 END) AS failed,
                COALESCE(SUM(CASE WHEN status IN ('executed','confirmed')
                                  THEN amount ELSE 0 END), 0)                      AS amount_executed
            FROM orders
            WHERE {$where}
        ");
        $stmt->execute([$param]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        $total     = (int)   ($row['total']           ?? 0);
        $executed  = (int)   ($row['executed']         ?? 0);
        $submitted = (int)   ($row['submitted']        ?? 0);
        $placed    = (int)   ($row['placed']           ?? 0);
        $failed    = (int)   ($row['failed']           ?? 0);
        $amtExec   = (float) ($row['amount_executed']  ?? 0);

        $inFlight = $submitted + $placed;

        if ($inFlight > 0) {
            throw new StageWaitingException(
                "{$inFlight} order(s) still in flight (submitted: {$submitted}, placed: {$placed}). " .
                "Waiting for broker fill confirmations. Re-run to check again."
            );
        }

        if ($executed === 0 && $total > 0) {
            throw new StageWaitingException(
                "No executed orders yet out of {$total}. " .
                "Broker fills may still be pending. Re-run to check again."
            );
        }

        return [
            'total_orders'    => $total,
            'executed_orders' => $executed,
            'failed_orders'   => $failed,
            'amount_executed' => $amtExec,
            'message'         => "{$executed} of {$total} order(s) confirmed executed" .
                                 ($failed > 0 ? " ({$failed} failed)" : "") . ".",
        ];
    }

    /**
     * SETTLEMENT — mark all executed/confirmed orders as settled.
     */
    private function runSettlement(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id_str'] ?? '';

        if ($batchId) {
            $stmt = $this->conn->prepare("
                UPDATE orders
                SET    status = 'settled'
                WHERE  batch_id = ?
                  AND  status IN ('executed', 'confirmed')
            ");
            $stmt->execute([$batchId]);
        } else {
            $stmt = $this->conn->prepare("
                UPDATE orders
                SET    status = 'settled'
                WHERE  merchant_id = ?
                  AND  status IN ('executed', 'confirmed')
            ");
            $stmt->execute([$mid]);
        }

        $count = $stmt->rowCount();

        if ($count === 0) {
            throw new \Exception(
                'No executed or confirmed orders found to settle. ' .
                'Ensure the Execution stage is complete.'
            );
        }

        return [
            'orders_settled' => $count,
            'batch_id'       => $batchId,
            'message'        => "{$count} order(s) marked as settled. Cycle complete.",
        ];
    }

    // =========================================================================
    //  DB helpers
    // =========================================================================

    private function setStageStatus(
        int    $cycleId,
        string $stage,
        string $status,
        bool   $setStartedAt
    ): void {
        $col = "stage_{$stage}";
        $now = gmdate('Y-m-d H:i:s');

        $extra = '';
        if ($setStartedAt) {
            $extra .= ", `{$stage}_started_at` = '{$now}'";
        }
        if ($status === 'completed') {
            $extra .= ", `{$stage}_completed_at` = '{$now}'";
        }

        $this->conn->exec("
            UPDATE pipeline_cycles
            SET    `{$col}` = '{$status}'
                   {$extra},
                   updated_at = '{$now}'
            WHERE  id = {$cycleId}
        ");
    }

    private function advanceCycleStage(int $cycleId, string $completedStage): void
    {
        $stages = [
            'baskets','orders','payment','funding','journal',
            'placement','submission','execution','settlement',
        ];
        $now  = gmdate('Y-m-d H:i:s');
        $idx  = array_search($completedStage, $stages, true);
        $next = $stages[$idx + 1] ?? null;

        if ($next === null) {
            $this->conn->exec("
                UPDATE pipeline_cycles
                SET    status      = 'completed',
                       active_lock = NULL,
                       updated_at  = '{$now}'
                WHERE  id = {$cycleId}
            ");
        } else {
            $this->conn->exec("
                UPDATE pipeline_cycles
                SET    updated_at = '{$now}'
                WHERE  id = {$cycleId}
            ");
        }
    }

    private function attachBatch(int $cycleId, string $batchId): void
    {
        $safe = $this->conn->quote($batchId);
        $now  = gmdate('Y-m-d H:i:s');
        $this->conn->exec("
            UPDATE pipeline_cycles
            SET    batch_id    = {$safe},
                   updated_at  = '{$now}'
            WHERE  id = {$cycleId}
        ");
    }

    private function setLastError(int $cycleId, string $error): void
    {
        $safe = $this->conn->quote(mb_substr($error, 0, 500));
        $now  = gmdate('Y-m-d H:i:s');
        $this->conn->exec("
            UPDATE pipeline_cycles
            SET    last_error  = {$safe},
                   updated_at  = '{$now}'
            WHERE  id = {$cycleId}
        ");
    }

    private function syncCounts(int $cycleId): void
    {
        $stmt = $this->conn->prepare("SELECT batch_id FROM pipeline_cycles WHERE id = ?");
        $stmt->execute([$cycleId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (empty($row['batch_id'])) return;

        $batchId = $row['batch_id'];

        $cStmt = $this->conn->prepare("
            SELECT
                COUNT(DISTINCT basket_id)                                                    AS baskets_total,
                COUNT(*)                                                                     AS orders_total,
                SUM(status = 'approved')                                                     AS orders_approved,
                SUM(status = 'funded')                                                       AS orders_funded,
                SUM(status IN ('placed','submitted','confirmed','executed'))                  AS orders_placed,
                SUM(status IN ('submitted','confirmed','executed'))                           AS orders_submitted,
                SUM(status = 'settled')                                                      AS orders_settled,
                SUM(status = 'failed')                                                       AS orders_failed,
                SUM(status = 'cancelled')                                                    AS orders_cancelled,
                COALESCE(SUM(amount), 0)                                                     AS amount_total,
                COALESCE(SUM(CASE WHEN status IN ('funded','placed','submitted','confirmed','executed','settled')
                                  THEN amount END), 0)                                       AS amount_funded,
                COALESCE(SUM(CASE WHEN status = 'settled' THEN amount END), 0)               AS amount_settled
            FROM orders
            WHERE batch_id = ?
        ");
        $cStmt->execute([$batchId]);
        $c = $cStmt->fetch(\PDO::FETCH_ASSOC);

        $upd = $this->conn->prepare("
            UPDATE pipeline_cycles SET
                baskets_total    = :baskets_total,
                orders_total     = :orders_total,
                orders_approved  = :orders_approved,
                orders_funded    = :orders_funded,
                orders_placed    = :orders_placed,
                orders_submitted = :orders_submitted,
                orders_settled   = :orders_settled,
                orders_failed    = :orders_failed,
                orders_cancelled = :orders_cancelled,
                amount_total     = :amount_total,
                amount_funded    = :amount_funded,
                amount_settled   = :amount_settled,
                updated_at       = NOW()
            WHERE id = :id
        ");
        $upd->execute([
            ':baskets_total'    => (int)   ($c['baskets_total']    ?? 0),
            ':orders_total'     => (int)   ($c['orders_total']     ?? 0),
            ':orders_approved'  => (int)   ($c['orders_approved']  ?? 0),
            ':orders_funded'    => (int)   ($c['orders_funded']    ?? 0),
            ':orders_placed'    => (int)   ($c['orders_placed']    ?? 0),
            ':orders_submitted' => (int)   ($c['orders_submitted'] ?? 0),
            ':orders_settled'   => (int)   ($c['orders_settled']   ?? 0),
            ':orders_failed'    => (int)   ($c['orders_failed']    ?? 0),
            ':orders_cancelled' => (int)   ($c['orders_cancelled'] ?? 0),
            ':amount_total'     => (float) ($c['amount_total']     ?? 0),
            ':amount_funded'    => (float) ($c['amount_funded']    ?? 0),
            ':amount_settled'   => (float) ($c['amount_settled']   ?? 0),
            ':id'               => $cycleId,
        ]);
    }

    private function clearLastError(int $cycleId): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $this->conn->exec("
            UPDATE pipeline_cycles
            SET    last_error  = NULL,
                   updated_at  = '{$now}'
            WHERE  id = {$cycleId}
        ");
    }

    // =========================================================================
    //  Internal HTTP helper
    // =========================================================================

    private function internalPost(string $endpoint, array $payload): array
    {
        $host  = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $dir   = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/pipeline-cycles.php'), '/');
        $url   = "{$proto}://{$host}{$dir}/{$endpoint}";

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 90,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
        ]);

        $raw      = curl_exec($ch);
        $curlErr  = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($curlErr) {
            throw new \Exception(
                "Internal request to '{$endpoint}' failed (curl): {$curlErr}"
            );
        }

        $data = json_decode($raw, true);
        if ($data === null) {
            throw new \Exception(
                "Invalid JSON from '{$endpoint}' (HTTP {$httpCode}): " .
                mb_substr($raw, 0, 300)
            );
        }

        return $data;
    }
}
