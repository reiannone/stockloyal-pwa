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
 *                         → fetch live prices from Yahoo Finance
 *                         → UPDATE shares = amount / price
 *   3. stats()         → Aggregated breakdowns for a staged batch
 *   4. drilldown()     → Paginated member-level detail for a batch
 *   5. approve()       → INSERT...SELECT from prepared_orders → orders
 *   6. discard()       → Mark batch discarded (rows kept for audit)
 *   7. batches()       → List all preparation batches
 *
 * Tables read:   member_stock_picks, wallet, merchant, broker_master
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
                     . "AND w.member_tier COLLATE utf8mb4_unicode_ci = m.tier{$i}_name COLLATE utf8mb4_unicode_ci "
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
    // PRICE FETCHING — Yahoo Finance (same API as proxy.php)
    //
    // Fetches live prices for up to 100 symbols in one HTTP call.
    // Returns: ['AAPL' => 185.50, 'MSFT' => 415.20, ...]
    // ====================================================================

    /**
     * Fetch live stock prices from Yahoo Finance v7 quote API.
     * Falls back to chart API per-symbol if v7 fails.
     *
     * @param  string[] $symbols  Array of ticker symbols
     * @return array    symbol => price (float), only symbols with valid prices
     */
    private function fetchPrices(array $symbols): array
    {
        if (empty($symbols)) return [];

        $prices = [];
        $ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            . "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        $timeout = 20;

        // Clean and deduplicate
        $clean = [];
        foreach ($symbols as $s) {
            $s = strtoupper(trim($s));
            if ($s !== '' && strlen($s) <= 16 && preg_match('/^[A-Z0-9.\-^=]+$/', $s)) {
                $clean[$s] = true;
            }
        }
        $clean = array_keys($clean);

        if (empty($clean)) return [];

        // ── Batch in chunks of 50 (Yahoo limit) ──
        $chunks = array_chunk($clean, 50);

        foreach ($chunks as $chunk) {
            $symbolKey = implode(',', $chunk);
            $url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" . urlencode($symbolKey);

            $this->log("PRICE FETCH: {$url}");

            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL            => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_USERAGENT      => $ua,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_HTTPHEADER     => [
                    'Accept: application/json',
                    'Accept-Language: en-US,en;q=0.9',
                ],
            ]);

            $resp = curl_exec($ch);
            $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($resp !== false && $http === 200) {
                $data = json_decode($resp, true);
                $results = $data['quoteResponse']['result'] ?? [];

                foreach ($results as $q) {
                    $sym   = $q['symbol'] ?? null;
                    $price = $q['regularMarketPrice'] ?? null;
                    if ($sym && $price !== null && $price > 0) {
                        $prices[$sym] = (float) $price;
                    }
                }
            }

            // ── Fallback: chart API for any missing symbols ──
            $missing = array_diff($chunk, array_keys($prices));
            if (!empty($missing)) {
                $this->log("PRICE FALLBACK for " . count($missing) . " symbols: " . implode(',', $missing));

                foreach ($missing as $sym) {
                    $chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/{$sym}?interval=1d&range=5d";

                    $ch = curl_init();
                    curl_setopt_array($ch, [
                        CURLOPT_URL            => $chartUrl,
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_FOLLOWLOCATION => true,
                        CURLOPT_SSL_VERIFYPEER => false,
                        CURLOPT_USERAGENT      => $ua,
                        CURLOPT_TIMEOUT        => $timeout,
                    ]);

                    $chartResp = curl_exec($ch);
                    curl_close($ch);

                    if ($chartResp) {
                        $cj   = json_decode($chartResp, true);
                        $meta = $cj['chart']['result'][0]['meta'] ?? null;
                        if ($meta) {
                            $p = $meta['regularMarketPrice'] ?? null;
                            if ($p !== null && $p > 0) {
                                $prices[$sym] = (float) $p;
                            }
                        }
                    }
                }
            }
        }

        $this->log("PRICES RESOLVED: " . count($prices) . " of " . count($clean)
                  . " — " . substr(json_encode($prices), 0, 300));

        return $prices;
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
                    COUNT(DISTINCT w.member_id)      AS eligible_members,
                    COUNT(*)                         AS total_picks,
                    COUNT(DISTINCT msp.symbol)       AS unique_symbols,
                    COUNT(DISTINCT w.merchant_id)    AS unique_merchants,
                    COUNT(DISTINCT w.broker)         AS unique_brokers,
                    COALESCE(SUM(
                        ROUND(({$sweepPts}) * ({$rate}) / pc.cnt, 2)
                    ), 0) AS est_total_amount,
                    COALESCE(SUM(
                        FLOOR(({$sweepPts}) / pc.cnt)
                    ), 0) AS est_total_points
                FROM member_stock_picks msp
                JOIN wallet w          ON w.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
                LEFT JOIN merchant m   ON w.merchant_id COLLATE utf8mb4_unicode_ci = m.merchant_id COLLATE utf8mb4_unicode_ci
                JOIN {$pcSub} pc       ON pc.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
                WHERE msp.is_active = 1
                  AND w.points > 0
                  {$merchantW}
            ";
            $stmt = $this->conn->prepare($sql);
            $stmt->execute($params);
            $counts = $stmt->fetch(PDO::FETCH_ASSOC);

            // ── Skipped (0 points but have picks) ──
            $skipSql = "
                SELECT COUNT(DISTINCT w.member_id)
                FROM member_stock_picks msp
                JOIN wallet w ON w.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
                WHERE msp.is_active = 1 AND w.points <= 0
            ";
            $skipped = (int) ($this->conn->query($skipSql)->fetchColumn() ?: 0);

            // ── By merchant ──
            $byMerch = $this->conn->prepare("
                SELECT w.merchant_id,
                       COALESCE(m2.merchant_name, w.merchant_id) AS merchant_name,
                       COUNT(DISTINCT w.member_id) AS members,
                       COUNT(*) AS picks
                FROM member_stock_picks msp
                JOIN wallet w          ON w.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
                LEFT JOIN merchant m2  ON w.merchant_id COLLATE utf8mb4_unicode_ci = m2.merchant_id COLLATE utf8mb4_unicode_ci
                WHERE msp.is_active = 1 AND w.points > 0
                {$merchantW}
                GROUP BY w.merchant_id, merchant_name
                ORDER BY members DESC
            ");
            $byMerch->execute($params);

            // ── Broker limit estimates ──
            // Estimate members whose total basket falls below broker min or above max
            $blSql = "
                SELECT
                    SUM(CASE WHEN basket_total < broker_min THEN 1 ELSE 0 END) AS bypassed_below_min,
                    SUM(CASE WHEN basket_total > broker_max THEN 1 ELSE 0 END) AS capped_at_max,
                    COALESCE(SUM(
                        CASE
                            WHEN basket_total < broker_min THEN 0
                            WHEN basket_total > broker_max THEN broker_max
                            ELSE basket_total
                        END
                    ), 0) AS total_amount_capped
                FROM (
                    SELECT
                        w.member_id,
                        SUM(ROUND(({$sweepPts}) * ({$rate}) / pc2.cnt, 2)) AS basket_total,
                        COALESCE(bm.min_order_amount, 1.00) AS broker_min,
                        COALESCE(bm.max_order_amount, 100000.00) AS broker_max
                    FROM member_stock_picks msp_inner
                    JOIN wallet w          ON w.member_id COLLATE utf8mb4_unicode_ci = msp_inner.member_id COLLATE utf8mb4_unicode_ci
                    LEFT JOIN merchant m   ON w.merchant_id COLLATE utf8mb4_unicode_ci = m.merchant_id COLLATE utf8mb4_unicode_ci
                    JOIN {$pcSub} pc2      ON pc2.member_id COLLATE utf8mb4_unicode_ci = msp_inner.member_id COLLATE utf8mb4_unicode_ci
                    LEFT JOIN broker_master bm
                        ON w.broker COLLATE utf8mb4_unicode_ci = bm.broker_id COLLATE utf8mb4_unicode_ci
                    WHERE msp_inner.is_active = 1 AND w.points > 0
                    {$merchantW}
                    GROUP BY w.member_id, bm.min_order_amount, bm.max_order_amount
                ) member_baskets
            ";
            $blStmt = $this->conn->prepare($blSql);
            $blStmt->execute($params);
            $brokerLimits = $blStmt->fetch(PDO::FETCH_ASSOC);

            return [
                'success'            => true,
                'eligible_members'   => (int)   ($counts['eligible_members'] ?? 0),
                'total_picks'        => (int)   ($counts['total_picks'] ?? 0),
                'unique_symbols'     => (int)   ($counts['unique_symbols'] ?? 0),
                'unique_merchants'   => (int)   ($counts['unique_merchants'] ?? 0),
                'unique_brokers'     => (int)   ($counts['unique_brokers'] ?? 0),
                'est_total_amount'   => (float) ($counts['est_total_amount'] ?? 0),
                'est_total_points'   => (int)   ($counts['est_total_points'] ?? 0),
                'members_skipped'    => $skipped,
                'bypassed_below_min' => (int)   ($brokerLimits['bypassed_below_min'] ?? 0),
                'capped_at_max'      => (int)   ($brokerLimits['capped_at_max'] ?? 0),
                'total_amount_capped' => (float) ($brokerLimits['total_amount_capped'] ?? 0),
                'by_merchant'        => $byMerch->fetchAll(PDO::FETCH_ASSOC),
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — prepare()
    // Bulk INSERT...SELECT into prepared_orders staging table.
    // Then fetch live prices and calculate shares.
    // ====================================================================

    public function prepare(?string $memberId = null, ?string $merchantId = null): array
    {
        $batchId   = 'BATCH-' . date('Ymd-His') . '-' . substr(uniqid(), -6);
        $startTime = microtime(true);

        $this->log(str_repeat('=', 80));
        $this->log("PREPARE START: {$batchId}");
        if ($memberId)   $this->log("  filter member:   {$memberId}");
        if ($merchantId) $this->log("  filter merchant: {$merchantId}");

        // ── Auto-cleanup: discard any open staged batches ──
        try {
            $openStmt = $this->conn->query(
                "SELECT batch_id FROM prepare_batches WHERE status = 'staged'"
            );
            $openBatches = $openStmt->fetchAll(PDO::FETCH_COLUMN);

            if (!empty($openBatches)) {
                $this->conn->prepare(
                    "UPDATE prepared_orders SET status = 'discarded' WHERE batch_id IN ("
                    . implode(',', array_fill(0, count($openBatches), '?'))
                    . ") AND status = 'staged'"
                )->execute($openBatches);

                $this->conn->prepare(
                    "UPDATE prepare_batches SET status = 'discarded', discarded_at = NOW() WHERE batch_id IN ("
                    . implode(',', array_fill(0, count($openBatches), '?'))
                    . ") AND status = 'staged'"
                )->execute($openBatches);

                $this->log("AUTO-DISCARD: " . count($openBatches) . " staged batch(es): " . implode(', ', $openBatches));
            }
        } catch (\Exception $e) {
            $this->log("⚠️ Auto-discard failed: " . $e->getMessage());
        }

        // ── Auto-cleanup: cancel any pending orders ──
        try {
            $cancelStmt = $this->conn->prepare(
                "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE LOWER(status) = 'pending'"
            );
            $cancelStmt->execute();
            $cancelled = $cancelStmt->rowCount();
            if ($cancelled > 0) {
                $this->log("AUTO-CANCEL: {$cancelled} pending order(s) cancelled");
            }
        } catch (\Exception $e) {
            $this->log("⚠️ Auto-cancel pending orders failed: " . $e->getMessage());
        }

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

            // ── Single INSERT...SELECT (price + shares populated in step 2) ──
            // basket_id = batchId + '-' + member_id  (one basket per member per batch)
            $sql = "
                INSERT INTO prepared_orders
                    (batch_id, basket_id, member_id, merchant_id, symbol,
                     amount, price, shares, points_used,
                     broker, member_timezone,
                     member_tier, conversion_rate, sweep_percentage, status)
                SELECT
                    ?,
                    CONCAT(?, '-', w.member_id),
                    w.member_id,
                    w.merchant_id,
                    msp.symbol,
                    ROUND(({$sweepPts}) * ({$rate}) / pc.cnt, 2),
                    NULL,
                    0,
                    FLOOR(({$sweepPts}) / pc.cnt),
                    w.broker,
                    COALESCE(w.member_timezone, 'America/New_York'),
                    w.member_tier,
                    ({$rate}),
                    ({$pct}),
                    'staged'
                FROM member_stock_picks msp
                JOIN wallet w          ON w.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
                LEFT JOIN merchant m   ON w.merchant_id COLLATE utf8mb4_unicode_ci = m.merchant_id COLLATE utf8mb4_unicode_ci
                JOIN {$pcSub} pc       ON pc.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
                WHERE {$where}
            ";

            array_unshift($params, $batchId, $batchId);

            $stmt = $this->conn->prepare($sql);
            $stmt->execute($params);
            $rowsInserted = $stmt->rowCount();

            $this->log("INSERT...SELECT: {$rowsInserted} staged rows");

            // ══════════════════════════════════════════════════════════════
            // STEP 2: Fetch live prices and calculate shares
            // ══════════════════════════════════════════════════════════════

            $pricesFetched = 0;
            $pricesFailed  = 0;

            if ($rowsInserted > 0) {
                // Get distinct symbols for this batch
                $symStmt = $this->conn->prepare(
                    "SELECT DISTINCT symbol FROM prepared_orders WHERE batch_id = ?"
                );
                $symStmt->execute([$batchId]);
                $symbols = $symStmt->fetchAll(PDO::FETCH_COLUMN);

                $this->log("FETCHING PRICES for " . count($symbols) . " symbols: " . implode(', ', $symbols));

                // Fetch live prices from Yahoo Finance
                $prices = $this->fetchPrices($symbols);

                $pricesFetched = count($prices);
                $pricesFailed  = count($symbols) - $pricesFetched;

                $this->log("PRICES: {$pricesFetched} fetched, {$pricesFailed} failed");

                // UPDATE prepared_orders with price + shares for each symbol
                if (!empty($prices)) {
                    $updateStmt = $this->conn->prepare("
                        UPDATE prepared_orders
                        SET price  = ?,
                            shares = ROUND(amount / ?, 6)
                        WHERE batch_id = ? AND symbol = ? AND status = 'staged'
                    ");

                    foreach ($prices as $sym => $price) {
                        $updateStmt->execute([$price, $price, $batchId, $sym]);
                        $updated = $updateStmt->rowCount();
                        $this->log("  {$sym}: \${$price} -> {$updated} rows updated");
                    }
                }

                // Log any symbols that couldn't get a price
                $missingPrices = array_diff($symbols, array_keys($prices));
                if (!empty($missingPrices)) {
                    $this->log("WARNING: NO PRICE for: " . implode(', ', $missingPrices)
                             . " — shares will remain 0");
                }
            }

            // ══════════════════════════════════════════════════════════════
            // STEP 3: Enforce broker min/max order limits
            //
            // - basket total < broker min_order_amount → remove member rows
            // - basket total > broker max_order_amount → scale down pro-rata
            // ══════════════════════════════════════════════════════════════

            $bypassedBelowMin = 0;
            $cappedAtMax      = 0;
            $amountBeforeCaps = 0;

            if ($rowsInserted > 0) {
                $this->log("BROKER LIMITS: checking min/max order amounts");

                // Get each member's basket total + their broker limits
                $blStmt = $this->conn->prepare("
                    SELECT po.member_id,
                           po.broker,
                           SUM(po.amount)                AS basket_total,
                           COALESCE(bm.min_order_amount, 1.00)      AS broker_min,
                           COALESCE(bm.max_order_amount, 100000.00) AS broker_max
                    FROM prepared_orders po
                    LEFT JOIN broker_master bm
                        ON po.broker COLLATE utf8mb4_unicode_ci = bm.broker_id COLLATE utf8mb4_unicode_ci
                    WHERE po.batch_id = ? AND po.status = 'staged'
                    GROUP BY po.member_id, po.broker, bm.min_order_amount, bm.max_order_amount
                ");
                $blStmt->execute([$batchId]);
                $memberBaskets = $blStmt->fetchAll(PDO::FETCH_ASSOC);

                // Track original total before caps for reporting
                $amountBeforeCaps = array_sum(array_column($memberBaskets, 'basket_total'));

                // ── Members below broker minimum: remove their staged rows ──
                $belowMinMembers = [];
                foreach ($memberBaskets as $mb) {
                    if ((float) $mb['basket_total'] < (float) $mb['broker_min']) {
                        $belowMinMembers[] = $mb['member_id'];
                    }
                }

                if (!empty($belowMinMembers)) {
                    $bypassedBelowMin = count($belowMinMembers);
                    $placeholders = implode(',', array_fill(0, count($belowMinMembers), '?'));
                    $delParams = array_merge([$batchId], $belowMinMembers);

                    $this->conn->prepare("
                        DELETE FROM prepared_orders
                        WHERE batch_id = ? AND member_id IN ({$placeholders}) AND status = 'staged'
                    ")->execute($delParams);

                    $this->log("BROKER MIN: bypassed {$bypassedBelowMin} members (basket below broker minimum)");
                }

                // ── Members above broker maximum: scale down pro-rata ──
                foreach ($memberBaskets as $mb) {
                    // Skip already-removed members
                    if (in_array($mb['member_id'], $belowMinMembers)) continue;

                    $basketTotal = (float) $mb['basket_total'];
                    $brokerMax   = (float) $mb['broker_max'];

                    if ($basketTotal > $brokerMax && $brokerMax > 0) {
                        $cappedAtMax++;
                        $scaleFactor = $brokerMax / $basketTotal;

                        // Scale down each order for this member proportionally
                        $this->conn->prepare("
                            UPDATE prepared_orders
                            SET amount     = ROUND(amount * ?, 2),
                                points_used = FLOOR(points_used * ?),
                                shares     = CASE WHEN price > 0 THEN ROUND((amount * ?) / price, 6) ELSE 0 END
                            WHERE batch_id = ? AND member_id = ? AND status = 'staged'
                        ")->execute([$scaleFactor, $scaleFactor, $scaleFactor, $batchId, $mb['member_id']]);

                        $this->log("BROKER MAX: capped member {$mb['member_id']} "
                                 . "from \${$basketTotal} to ~\${$brokerMax} (scale={$scaleFactor})");
                    }
                }

                if ($cappedAtMax > 0) {
                    $this->log("BROKER MAX: capped {$cappedAtMax} members (basket exceeded broker maximum)");
                }
            }

            // ── Skipped members count ──
            $skipSql = "
                SELECT COUNT(DISTINCT w.member_id)
                FROM member_stock_picks msp
                JOIN wallet w ON w.member_id COLLATE utf8mb4_unicode_ci = msp.member_id COLLATE utf8mb4_unicode_ci
                WHERE msp.is_active = 1 AND w.points <= 0
            ";
            $skipped = (int) ($this->conn->query($skipSql)->fetchColumn() ?: 0);

            // ── Aggregate from staged rows ──
            $aggStmt = $this->conn->prepare("
                SELECT COUNT(DISTINCT member_id) AS total_members,
                       COUNT(*)                  AS total_orders,
                       COALESCE(SUM(amount), 0)      AS total_amount,
                       COALESCE(SUM(points_used), 0)  AS total_points,
                       COALESCE(SUM(shares), 0)       AS total_shares,
                       SUM(CASE WHEN price IS NULL THEN 1 ELSE 0 END) AS missing_prices
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
                     members_skipped, bypassed_below_min, capped_at_max,
                     total_amount_before_caps)
                VALUES (?, 'staged', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $batchId, $merchantId, $memberId,
                (int)   $agg['total_members'],
                (int)   $agg['total_orders'],
                (float) $agg['total_amount'],
                (int)   $agg['total_points'],
                $skipped,
                $bypassedBelowMin,
                $cappedAtMax,
                (float) $amountBeforeCaps,
            ]);

            $dur = round(microtime(true) - $startTime, 2);
            $this->log("PREPARE DONE: {$agg['total_members']} members, "
                      . "{$agg['total_orders']} orders, \${$agg['total_amount']}, "
                      . "{$agg['total_shares']} total shares, "
                      . "bypassed_below_min={$bypassedBelowMin}, capped_at_max={$cappedAtMax} — {$dur}s");

            return [
                'success'  => true,
                'batch_id' => $batchId,
                'results'  => [
                    'total_members'          => (int)   $agg['total_members'],
                    'total_orders'           => (int)   $agg['total_orders'],
                    'total_amount'           => (float) $agg['total_amount'],
                    'total_points'           => (int)   $agg['total_points'],
                    'total_shares'           => (float) ($agg['total_shares'] ?? 0),
                    'missing_prices'         => (int)   ($agg['missing_prices'] ?? 0),
                    'members_skipped'        => $skipped,
                    'bypassed_below_min'     => $bypassedBelowMin,
                    'capped_at_max'          => $cappedAtMax,
                    'total_amount_before_caps' => (float) $amountBeforeCaps,
                    'duration_seconds'       => $dur,
                ],
            ];
        } catch (\Exception $e) {
            $this->log("PREPARE EXCEPTION: " . $e->getMessage());
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

            $filter = "batch_id = ?";

            // ── By merchant ──
            $s1 = $this->conn->prepare("
                SELECT merchant_id,
                       COUNT(DISTINCT member_id) AS members,
                       COUNT(*)                  AS orders,
                       SUM(amount)               AS total_amount,
                       SUM(points_used)          AS total_points,
                       SUM(shares)               AS total_shares
                FROM prepared_orders WHERE {$filter}
                GROUP BY merchant_id ORDER BY total_amount DESC
            ");
            $s1->execute([$batchId]);

            // ── By broker ──
            $s2 = $this->conn->prepare("
                SELECT broker,
                       COUNT(DISTINCT member_id) AS members,
                       COUNT(*)                  AS orders,
                       SUM(amount)               AS total_amount,
                       SUM(points_used)          AS total_points,
                       SUM(shares)               AS total_shares
                FROM prepared_orders WHERE {$filter}
                GROUP BY broker ORDER BY total_amount DESC
            ");
            $s2->execute([$batchId]);

            // ── By tier + rate ──
            $s3 = $this->conn->prepare("
                SELECT member_tier, conversion_rate,
                       COUNT(DISTINCT member_id) AS members,
                       COUNT(*)                  AS orders,
                       SUM(amount)               AS total_amount,
                       SUM(points_used)          AS total_points,
                       SUM(shares)               AS total_shares
                FROM prepared_orders WHERE {$filter}
                GROUP BY member_tier, conversion_rate ORDER BY total_amount DESC
            ");
            $s3->execute([$batchId]);

            // ── Top 20 symbols (now includes price + shares) ──
            $s4 = $this->conn->prepare("
                SELECT symbol,
                       price,
                       COUNT(*)         AS order_count,
                       SUM(amount)      AS total_amount,
                       SUM(points_used) AS total_points,
                       SUM(shares)      AS total_shares
                FROM prepared_orders WHERE {$filter}
                GROUP BY symbol, price ORDER BY order_count DESC LIMIT 20
            ");
            $s4->execute([$batchId]);

            // ── Missing prices count ──
            $mpStmt = $this->conn->prepare(
                "SELECT COUNT(*) FROM prepared_orders WHERE batch_id = ? AND price IS NULL"
            );
            $mpStmt->execute([$batchId]);
            $missingPrices = (int) $mpStmt->fetchColumn();

            return [
                'success'                  => true,
                'batch'                    => $batch,
                'by_merchant'              => $s1->fetchAll(PDO::FETCH_ASSOC),
                'by_broker'                => $s2->fetchAll(PDO::FETCH_ASSOC),
                'by_tier'                  => $s3->fetchAll(PDO::FETCH_ASSOC),
                'by_symbol'                => $s4->fetchAll(PDO::FETCH_ASSOC),
                'missing_prices'           => $missingPrices,
                'bypassed_below_min'       => (int) ($batch['bypassed_below_min'] ?? 0),
                'capped_at_max'            => (int) ($batch['capped_at_max'] ?? 0),
                'total_amount_before_caps' => (float) ($batch['total_amount_before_caps'] ?? 0),
                'total_amount'             => (float) ($batch['total_amount'] ?? 0),
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
            $wheres = ["po.batch_id = ?"];
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
            $limitInt  = (int) $perPage;
            $offsetInt = (int) $offset;
            $mStmt = $this->conn->prepare("
                SELECT po.member_id, po.merchant_id, po.broker,
                       po.member_tier, po.conversion_rate, po.sweep_percentage,
                       COUNT(*)                                  AS order_count,
                       SUM(po.amount)                            AS total_amount,
                       SUM(po.points_used)                       AS total_points,
                       SUM(po.shares)                            AS total_shares,
                       GROUP_CONCAT(DISTINCT po.symbol ORDER BY po.symbol) AS symbols
                FROM prepared_orders po
                WHERE {$where}
                GROUP BY po.member_id, po.merchant_id, po.broker,
                         po.member_tier, po.conversion_rate, po.sweep_percentage
                ORDER BY total_amount DESC
                LIMIT {$limitInt} OFFSET {$offsetInt}
            ");
            $mStmt->execute($params);

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
    // Now uses real shares from staging (calculated during prepare).
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

            // ── Check for missing prices ──
            $mpStmt = $this->conn->prepare(
                "SELECT COUNT(*) FROM prepared_orders WHERE batch_id = ? AND status = 'staged' AND price IS NULL"
            );
            $mpStmt->execute([$batchId]);
            $missingPrices = (int) $mpStmt->fetchColumn();

            if ($missingPrices > 0) {
                $this->log("WARNING: APPROVE with {$missingPrices} orders missing price (shares=0)");
            }

            $this->conn->beginTransaction();

            // ── INSERT...SELECT → orders (uses real shares from staging) ──
            $ins = $this->conn->prepare("
                INSERT INTO orders
                    (member_id, merchant_id, basket_id, batch_id, symbol, shares, amount,
                     points_used, status, order_type, broker, member_timezone)
                SELECT
                    po.member_id, po.merchant_id, po.basket_id, po.batch_id, po.symbol,
                    po.shares, po.amount, po.points_used,
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
                'missing_prices'   => $missingPrices,
                'duration_seconds' => $dur,
            ];
        } catch (\Exception $e) {
            if ($this->conn->inTransaction()) $this->conn->rollBack();
            $this->log("APPROVE EXCEPTION: " . $e->getMessage());
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
            $limitInt = (int) $limit;
            $stmt = $this->conn->prepare("
                SELECT batch_id, status, filter_merchant, filter_member,
                       total_members, total_orders, total_amount, total_points,
                       members_skipped, bypassed_below_min, capped_at_max,
                       total_amount_before_caps,
                       created_at, approved_at, discarded_at, notes
                FROM prepare_batches
                ORDER BY created_at DESC
                LIMIT {$limitInt}
            ");
            $stmt->execute();
            return ['success' => true, 'batches' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
        } catch (\Exception $e) {
            return ['success' => true, 'batches' => [], 'note' => $e->getMessage()];
        }
    }


    // ====================================================================
    // PUBLIC — cancelPendingOrders()
    // Cancel any pending orders from previously approved batches
    // that haven't been swept yet, preventing duplicates when
    // a new batch is prepared.
    // ====================================================================

    public function cancelPendingOrders(): array
    {
        try {
            $stmt = $this->conn->prepare("
                UPDATE orders
                SET    status = 'cancelled', updated_at = NOW()
                WHERE  LOWER(status) = 'pending'
            ");
            $stmt->execute();
            $cancelled = $stmt->rowCount();

            $this->log("CANCEL PENDING ORDERS: {$cancelled} order(s) cancelled before new batch preparation");

            return [
                'success'          => true,
                'orders_cancelled' => $cancelled,
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
