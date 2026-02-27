<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/PlaidClient.php';

// plaid-test.php — Verify Plaid credentials are configured and working.
// GET or POST https://api.stockloyal.com/api/plaid-test.php

header('Content-Type: application/json');

try {
    $plaid = new PlaidClient();

    // Attempt to create a link token as a connectivity test
    $result = $plaid->createLinkToken([
        'user' => ['client_user_id' => 'test-connectivity-check'],
    ]);

    echo json_encode([
        'success'     => true,
        'environment' => $plaid->getEnvironment(),
        'link_token'  => $result['link_token'] ?? null,
        'expiration'  => $result['expiration'] ?? null,
        'message'     => 'Plaid connection verified!',
    ]);

} catch (Throwable $ex) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $ex->getMessage(),
    ]);
}
