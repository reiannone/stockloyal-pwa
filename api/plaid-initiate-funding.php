<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/PlaidClient.php';

// plaid-initiate-funding.php — Initiate ACH debit from merchant's bank via Plaid Transfer.
// POST { merchant_id, broker, batch_id, network?: 'ach'|'same-day-ach' }

header('Content-Type: application/json');

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $merchant_id = trim($input['merchant_id'] ?? '');
    $broker      = trim($input['broker'] ?? '');
    $batch_id    = trim($input['batch_id'] ?? '');
    $network     = trim($input['network'] ?? 'ach');

    if ($merchant_id === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'merchant_id is required']);
        exit;
    }

    // ── 1. Verify merchant has Plaid connected ──
    $stmt = $conn->prepare("
        SELECT mp.*, m.merchant_name
        FROM merchant_plaid mp
        JOIN merchant m ON m.merchant_id = mp.merchant_id
        WHERE mp.merchant_id = ? AND mp.status = 'active'
    ");
    $stmt->execute([$merchant_id]);
    $mp = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$mp) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Merchant does not have a linked bank account. Connect via Plaid first.']);
        exit;
    }

    // Decrypt access_token
    $encryption_key = defined('ENCRYPTION_KEY') ? ENCRYPTION_KEY : ($_ENV['ENCRYPTION_KEY'] ?? 'changeme32charstringchangeme32char');
    $encryption_iv  = defined('ENCRYPTION_IV')  ? ENCRYPTION_IV  : ($_ENV['ENCRYPTION_IV']  ?? 'changeme16charIV');
    $access_token = openssl_decrypt($mp['access_token'], 'aes-256-cbc', $encryption_key, 0, $encryption_iv);

    if ($access_token === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to decrypt Plaid access token']);
        exit;
    }

    // ── 2. Get approved orders for this batch or merchant+broker ──
    if ($batch_id !== '') {
        // Fund a specific batch
        $stmt = $conn->prepare("
            SELECT po.basket_id, po.member_id, po.merchant_id, po.symbol, po.amount, po.broker
            FROM prepared_orders po
            WHERE po.batch_id = ? AND po.status = 'approved'
        ");
        $stmt->execute([$batch_id]);
    } else {
        // Fund all approved orders for merchant+broker
        $stmt = $conn->prepare("
            SELECT o.order_id, o.member_id, o.merchant_id, o.symbol, o.amount, o.broker
            FROM orders o
            WHERE o.merchant_id = ? AND o.status = 'approved'
            " . ($broker !== '' ? "AND o.broker = ?" : "") . "
        ");
        $params = [$merchant_id];
        if ($broker !== '') $params[] = $broker;
        $stmt->execute($params);
    }

    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($orders)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No approved orders to fund.']);
        exit;
    }

    $total_amount = 0;
    $order_ids = [];
    foreach ($orders as $o) {
        $total_amount += floatval($o['amount']);
        $order_ids[] = $o['order_id'] ?? $o['basket_id'] ?? null;
    }
    $order_ids = array_filter($order_ids);

    if ($total_amount <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Total amount must be greater than zero.']);
        exit;
    }

    // ── 3. Generate idempotency key ──
    $idempotency_key = "SL-{$merchant_id}-" . date('Ymd-His') . "-" . substr(md5(json_encode($order_ids)), 0, 8);

    // ── 4. Create transfer authorization ──
    $plaid = new PlaidClient();

    $auth_response = $plaid->createTransferAuthorization([
        'access_token' => $access_token,
        'account_id'   => $mp['account_id'],
        'type'         => 'debit',
        'network'      => $network,
        'amount'       => number_format($total_amount, 2, '.', ''),
        'ach_class'    => 'ccd',
        'user'         => [
            'legal_name' => $mp['merchant_name'] ?: $merchant_id,
        ],
        'idempotency_key' => $idempotency_key . '-auth',
    ]);

    $authorization = $auth_response['authorization'];

    if ($authorization['decision'] !== 'approved') {
        $rationale = $authorization['decision_rationale']['description'] ?? 'Unknown reason';
        http_response_code(400);
        echo json_encode([
            'success'  => false,
            'error'    => "Transfer authorization declined: {$rationale}",
            'decision' => $authorization['decision'],
        ]);
        exit;
    }

    // ── 5. Create the transfer ──
    $transfer_response = $plaid->createTransfer([
        'authorization_id' => $authorization['id'],
        'access_token'     => $access_token,
        'account_id'       => $mp['account_id'],
        'type'             => 'debit',
        'network'          => $network,
        'amount'           => number_format($total_amount, 2, '.', ''),
        'description'      => "StockLoyal sweep {$merchant_id}" . ($broker !== '' ? " [{$broker}]" : ""),
        'ach_class'        => 'ccd',
        'user'             => [
            'legal_name' => $mp['merchant_name'] ?: $merchant_id,
        ],
        'idempotency_key'  => $idempotency_key,
    ]);

    $transfer = $transfer_response['transfer'];

    // ── 6. Record in plaid_transfers ──
    $stmt = $conn->prepare("
        INSERT INTO plaid_transfers
            (transfer_id, authorization_id, batch_id, merchant_id, broker,
             amount, network, ach_class, description, status,
             idempotency_key, order_ids, order_count, plaid_created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ccd', ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $transfer['id'], $authorization['id'], $batch_id ?: null,
        $merchant_id, $broker ?: null, $total_amount, $network,
        $transfer['description'] ?? null, $transfer['status'] ?? 'pending',
        $idempotency_key, json_encode($order_ids), count($orders),
        $transfer['created'] ?? date('Y-m-d H:i:s'),
    ]);

    // ── 7. Mark orders as funded ──
    if ($batch_id !== '') {
        // Update prepare_batches status
        $stmt = $conn->prepare("UPDATE prepare_batches SET status = 'submitted', submitted_at = NOW() WHERE batch_id = ?");
        $stmt->execute([$batch_id]);
    } else {
        // Update orders directly
        $placeholders = implode(',', array_fill(0, count($order_ids), '?'));
        if (!empty($order_ids)) {
            $stmt = $conn->prepare("
                UPDATE orders
                SET status = 'funded', paid_flag = 1, paid_at = NOW(), paid_batch_id = ?
                WHERE order_id IN ({$placeholders})
            ");
            $stmt->execute(array_merge([$idempotency_key], $order_ids));
        }
    }

    echo json_encode([
        'success'             => true,
        'transfer_id'         => $transfer['id'],
        'authorization_id'    => $authorization['id'],
        'batch_id'            => $batch_id ?: $idempotency_key,
        'status'              => $transfer['status'] ?? 'pending',
        'amount'              => $total_amount,
        'order_count'         => count($orders),
        'network'             => $network,
        'expected_settlement' => $transfer['expected_settlement_date'] ?? null,
        'merchant'            => $mp['merchant_name'],
        'institution'         => $mp['institution_name'],
        'account_mask'        => $mp['account_mask'],
    ]);

} catch (Throwable $ex) {
    error_log("[plaid-initiate-funding] " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}
