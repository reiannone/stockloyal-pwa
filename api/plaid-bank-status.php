<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

// plaid-bank-status.php — Check merchant's Plaid bank connection status.
// POST { merchant_id } → { success, bank: { institution_name, account_mask, ... } }

header('Content-Type: application/json');

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $merchant_id = trim($input['merchant_id'] ?? '');

    if ($merchant_id === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'merchant_id is required']);
        exit;
    }

    $stmt = $conn->prepare("
        SELECT institution_name, account_name, account_mask, status, consent_date, created_at
        FROM merchant_plaid
        WHERE merchant_id = ?
    ");
    $stmt->execute([$merchant_id]);
    $bank = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$bank) {
        echo json_encode(['success' => true, 'bank' => null, 'connected' => false]);
        exit;
    }

    echo json_encode([
        'success'   => true,
        'bank'      => $bank,
        'connected' => $bank['status'] === 'active',
    ]);

} catch (Throwable $ex) {
    error_log("[plaid-bank-status] " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}
