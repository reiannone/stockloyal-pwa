<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/PlaidClient.php';

// plaid-link-token.php — Generate a Plaid Link token for merchant bank connection.
// POST { merchant_id } → { success, link_token, expiration }

header('Content-Type: application/json');

try {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $merchant_id = trim($input['merchant_id'] ?? '');

    if ($merchant_id === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'merchant_id is required']);
        exit;
    }

    // Verify merchant exists
    $stmt = $conn->prepare("SELECT merchant_id, merchant_name FROM merchant WHERE merchant_id = ?");
    $stmt->execute([$merchant_id]);
    $merchant = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$merchant) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Merchant not found']);
        exit;
    }

    $plaid = new PlaidClient();

    $result = $plaid->createLinkToken([
        'user' => ['client_user_id' => $merchant_id],
    ]);

    echo json_encode([
        'success'    => true,
        'link_token' => $result['link_token'],
        'expiration' => $result['expiration'] ?? null,
    ]);

} catch (Throwable $ex) {
    error_log("[plaid-link-token] " . $ex->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
}
