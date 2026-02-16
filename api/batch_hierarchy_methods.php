    // ── Batch Hierarchy: Brokers within a merchant ──────────────────────────
    public function batchBrokers(string $batchId, string $merchantId): array
    {
        if (!$batchId || !$merchantId) {
            return ['success' => false, 'error' => 'Missing batch_id or merchant_id'];
        }

        $stmt = $this->conn->prepare("
            SELECT broker,
                   COUNT(DISTINCT member_id) AS members,
                   COUNT(*)                  AS orders,
                   SUM(amount)               AS total_amount,
                   SUM(shares)               AS total_shares,
                   SUM(points_used)          AS total_points
            FROM prepared_orders
            WHERE batch_id = ? AND merchant_id = ?
            GROUP BY broker
            ORDER BY broker
        ");
        $stmt->execute([$batchId, $merchantId]);

        return ['success' => true, 'brokers' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
    }

    // ── Batch Hierarchy: Baskets within a merchant + broker ──────────────────
    public function batchBaskets(string $batchId, string $merchantId, string $broker): array
    {
        if (!$batchId || !$merchantId || !$broker) {
            return ['success' => false, 'error' => 'Missing batch_id, merchant_id, or broker'];
        }

        $stmt = $this->conn->prepare("
            SELECT basket_id,
                   member_id,
                   COUNT(*)         AS orders,
                   SUM(amount)      AS total_amount,
                   SUM(shares)      AS total_shares,
                   SUM(points_used) AS total_points
            FROM prepared_orders
            WHERE batch_id = ? AND merchant_id = ? AND broker = ?
            GROUP BY basket_id, member_id
            ORDER BY basket_id
        ");
        $stmt->execute([$batchId, $merchantId, $broker]);

        return ['success' => true, 'baskets' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
    }

    // ── Batch Hierarchy: Individual orders within a basket ───────────────────
    public function batchOrders(string $batchId, string $basketId): array
    {
        if (!$batchId || !$basketId) {
            return ['success' => false, 'error' => 'Missing batch_id or basket_id'];
        }

        $stmt = $this->conn->prepare("
            SELECT id AS order_id,
                   symbol,
                   amount,
                   price,
                   shares,
                   points_used AS points,
                   status
            FROM prepared_orders
            WHERE batch_id = ? AND basket_id = ?
            ORDER BY symbol, id
        ");
        $stmt->execute([$batchId, $basketId]);

        return ['success' => true, 'orders' => $stmt->fetchAll(PDO::FETCH_ASSOC)];
    }
