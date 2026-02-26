<?php
/**
 * alpaca-get-documents.php
 * ─────────────────────────────────────────────────────────────────
 * Lists documents for a member's Alpaca account.
 *   - Trade confirmations
 *   - Monthly account statements
 *   - Tax documents (1099-B, 1099-DIV, etc.)
 *
 * POST { member_id, type?, start?, end? }
 *   type: trade_confirmation | account_statement | tax_1099_b | tax_1099_div | (blank=all)
 *   start/end: YYYY-MM-DD date range filter
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
require_once __DIR__ . '/AlpacaBrokerAPI.php';

$input    = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId = strtolower(trim((string)($input['member_id'] ?? '')));
$type     = trim((string)($input['type'] ?? ''));
$start    = trim((string)($input['start'] ?? ''));
$end      = trim((string)($input['end'] ?? ''));

if (!$memberId) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Missing member_id"]);
    exit;
}

try {
    // ── Look up Alpaca account ──
    $stmt = $conn->prepare("
        SELECT broker_account_id, broker_account_number
        FROM broker_credentials
        WHERE member_id = :mid AND LOWER(broker) = 'alpaca'
          AND broker_account_id IS NOT NULL
        LIMIT 1
    ");
    $stmt->execute([':mid' => $memberId]);
    $cred = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$cred || empty($cred['broker_account_id'])) {
        echo json_encode(["success" => false, "error" => "No Alpaca account linked."]);
        exit;
    }

    $accountId     = $cred['broker_account_id'];
    $accountNumber = $cred['broker_account_number'] ?? '';
    $alpaca        = new AlpacaBrokerAPI();

    // ── Build query params ──
    $params = [];
    if ($type)  $params['type']  = $type;
    if ($start) $params['start'] = $start;
    if ($end)   $params['end']   = $end;

    // ── Fetch documents from Alpaca ──
    $result = $alpaca->getDocuments($accountId, $params);

    if (!$result['success']) {
        echo json_encode([
            "success" => false,
            "error"   => "Failed to retrieve documents: " . ($result['error'] ?? 'Unknown'),
        ]);
        exit;
    }

    $rawDocs = $result['data'] ?? [];

    // Types to exclude (internal/non-member-facing)
    $excludeTypes = ['account_application', 'trade_confirmation_json'];

    // ── Format for frontend ──
    $documents = [];
    foreach ($rawDocs as $doc) {
        $docType = $doc['type'] ?? 'unknown';

        // Skip internal document types
        if (in_array($docType, $excludeTypes)) continue;

        $documents[] = [
            'document_id' => $doc['id'] ?? '',
            'type'        => $docType,
            'type_label'  => formatDocType($docType),
            'date'        => $doc['date'] ?? '',
            'name'        => $doc['name'] ?? '',
            'created_at'  => $doc['created_at'] ?? '',
        ];
    }

    // Sort newest first
    usort($documents, function ($a, $b) {
        return strcmp($b['date'] ?? '', $a['date'] ?? '');
    });

    echo json_encode([
        "success"        => true,
        "documents"      => $documents,
        "count"          => count($documents),
        "account_number" => maskAccountNumber($accountNumber),
    ]);

} catch (Exception $e) {
    error_log("[alpaca-get-documents] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error: " . $e->getMessage()]);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDocType(string $type): string {
    $labels = [
        'trade_confirmation' => 'Trade Confirmation',
        'account_statement'  => 'Monthly Statement',
        'tax_1099_b'         => 'Tax Form 1099-B',
        'tax_1099_div'       => 'Tax Form 1099-DIV',
        'tax_1099_int'       => 'Tax Form 1099-INT',
        'tax_w8'             => 'Tax Form W-8BEN',
        'tax_1042_s'         => 'Tax Form 1042-S',
    ];
    return $labels[$type] ?? ucwords(str_replace('_', ' ', $type));
}

function maskAccountNumber(string $num): string {
    if (strlen($num) <= 4) return $num;
    return str_repeat('•', strlen($num) - 4) . substr($num, -4);
}
