<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/PlaidClient.php';

// plaid-exchange-token.php — Exchange Plaid Link public_token for access_token.
// POST { merchant_id, public_token, account_id, account_name, account_mask,
//        institution_id, institution_name } → { success }

header('Content-Type: application/json');

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];

    $merchant_id      = trim($input['merchant_id'] ?? '');
    $public_token     = trim($input['public_token'] ?? '');
    $account_id       = trim($input['account_id'] ?? '');
    $account_name     = trim($input['account_name'] ?? '');
    $account_mask     = trim($input['account_mask'] ?? '');
    $institution_id   = trim($input['institution_id'] ?? '');
    $institution_name = trim($input['institution_name'] ?? '');

    if ($merchant_id === '' || $public_token === '' || $account_id === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'merchant_id, public_token, and account_id are required']);
        exit;
    }

    // Verify merchant exists
    $stmt = $conn->prepare("SELECT merchant_id FROM merchant WHERE merchant_id = ?");
    $stmt->execute([$merchant_id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Merchant not found']);
        exit;
    }

    // Exchange public_token for permanent access_token
    $plaid = new PlaidClient();
    $exchange = $plaid->exchangePublicToken($public_token);

    $access_token  = $exchange['access_token'];
    $plaid_item_id = $exchange['item_id'];

    // Encrypt access_token before storing
    $encryption_key = defined('ENCRYPTION_KEY') ? ENCRYPTION_KEY : ($_ENV['ENCRYPTION_KEY'] ?? 'changeme32charstringchangeme32char');
    $encryption_iv  = defined('ENCRYPTION_IV')  ? ENCRYPTION_IV  : ($_ENV['ENCRYPTION_IV']  ?? 'changeme16charIV');
    $encrypted_token = openssl_encrypt($access_token, 'aes-256-cbc', $encryption_key, 0, $encryption_iv);

    // Upsert into merchant_plaid
    $stmt = $conn->prepare("
        INSERT INTO merchant_plaid
            (merchant_id, plaid_item_id, access_token, account_id,
             account_name, account_mask, institution_id, institution_name, consent_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'active')
        ON DUPLICATE KEY UPDATE
            plaid_item_id    = VALUES(plaid_item_id),
            access_token     = VALUES(access_token),
            account_id       = VALUES(account_id),
            account_name     = VALUES(account_name),
            account_mask     = VALUES(account_mask),
            institution_id   = VALUES(institution_id),
            institution_name = VALUES(institution_name),
            consent_date     = NOW(),
            status           = 'active'
    ");
    $stmt->execute([
        $merchant_id, $plaid_item_id, $encrypted_token, $account_id,
        $account_name ?: null, $account_mask ?: null,
        $institution_id ?: null, $institution_name ?: null,
    ]);

    // Update merchant funding method
    $stmt = $conn->prepare("
        UPDATE merchant
        SET funding_method = 'plaid', plaid_onboarded_at = NOW()
        WHERE merchant_id = ?
    ");
    $stmt->execute([$merchant_id]);

    echo json_encode([
        'success'          => true,
        'institution_name' => $institution_name,
        'account_mask'     => $account_mask,
        'message'          => 'Bank account connected successfully',
    ]);

} catch (Throwable $ex) {
    error_log("[plaid-exchange-token] " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}
