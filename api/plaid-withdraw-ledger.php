<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/PlaidClient.php';

// plaid-withdraw-ledger.php — Withdraw funds from Plaid Ledger to StockLoyal's bank.
// POST { amount, network? } or POST { action: "balance" }

header('Content-Type: application/json');

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = trim($input['action'] ?? '');

    $plaid = new PlaidClient();

    // ── Balance check ──
    if ($action === 'balance') {
        $result = $plaid->getLedgerBalance();

        echo json_encode([
            'success' => true,
            'balance' => $result['balance'] ?? $result,
        ]);
        exit;
    }

    // ── Withdraw funds ──
    $amount  = floatval($input['amount'] ?? 0);
    $network = trim($input['network'] ?? 'ach');

    if ($amount <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Amount must be positive.']);
        exit;
    }

    if (!in_array($network, ['ach', 'same-day-ach', 'rtp'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid network. Use ach, same-day-ach, or rtp.']);
        exit;
    }

    $response = $plaid->withdrawLedger([
        'amount'          => number_format($amount, 2, '.', ''),
        'network'         => $network,
        'idempotency_key' => 'SL-withdraw-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)),
        'description'     => 'StockLoyal IB sweep withdrawal',
    ]);

    echo json_encode([
        'success'  => true,
        'sweep'    => $response['sweep'] ?? null,
        'amount'   => $amount,
        'network'  => $network,
        'message'  => "Withdrawal of \${$amount} initiated via {$network}",
    ]);

} catch (Throwable $ex) {
    error_log("[plaid-withdraw-ledger] " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}
