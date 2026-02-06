<?php
declare(strict_types=1);

/**
 * prepare_orders_process.php — Staging-based order preparation
 *
 * Scalable approach: all row creation via INSERT...SELECT (no PHP loops).
 *
 * Workflow:
 *   1. previewCounts() → Read-only aggregate estimate (no rows written)
 *   2. prepare()       → INSERT...SELECT into prepared_orders (staged)
 *   3. stats()         → Aggregated breakdowns for a staged batch
 *   4. drilldown()     → Paginated member-level detail for a batch
 *   5. approve()       → INSERT...SELECT from prepared_orders → orders
 *   6. discard()       → Mark batch discarded (rows kept for audit)
 *   7. batches()       → List all preparation batches
 *
 * Tables read:   member_stock_picks, wallet, merchant
 * Tables write:  prepared_orders, prepare_batches, orders
 */

class PrepareOrdersProcess
{
    private PDO    $conn;
    private string $logFile;
    private array  $errors      = [];
    private array  $logMessages = [];

    public function __construct(PDO $conn)
    {
        $this->conn = $conn;

        $logDir = '/var/www/html/stockloyal-pwa/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0755, true);
        }
        $this->logFile = $logDir . '/prepare-orders.log';
    }

    private function log(string $msg): void
    {
        $ts = gmdate('Y-m-d H:i:s');
        $line = "[{$ts}] {$msg}";
        $this->logMessages[] = $line;
        @file_put_contents($this->logFile, "{$line}\n", FILE_APPEND);
    }

    // ====================================================================
    // SQL EXPRESSION: merchant tier conversion rate
    //
    // Matches w.member_tier against m.tier1_name … m.tier6_name.
    // Fallback: merchant.conversion_rate → 0.01
    // ====================================================================

    private function tierRateExpr(): string
    {
        $cases = [];
        for ($i = 1; $i <= 6; $i++) {
            $cases[] = "WHEN w.member_tier IS NOT NULL "
                     . "AND w.member_tier != '' "
                     . "AND w.member_tier = m.tier{$i}_name "
                     . "AND m.tier{$i}_conversion_rate > 0 "
                     . "THEN m.tier{$i}_conversion_rate";
        }
        return "CASE\n                " . implode("\n                ", $cases)
             . "\n                WHEN m.conversion_rate > 0 THEN m.conversion_rate"
             . "\n                ELSE 0.01"
             . "\n            END";
    }

    /**
     * Effective sweep %: treat 0 as 100 (sweep all points).
     */
    private function sweepPctExpr(): string
    {
        return "IF(w.sweep_percentage > 0, w.sweep_percentage, 100)";
    }

    /**
     * Sweep points = FLOOR(points × effective_pct / 100)
     */
    private function sweepPointsExpr(): string
    {
        $pct = $this->sweepPctExpr();
        return "FLOOR(w.points * ({$pct}) / 100)";
    }

    /**
     * Subquery: count of active picks per member.
     * Used as a JOIN to divide amounts evenly across picks.
     */
    private function pickCountSubquery(): string
    {
        return "(SELECT member_id, COUNT(*) AS cnt
                 FROM member_stock_picks
                 WHERE is_active = 1
                 GROUP BY member_id)";
    }


    // ====================================================================
    // PUBLIC — previewCounts()
    // Quick read-only totals before preparing. No rows written.
    // ====================================================================

    public function previewCounts(?string $merchantId = null): array
    {
        try {
            $rate       = $this->tierRateExpr();
            $sweepPts   = $this->sweepPointsExpr();
            $pcSub      = $this->pickCountSubquery();

            $merchantW  = $merchantId ? "AND w.merchant_id = ?" : "";
            $params     = $merchantId ? [$merchantId] : [];

            // ── Eligible totals ──
            $sql = "
                SELECT
                    COUNT(DISTINCT msp.member_id)    AS eligible_members,
                    COUNT(*)                         AS total_picks,
                    COALESCE(SUM(
                        ROUND(({$sweepPts}) * ({$rate}) / pc.cnt, 2)
                    ), 0) AS est_total_amount,
                    COALESCE(SUM(
                        FLOOR(({$sweepPts}) / pc.cnt)
                    ), 0) AS est_total_points
                FROM member_stock_picks msp
                JOIN wallet w          ON w.member_id = msp.member_id
                LEFT JOIN merchant m   ON w.merchant_id = m.merchant_id
                JOIN {$pcSub} pc       ON pc.member_id  = msp.member_id
                WHERE msp.is_active = 1
                  AND w.points > 0
                  {$merchantW}
            ";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute($params);
            $counts = $stmt->fetch(PDO::FETCH_ASSOC);

            // ── Skipped (0 points but have picks) ──
            $skipSql = "
                SELECT COUNT(DISTINCT msp.member_id)
                FROM member_stock_picks msp
                JOIN wallet w ON w.member_id = msp.member_id
                WHERE msp.is_active = 1 AND w.points <= 0
            ";
            $skipped = (int) ($this->conn->query($skipSql)->fetchColumn() ?: 0);

            // ── By merchant ──
            $byMerch = $this->conn->prepare("
                SELECT w.merchant_id,
                       COALESCE(m2.merchant_name, w.merchant_id) AS merchant_name,
                       COUNT(DISTINCT msp.member_id) AS members,
                       COUNT(*) AS picks
                FROM member_stock_picks msp
                JOIN wallet w          ON w.member_id = msp.member_id
                LEFT JOIN merchant m2  ON w.merchant_id = m2.merchant_id
                WHERE msp.is_active = 1 AND w.points > 0
                {$merchantW}
                GROUP BY w.merchant_id, merchant_name
                ORDER BY members DESC
            ");
            $byMerch->execute($params);

            return [
                'success'          => true,
                'eligible_members' => (int)   ($counts['eligible_members'] ?? 0),
                'total_picks'      => (int)   ($counts['total_picks'] ?? 0),
                'est_total_amount' => (float) ($counts['est_total_amount'] ?? 0),
                'est_total_points' => (int)   ($counts['est_total_points'] ?? 0),
                'members_skipped'  => $skipped,
                'by_merchant'      => $byMerch->fetchAll(PDO::FETCH_ASSOC),
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — prepare()
    // Bulk INSERT...SELECT into prepared_orders staging table.
    // ====================================================================

    public function prepare(?string $memberId = null, ?string $merchantId = null): array
    {
        $batchId   = 'PREP-' . date('Ymd-His') . '-' . substr(uniqid(), -6);
        $startTime = microtime(true);

        $this->log(str_repeat('=', 80));
        $this->log("PREPARE START: {$batchId}");
        if ($memberId)   $this->log("  filter member:   {$memberId}");
        if ($merchantId) $this->log("  filter merchant: {$merchantId}");

        try {
            $rate     = $this->tierRateExpr();
            $pct      = $this->sweepPctExpr();
            $sweepPts = $this->sweepPointsExpr();
            $pcSub    = $this->pickCountSubquery();

            // ── Dynamic WHERE ──
            $wheres = ["msp.is_active = 1", "w.points > 0"];
            $params = [];

            if ($memberId) {
                $wheres[] = "msp.member_id = ?";
                $params[] = $memberId;
            }
            if ($merchantId) {
                $wheres[] = "w.merchant_id = ?";
                $params[] = $merchantId;
            }

            $where = implode(' AND ', $wheres);

            // ── Single INSERT...SELECT ──
            // basket_id = batchId + '-' + member_id  (one basket per member per batch)
            $sql = "
                INSERT INTO prepared_orders
                    (batch_id, basket_id, member_id, merchant_id, symbol,
                     amount, points_used, broker, member_timezone,
                     member_tier, conversion_rate, sweep_percentage, status)
                SELECT
                    :bid,
                    CONCAT(:bid2, '-', msp.member_id),
                    msp.member_id,
                    w.merchant_id,
                    msp.symbol,
                    ROUND(({$sweepPts}) * ({$rate}) / pc.cnt, 2),
                    FLOOR(({$sweepPts}) / pc.cnt),
                    w.broker,
                    COALESCE(w.member_timezone, 'America/New_York'),
                    w.member_tier,
                    ({$rate}),
                    ({$pct}),
                    'staged'
                FROM member_stock_picks msp
                JOIN wallet w          ON w.member_id = msp.member_id
                LEFT JOIN merchant m   ON w.merchant_id = m.merchant_id
                JOIN {$pcSub} pc       ON pc.member_id  = msp.member_id
                WHERE {$where}
            ";

            // Use named params for batch_id (appears twice), positional for filters
            // Easier to go all-positional:
            $sql = str_replace(':bid2', '?', str_replace(':bid', '?', $sql));
            array_unshift($params, $batchId, $batchId);

            $stmt = $this->conn->prepare($sql);
            $stmt->execute($params);
            $rowsInserted = $stmt->rowCount();

            $this->log("INSERT...SELECT: {$rowsInserted} staged rows");

            // ── Skipped members count ──
            $skipSql = "
                SELECT COUNT(DISTINCT msp.member_id)
                FROM member_stock_picks msp
                JOIN wallet w ON w.member_id = msp.member_id
                WHERE msp.is_active = 1 AND w.points <= 0
            ";
            $skipped = (int) ($this->conn->query($skipSql)->fetchColumn() ?: 0);

            // ── Aggregate from staged rows ──
            $aggStmt = $this->conn->prepare("
                SELECT COUNT(DISTINCT member_id) AS total_members,
                       COUNT(*)                  AS total_orders,
                       COALESCE(SUM(amount), 0)      AS total_amount,
                       COALESCE(SUM(points_used), 0)  AS total_points
                FROM prepared_orders
                WHERE batch_id = ?
            ");
            $aggStmt->execute([$batchId]);
            $agg = $aggStmt->fetch(PDO::FETCH_ASSOC);

            // ── Record batch row ──
            $this->conn->prepare("
                INSERT INTO prepare_batches
                    (batch_id, status, filter_merchant, filter_member,
                     total_members, total_orders, total_amount, total_points,
                     members_skipped)
                VALUES (?, 'staged', ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $batchId, $merchantId, $memberId,
                (int)   $agg['total_members'],
                (int)   $agg['total_orders'],
                (float) $agg['total_amount'],
                (int)   $agg['total_points'],
                $skipped,
            ]);

            $dur = round(microtime(true) - $startTime, 2);
            $this->log("PREPARE DONE: {$agg['total_members']} members, "
                      . "{$agg['total_orders']} orders, \${$agg['total_amount']} — {$dur}s");

            return [
                'success'  => true,
                'batch_id' => $batchId,
                'results'  => [
                    'total_members'    => (int)   $agg['total_members'],
                    'total_orders'     => (int)   $agg['total_orders'],
                    'total_amount'     => (float) $agg['total_amount'],
                    'total_points'     => (int)   $agg['total_points'],
                    'members_skipped'  => $skipped,
                    'duration_seconds' => $dur,
                ],
            ];
        } catch (\Exception $e) {
            $this->log("❌ PREPARE EXCEPTION: " . $e->getMessage());
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — stats()
    // Aggregated breakdowns for a batch: by merchant, broker, tier, symbol.
    // ====================================================================

    public function stats(string $batchId): array
    {
        try {
            // ── Batch header ──
            $bStmt = $this->conn->prepare("SELECT * FROM prepare_batches WHERE batch_id = ?");
            $bStmt->execute([$batchId]);
            $batch = $bStmt->fetch(PDO::FETCH_ASSOC);
            if (!$batch) {
                return ['success' => false, 'error' => 'Batch not found.'];
            }

            $staged = "batch_id = ? AND status = 'staged'";

            // ── By merchant ──
            $s1 = $this->conn->prepare("
                SELECT merchant_id,
                       COUNT(DISTINCT member_id) AS members,
                       COUNT(*)                  AS orders,
                       SUM(amount)               AS total_amount,
                       SUM(points_used)          AS total_points
                FROM prepared_orders WHERE {$staged}
                GROUP BY merchant_id ORDER BY total_amount DESC
            ");
            $s1->execute([$batchId]);

            // ── By broker ──
            $s2 = $this->conn->prepare("
                SELECT broker,
                       COUNT(DISTINCT member_id) AS members,
                       COUNT(*)                  AS orders,
                       SUM(amount)               AS total_amount,
                       SUM(points_used)          AS total_points
                FROM prepared_orders WHERE {$staged}
                GROUP BY broker ORDER BY total_amount DESC
            ");
            $s2->execute([$batchId]);

            // ── By tier + rate ──
            $s3 = $this->conn->prepare("
                SELECT member_tier, conversion_rate,
                       COUNT(DISTINCT member_id) AS members,
                       COUNT(*)                  AS orders,
                       SUM(amount)               AS total_amount,
                       SUM(points_used)          AS total_points
                FROM prepared_orders WHERE {$staged}
                GROUP BY member_tier, conversion_rate ORDER BY total_amount DESC
            ");
            $s3->execute([$batchId]);

            // ── Top 20 symbols ──
            $s4 = $this->conn->prepare("
                SELECT symbol,
                       COUNT(*)         AS order_count,
                       SUM(amount)      AS total_amount,
                       SUM(points_used) AS total_points
                FROM prepared_orders WHERE {$staged}
                GROUP BY symbol ORDER BY order_count DESC LIMIT 20
            ");
            $s4->execute([$batchId]);

            return [
                'success'     => true,
                'batch'       => $batch,
                'by_merchant' => $s1->fetchAll(PDO::FETCH_ASSOC),
                'by_broker'   => $s2->fetchAll(PDO::FETCH_ASSOC),
                'by_tier'     => $s3->fetchAll(PDO::FETCH_ASSOC),
                'by_symbol'   => $s4->fetchAll(PDO::FETCH_ASSOC),
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — drilldown()
    // Paginated member-level detail for a batch.
    // ====================================================================

    public function drilldown(string $batchId, int $page = 1, int $perPage = 50,
                              ?string $merchantId = null, ?string $broker = null): array
    {
        try {
            $wheres = ["po.batch_id = ?", "po.status = 'staged'"];
            $params = [$batchId];

            if ($merchantId) {
                $wheres[] = "po.merchant_id = ?";
                $params[] = $merchantId;
            }
            if ($broker) {
                $wheres[] = "po.broker = ?";
                $params[] = $broker;
            }

            $where  = implode(' AND ', $wheres);
            $offset = ($page - 1) * $perPage;

            // Total distinct members
            $cStmt = $this->conn->prepare(
                "SELECT COUNT(DISTINCT po.member_id) FROM prepared_orders po WHERE {$where}"
            );
            $cStmt->execute($params);
            $totalMembers = (int) $cStmt->fetchColumn();

            // Paginated member rollup
            $mStmt = $this->conn->prepare("
                SELECT po.member_id, po.merchant_id, po.broker,
                       po.member_tier, po.conversion_rate, po.sweep_percentage,
                       COUNT(*)                                  AS order_count,
                       SUM(po.amount)                            AS total_amount,
                       SUM(po.points_used)                       AS total_points,
                       GROUP_CONCAT(DISTINCT po.symbol ORDER BY po.symbol) AS symbols
                FROM prepared_orders po
                WHERE {$where}
                GROUP BY po.member_id, po.merchant_id, po.broker,
                         po.member_tier, po.conversion_rate, po.sweep_percentage
                ORDER BY total_amount DESC
                LIMIT ? OFFSET ?
            ");
            $mStmt->execute(array_merge($params, [$perPage, $offset]));

            return [
                'success'       => true,
                'members'       => $mStmt->fetchAll(PDO::FETCH_ASSOC),
                'total_members' => $totalMembers,
                'page'          => $page,
                'per_page'      => $perPage,
                'total_pages'   => (int) ceil($totalMembers / max($perPage, 1)),
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — approve()
    // INSERT...SELECT from prepared_orders → orders, mark batch approved.
    // ====================================================================

    public function approve(string $batchId): array
    {
        $startTime = microtime(true);
        $this->log(str_repeat('=', 80));
        $this->log("APPROVE BATCH: {$batchId}");

        try {
            // Verify staged
            $bStmt = $this->conn->prepare(
                "SELECT status FROM prepare_batches WHERE batch_id = ?"
            );
            $bStmt->execute([$batchId]);
            $batch = $bStmt->fetch(PDO::FETCH_ASSOC);

            if (!$batch) {
                return ['success' => false, 'error' => 'Batch not found.'];
            }
            if ($batch['status'] !== 'staged') {
                return ['success' => false, 'error' => "Batch is '{$batch['status']}', cannot approve."];
            }

            $this->conn->beginTransaction();

            // ── INSERT...SELECT → orders ──
            $ins = $this->conn->prepare("
                INSERT INTO orders
                    (member_id, merchant_id, basket_id, symbol, shares, amount,
                     points_used, status, order_type, broker, member_timezone)
                SELECT
                    po.member_id, po.merchant_id, po.basket_id, po.symbol,
                    0, po.amount, po.points_used,
                    'pending', 'sweep', po.broker, po.member_timezone
                FROM prepared_orders po
                WHERE po.batch_id = ? AND po.status = 'staged'
            ");
            $ins->execute([$batchId]);
            $ordersCreated = $ins->rowCount();

            // Mark staging rows approved
            $this->conn->prepare(
                "UPDATE prepared_orders SET status = 'approved' WHERE batch_id = ? AND status = 'staged'"
            )->execute([$batchId]);

            // Mark batch approved
            $this->conn->prepare(
                "UPDATE prepare_batches SET status = 'approved', approved_at = NOW() WHERE batch_id = ?"
            )->execute([$batchId]);

            $this->conn->commit();

            $dur = round(microtime(true) - $startTime, 2);
            $this->log("APPROVE DONE: {$ordersCreated} orders created — {$dur}s");

            return [
                'success'          => true,
                'batch_id'         => $batchId,
                'orders_created'   => $ordersCreated,
                'duration_seconds' => $dur,
            ];
        } catch (\Exception $e) {
            if ($this->conn->inTransaction()) $this->conn->rollBack();
            $this->log("❌ APPROVE EXCEPTION: " . $e->getMessage());
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — discard()
    // Mark a staged batch as discarded.
    // ====================================================================

    public function discard(string $batchId): array
    {
        try {
            $bStmt = $this->conn->prepare("SELECT status FROM prepare_batches WHERE batch_id = ?");
            $bStmt->execute([$batchId]);
            $batch = $bStmt->fetch(PDO::FETCH_ASSOC);

            if (!$batch) {
                return ['success' => false, 'error' => 'Batch not found.'];
            }
            if ($batch['status'] !== 'staged') {
                return ['success' => false, 'error' => "Batch is '{$batch['status']}', cannot discard."];
            }

            $this->conn->beginTransaction();

            $this->conn->prepare(
                "UPDATE prepared_orders SET status = 'discarded' WHERE batch_id = ? AND status = 'staged'"
            )->execute([$batchId]);

            $this->conn->prepare(
                "UPDATE prepare_batches SET status = 'discarded', discarded_at = NOW() WHERE batch_id = ?"
            )->execute([$batchId]);

            $this->conn->commit();

            $this->log("DISCARD BATCH: {$batchId}");
            return ['success' => true, 'batch_id' => $batchId];
        } catch (\Exception $e) {
            if ($this->conn->inTransaction()) $this->conn->rollBack();
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — batches()
    // List all preparation batches.
    // ====================================================================

    public function batches(int $limit = 50): array
    {
        try {
            $stmt = $this->conn->prepare("
                SELECT batch_id, status, filter_merchant, filter_member,
                       total_members, total_orders, total_amount, total_points,
                       members_skipped, created_at, approved_at, discarded_at, notes
                FROM prepare_batches
                ORDER BY created_at DESC
                LIMIT ?
            ");
            $stmt->execute([$limit]);
            return ['success' => true, 'batches' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
        } catch (\Exception $e) {
            return ['success' => true, 'batches' => [], 'note' => $e->getMessage()];
        }
    }
}
