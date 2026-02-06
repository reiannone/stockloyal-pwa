<?php
declare(strict_types=1);

/**
 * fee_admin.php — Merchant Fee Administration API
 *
 * Actions:
 *   list      → All fee schedules (optionally filtered by merchant_id)
 *   get       → Single fee schedule by id
 *   save      → Create or update a fee schedule
 *   delete    → Soft-delete (set is_active = 0)
 *   merchants → List all merchants (for dropdown population)
 *   summary   → Billing summary: estimated fees for current cycle
 */

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

set_error_handler(function ($severity, $message, $file, $line) {
    throw new \ErrorException($message, 0, $severity, $file, $line);
});

try {

require_once __DIR__ . '/config.php';

$input  = json_decode(file_get_contents("php://input"), true) ?: [];
$action = $input['action'] ?? '';

switch ($action) {

    // ──────────────────────────────────────────────────────────────────
    // LIST — all fee schedules, optionally filtered
    // ──────────────────────────────────────────────────────────────────
    case 'list': {
        $wheres = [];
        $params = [];

        if (!empty($input['merchant_id'])) {
            $wheres[] = "mf.merchant_id = ?";
            $params[] = $input['merchant_id'];
        }
        if (isset($input['is_active'])) {
            $wheres[] = "mf.is_active = ?";
            $params[] = (int) $input['is_active'];
        }

        $where = $wheres ? 'WHERE ' . implode(' AND ', $wheres) : '';

        $stmt = $conn->prepare("
            SELECT mf.*,
                   COALESCE(m.merchant_name, mf.merchant_id) AS merchant_name
            FROM merchant_fees mf
            LEFT JOIN merchant m ON m.merchant_id = mf.merchant_id
            {$where}
            ORDER BY mf.merchant_id ASC, mf.is_active DESC, mf.effective_date DESC
        ");
        $stmt->execute($params);

        echo json_encode([
            'success' => true,
            'fees'    => $stmt->fetchAll(PDO::FETCH_ASSOC),
        ]);
        break;
    }

    // ──────────────────────────────────────────────────────────────────
    // GET — single fee schedule
    // ──────────────────────────────────────────────────────────────────
    case 'get': {
        $id = (int) ($input['id'] ?? 0);
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'Missing id.']);
            break;
        }

        $stmt = $conn->prepare("
            SELECT mf.*,
                   COALESCE(m.merchant_name, mf.merchant_id) AS merchant_name
            FROM merchant_fees mf
            LEFT JOIN merchant m ON m.merchant_id = mf.merchant_id
            WHERE mf.id = ?
        ");
        $stmt->execute([$id]);
        $fee = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$fee) {
            echo json_encode(['success' => false, 'error' => 'Fee schedule not found.']);
        } else {
            echo json_encode(['success' => true, 'fee' => $fee]);
        }
        break;
    }

    // ──────────────────────────────────────────────────────────────────
    // SAVE — create or update
    // ──────────────────────────────────────────────────────────────────
    case 'save': {
        $id          = !empty($input['id']) ? (int) $input['id'] : null;
        $merchantId  = trim($input['merchant_id'] ?? '');
        $effectiveDate = trim($input['effective_date'] ?? '');

        if (!$merchantId) {
            echo json_encode(['success' => false, 'error' => 'merchant_id is required.']);
            break;
        }
        if (!$effectiveDate || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $effectiveDate)) {
            echo json_encode(['success' => false, 'error' => 'effective_date is required (YYYY-MM-DD).']);
            break;
        }

        // Nullable decimal helper
        $dec = function($key) use ($input) {
            $v = $input[$key] ?? null;
            if ($v === null || $v === '') return null;
            return round((float) $v, 4);
        };

        $data = [
            'merchant_id'        => $merchantId,
            'fee_label'          => trim($input['fee_label'] ?? '') ?: null,
            'annual_license_fee' => $dec('annual_license_fee'),
            'cost_per_member'    => $dec('cost_per_member'),
            'cost_per_basket'    => $dec('cost_per_basket'),
            'cost_per_order'     => $dec('cost_per_order'),
            'cost_per_ach'       => $dec('cost_per_ach'),
            'billing_cycle'      => $input['billing_cycle'] ?? 'monthly',
            'effective_date'     => $effectiveDate,
            'end_date'           => (!empty($input['end_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['end_date']))
                                    ? $input['end_date'] : null,
            'is_active'          => (int) ($input['is_active'] ?? 1),
            'notes'              => trim($input['notes'] ?? '') ?: null,
        ];

        if ($id) {
            // UPDATE
            $sets = [];
            $params = [];
            foreach ($data as $col => $val) {
                $sets[] = "{$col} = ?";
                $params[] = $val;
            }
            $params[] = $id;

            $stmt = $conn->prepare("UPDATE merchant_fees SET " . implode(', ', $sets) . " WHERE id = ?");
            $stmt->execute($params);

            echo json_encode(['success' => true, 'id' => $id, 'action' => 'updated']);
        } else {
            // INSERT
            $cols   = array_keys($data);
            $places = array_fill(0, count($cols), '?');

            $stmt = $conn->prepare(
                "INSERT INTO merchant_fees (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $places) . ")"
            );
            $stmt->execute(array_values($data));
            $newId = (int) $conn->lastInsertId();

            echo json_encode(['success' => true, 'id' => $newId, 'action' => 'created']);
        }
        break;
    }

    // ──────────────────────────────────────────────────────────────────
    // DELETE — soft delete (set is_active = 0)
    // ──────────────────────────────────────────────────────────────────
    case 'delete': {
        $id = (int) ($input['id'] ?? 0);
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'Missing id.']);
            break;
        }

        $stmt = $conn->prepare("UPDATE merchant_fees SET is_active = 0 WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(['success' => true, 'id' => $id, 'action' => 'deactivated']);
        break;
    }

    // ──────────────────────────────────────────────────────────────────
    // MERCHANTS — list for dropdown
    // ──────────────────────────────────────────────────────────────────
    case 'merchants': {
        $stmt = $conn->query("
            SELECT merchant_id, merchant_name
            FROM merchant
            ORDER BY merchant_name ASC, merchant_id ASC
        ");
        echo json_encode([
            'success'   => true,
            'merchants' => $stmt->fetchAll(PDO::FETCH_ASSOC),
        ]);
        break;
    }

    // ──────────────────────────────────────────────────────────────────
    // SUMMARY — billing estimate per merchant for current period
    // ──────────────────────────────────────────────────────────────────
    case 'summary': {
        $merchantId = $input['merchant_id'] ?? null;

        $merchantW = $merchantId ? "AND mf.merchant_id = ?" : "";
        $params    = $merchantId ? [$merchantId] : [];

        // Active fee schedules with live counts
        $stmt = $conn->prepare("
            SELECT
                mf.id,
                mf.merchant_id,
                COALESCE(m.merchant_name, mf.merchant_id) AS merchant_name,
                mf.fee_label,
                mf.billing_cycle,
                mf.annual_license_fee,
                mf.cost_per_member,
                mf.cost_per_basket,
                mf.cost_per_order,
                mf.cost_per_ach,
                mf.effective_date,

                -- Live counts from related tables
                (SELECT COUNT(DISTINCT w.member_id)
                 FROM wallet w WHERE w.merchant_id = mf.merchant_id
                ) AS active_members,

                (SELECT COUNT(DISTINCT o.basket_id)
                 FROM orders o
                 JOIN wallet w2 ON w2.member_id = o.member_id
                 WHERE w2.merchant_id = mf.merchant_id
                   AND o.placed_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
                ) AS baskets_this_month,

                (SELECT COUNT(*)
                 FROM orders o
                 JOIN wallet w3 ON w3.member_id = o.member_id
                 WHERE w3.merchant_id = mf.merchant_id
                   AND o.placed_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
                ) AS orders_this_month,

                (SELECT COUNT(*)
                 FROM orders o
                 JOIN wallet w4 ON w4.member_id = o.member_id
                 WHERE w4.merchant_id = mf.merchant_id
                   AND o.paid_flag = 1
                   AND o.paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
                ) AS ach_payments_this_month

            FROM merchant_fees mf
            LEFT JOIN merchant m ON m.merchant_id = mf.merchant_id
            WHERE mf.is_active = 1
              AND mf.effective_date <= CURDATE()
              AND (mf.end_date IS NULL OR mf.end_date >= CURDATE())
              {$merchantW}
            ORDER BY mf.merchant_id
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Calculate estimated fees
        foreach ($rows as &$r) {
            $est = 0;
            if ($r['annual_license_fee']) {
                // Prorate annual to monthly for estimate
                $cycle = $r['billing_cycle'];
                $divisor = $cycle === 'annually' ? 1 : ($cycle === 'quarterly' ? 4 : 12);
                $est += (float) $r['annual_license_fee'] / $divisor;
            }
            if ($r['cost_per_member']) {
                $est += (float) $r['cost_per_member'] * (int) $r['active_members'];
            }
            if ($r['cost_per_basket']) {
                $est += (float) $r['cost_per_basket'] * (int) $r['baskets_this_month'];
            }
            if ($r['cost_per_order']) {
                $est += (float) $r['cost_per_order'] * (int) $r['orders_this_month'];
            }
            if ($r['cost_per_ach']) {
                $est += (float) $r['cost_per_ach'] * (int) $r['ach_payments_this_month'];
            }
            $r['estimated_fee'] = round($est, 2);
        }
        unset($r);

        echo json_encode(['success' => true, 'summary' => $rows]);
        break;
    }

    default:
        echo json_encode([
            'success' => false,
            'error'   => 'Invalid action. Use: list, get, save, delete, merchants, summary',
        ]);
        break;
}

} catch (\Throwable $e) {
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
        'file'    => basename($e->getFile()),
        'line'    => $e->getLine(),
    ]);
}
