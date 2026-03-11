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

        // ── Combined baskets_orders stage ───────────────────────────────────
        if ($stage === 'baskets_orders') {
            return $this->runBasketsAndOrders($cycle, $cycleId);
        }

        // Mark stage in_progress + set started_at on first run
        $alreadyStarted = !empty($cycle["stage_{$stage}"])
                          && $cycle["stage_{$stage}"] !== 'pending';
        $this->setStageStatus($cycleId, $stage, 'in_progress', !$alreadyStarted);

        try {
            $result = match ($stage) {
                'baskets'    => $this->runBaskets($cycle),
                'orders'     => $this->runOrders($cycle, $cycleId),
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
            // Polling stage — keep in_progress, record message, do NOT mark failed
            $this->setLastError($cycleId, "[{$stage} · waiting] " . $e->getMessage());
            return [
                'success' => false,
                'waiting' => true,
                'error'   => $e->getMessage(),
                'message' => $e->getMessage(),
            ];

        } catch (\Exception $e) {
            // Hard failure
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
     * BASKETS — validate eligible members with active stock picks exist for this merchant.
     * Mirrors the PrepareOrders preview check: calls prepare_orders.php action=preview
     * scoped to this merchant. Eligible = has points + active basket + investment election.
     */
    // ── Combined: Baskets then Orders in one button press ───────────────────
    private function runBasketsAndOrders(array $cycle, int $cycleId): array
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

        // Re-fetch cycle to get updated stage_baskets before orders
        $cycleRow = $this->conn->prepare("SELECT * FROM pipeline_cycles WHERE id = ?");
        $cycleRow->execute([$cycleId]);
        $cycle = $cycleRow->fetch(\PDO::FETCH_ASSOC) ?: $cycle;

        // ── Orders ───────────────────────────────────────────────────────────
        if ($orderStatus !== 'completed') {
            $this->setStageStatus($cycleId, 'orders', 'in_progress', $orderStatus === 'pending');
            try {
                $oResult = $this->runOrders($cycle, $cycleId);
                $this->setStageStatus($cycleId, 'orders', 'completed', false);
                $this->advanceCycleStage($cycleId, 'orders');
                $this->syncCounts($cycleId);
                $this->clearLastError($cycleId);
            } catch (\Throwable $e) {
                $this->setStageStatus($cycleId, 'orders', 'failed', false);
                $this->setLastError($cycleId, '[orders] ' . $e->getMessage());
                return ['success' => false, 'waiting' => false, 'error' => '[orders] ' . $e->getMessage()];
            }
        }

        return [
            'success' => true,
            'waiting' => false,
            'baskets' => $bResult ?? ['skipped' => true],
            'orders'  => $oResult ?? ['skipped' => true],
            // surface key metrics for the result pill panel
            'eligible_members' => ($bResult ?? [])['eligible_members'] ?? null,
            'orders_created'   => ($oResult ?? [])['orders_created']   ?? null,
            'orders_approved'  => ($oResult ?? [])['orders_approved']  ?? null,
            'batch_id'         => ($oResult ?? [])['batch_id']         ?? null,
        ];
    }

    private function runBaskets(array $cycle): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

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

        // Pull through useful preview stats for the result panel
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
     * ORDERS — prepare a new batch then approve it.
     * Calls prepare_orders.php (prepare → approve) and attaches the batch to the cycle.
     */
    private function runOrders(array $cycle, int $cycleId): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

        // ── Step 1: prepare ──────────────────────────────────────────────────
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

        // Attach batch to cycle immediately so other stages can reference it
        $this->attachBatch($cycleId, $batchId);

        // ── Step 2: approve ──────────────────────────────────────────────────
        $appr = $this->internalPost('prepare_orders.php', [
            'action'   => 'approve',
            'batch_id' => $batchId,
        ]);

        if (empty($appr['success'])) {
            throw new \Exception(
                "Batch {$batchId} prepare succeeded but approve failed: " .
                ($appr['error'] ?? 'unknown error')
            );
        }

        // prepare returns: batch_id, nothing_to_stage
        // approve returns: orders_created, orders_skipped, orders_flagged, duration_seconds
        $apprCount = (int)   ($appr['orders_created']  ?? 0);
        $skipped   = (int)   ($appr['orders_skipped']  ?? 0);
        $flagged   = (int)   ($appr['orders_flagged']  ?? 0);
        $duration  = (float) ($appr['duration_seconds'] ?? 0);
        $amount    = (float) ($prep['total_amount']    ?? 0);

        $suffix = '';
        if ($skipped > 0) $suffix .= ", {$skipped} skipped";
        if ($flagged > 0) $suffix .= ", {$flagged} flagged";
        if ($duration > 0) $suffix .= " in {$duration}s";

        return [
            'batch_id'        => $batchId,
            'orders_created'  => $apprCount,
            'orders_skipped'  => $skipped,
            'orders_flagged'  => $flagged,
            'total_amount'    => $amount,
            'message'         => "Batch {$batchId}: {$apprCount} order(s) created and approved{$suffix}.",
        ];
    }

    /**
     * PAYMENT — initiate merchant funding via Plaid ACH or generate CSV export.
     */
    private function runPayment(array $cycle): array
    {
        $mid    = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';
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
     *
     * Throws StageWaitingException (keeps stage in_progress) if payment
     * has not yet been confirmed. Operator re-runs after marking payments paid.
     */
    private function runFunding(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

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
            // Polling — not a hard failure
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
     * JOURNAL — sweep journal entries to member Alpaca accounts,
     * scoped to members in this cycle's batch.
     */
    private function runJournal(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

        // Scope to this batch's members (approved + paid)
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
                'Ensure the Funding stage has been completed.'
            );
        }

        $res = $this->internalPost('journal-sweep.php', [
            'action'     => 'journal',
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
     * PLACEMENT — sweep orders to 'placed' status via trigger_sweep.php.
     */
    private function runPlacement(array $cycle): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

        $res = $this->internalPost('trigger_sweep.php', [
            'action'      => 'run',
            'merchant_id' => $mid,
        ]);

        if (empty($res['success'])) {
            throw new \Exception('Sweep / placement failed: ' . ($res['error'] ?? 'unknown'));
        }

        $placed = $res['orders_placed'] ?? ($res['count'] ?? ($res['total_processed'] ?? 0));

        return [
            'merchant_id'  => $mid,
            'orders_placed'=> (int) $placed,
            'message'      => "{$placed} order(s) placed for merchant {$mid}.",
        ];
    }

    /**
     * SUBMISSION — submit placed orders to broker via execute_merchant.
     */
    private function runSubmission(array $cycle): array
    {
        $mid = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

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
            'exec_id'          => $execId,
            'orders_executed'  => $executed,
            'orders_failed'    => $failed,
            'baskets_processed'=> $res['baskets_processed'] ?? 0,
            'duration_seconds' => $duration,
            'message'          => "Submitted {$executed} order(s) to broker" .
                                  ($failed > 0 ? " ({$failed} failed)" : "") .
                                  ($execId ? ". Exec ID: {$execId}" : "."),
        ];
    }

    /**
     * EXECUTION — poll for broker fill confirmation.
     *
     * Throws StageWaitingException if fills are still pending.
     * Marks complete once all submitted/placed orders reach executed/confirmed.
     */
    private function runExecution(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

        $where = $batchId ? "batch_id = ?" : "merchant_id = ?";
        $param = $batchId ?? $mid;

        $stmt = $this->conn->prepare("
            SELECT
                COUNT(*)                                                          AS total,
                SUM(CASE WHEN status IN ('executed','confirmed') THEN 1 ELSE 0 END) AS executed,
                SUM(CASE WHEN status = 'submitted'              THEN 1 ELSE 0 END) AS submitted,
                SUM(CASE WHEN status = 'placed'                 THEN 1 ELSE 0 END) AS placed,
                SUM(CASE WHEN status = 'failed'                 THEN 1 ELSE 0 END) AS failed,
                COALESCE(SUM(CASE WHEN status IN ('executed','confirmed')
                                  THEN amount ELSE 0 END), 0)                   AS amount_executed
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
     * SETTLEMENT — mark all executed/confirmed orders in the batch as settled.
     */
    private function runSettlement(array $cycle): array
    {
        $batchId = $cycle['batch_id'] ?? null;
        $mid     = $cycle['merchant_code'] ?? $cycle['merchant_id'] ?? '';

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
            // Settlement complete — close the cycle
            $this->conn->exec("
                UPDATE pipeline_cycles
                SET    status      = 'completed',
                       active_lock = NULL,
                       updated_at  = '{$now}'
                WHERE  id = {$cycleId}
            ");
        } else {
            // Just touch updated_at — current_stage is derived in PHP from stage columns
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
        // Fetch batch_id for this cycle (may be null if orders stage hasn't run yet)
        $stmt = $this->conn->prepare("SELECT batch_id FROM pipeline_cycles WHERE id = ?");
        $stmt->execute([$cycleId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (empty($row['batch_id'])) return; // nothing to aggregate yet

        $batchId = $row['batch_id'];

        $cStmt = $this->conn->prepare("
            SELECT
                COUNT(*)                                                                       AS orders_total,
                SUM(status = 'approved')                                                       AS orders_approved,
                SUM(status = 'funded')                                                         AS orders_funded,
                SUM(status IN ('placed','submitted','confirmed','executed'))                    AS orders_placed,
                SUM(status IN ('submitted','confirmed','executed'))                            AS orders_submitted,
                SUM(status = 'settled')                                                        AS orders_settled,
                SUM(status = 'failed')                                                         AS orders_failed,
                SUM(status = 'cancelled')                                                      AS orders_cancelled,
                COALESCE(SUM(amount), 0)                                                       AS amount_total,
                COALESCE(SUM(CASE WHEN status IN ('funded','placed','submitted','confirmed','executed','settled')
                                  THEN amount END), 0)                                         AS amount_funded,
                COALESCE(SUM(CASE WHEN status = 'settled' THEN amount END), 0)                 AS amount_settled
            FROM orders
            WHERE batch_id = ?
        ");
        $cStmt->execute([$batchId]);
        $c = $cStmt->fetch(\PDO::FETCH_ASSOC);

        $upd = $this->conn->prepare("
            UPDATE pipeline_cycles SET
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

    /**
     * POST JSON to another endpoint on the same server (loopback).
     *
     * Derives the URL from $_SERVER so it works on any hostname / path prefix.
     * All existing endpoints default actor to 'admin' if no auth header is sent.
     */
    private function internalPost(string $endpoint, array $payload): array
    {
        $host  = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        // dirname of e.g. /api/pipeline-cycles.php → /api
        $dir   = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/pipeline-cycles.php'), '/');
        $url   = "{$proto}://{$host}{$dir}/{$endpoint}";

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 90,           // broker calls can be slow
            CURLOPT_SSL_VERIFYPEER => false,         // loopback — cert not needed
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
