<?php
/**
 * alpaca-download-document.php
 * ─────────────────────────────────────────────────────────────────
 * Returns a pre-signed download URL for an Alpaca document (PDF).
 * The frontend opens this URL in a new tab for the member.
 *
 * POST { member_id, document_id }
 * ─────────────────────────────────────────────────────────────────
 */
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/BrokerAdapterFactory.php';

$input      = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId   = strtolower(trim((string)($input['member_id'] ?? '')));
$documentId = trim((string)($input['document_id'] ?? ''));

if (!$memberId || !$documentId) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Missing member_id or document_id"]);
    exit;
}

try {
    // ── Verify member owns this Alpaca account ──
    $stmt = $conn->prepare("
        SELECT bc.broker_account_id, m.merchant_id
        FROM broker_credentials bc
        JOIN members m ON m.member_id = bc.member_id
        WHERE bc.member_id = :mid AND LOWER(bc.broker) = 'alpaca'
          AND bc.broker_account_id IS NOT NULL
        LIMIT 1
    ");
    $stmt->execute([':mid' => $memberId]);
    $cred = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$cred || empty($cred['broker_account_id'])) {
        echo json_encode(["success" => false, "error" => "No Alpaca account linked."]);
        exit;
    }

    $accountId  = $cred['broker_account_id'];
    $merchantId = $cred['merchant_id'] ?? '';
    $adapter    = BrokerAdapterFactory::forMerchant($conn, $merchantId, 'Alpaca');
    $alpaca     = $adapter->getApi();

    // ── Get pre-signed download URL ──
    $result = $alpaca->getDocumentDownloadUrl($accountId, $documentId);

    if (!$result['success'] || empty($result['url'])) {
        echo json_encode([
            "success" => false,
            "error"   => $result['error'] ?? "Could not generate download link.",
        ]);
        exit;
    }

    echo json_encode([
        "success"      => true,
        "download_url" => $result['url'],
    ]);

} catch (Exception $e) {
    error_log("[alpaca-download-document] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error: " . $e->getMessage()]);
}
