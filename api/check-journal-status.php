<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$input        = json_decode(file_get_contents('php://input'), true) ?? [];
$journal_ids  = $input['journal_ids'] ?? [];

if (empty($journal_ids) || !is_array($journal_ids)) {
    echo json_encode(['success' => false, 'error' => 'No journal_ids provided']);
    exit;
}

$alpacaKey    = $_ENV['ALPACA_BROKER_API_KEY']    ?? getenv('ALPACA_BROKER_API_KEY');
$alpacaSecret = $_ENV['ALPACA_BROKER_API_SECRET'] ?? getenv('ALPACA_BROKER_API_SECRET');
$baseUrl      = $_ENV['ALPACA_BASE_URL']           ?? getenv('ALPACA_BASE_URL') ?? 'https://broker-api.sandbox.alpaca.markets';
$auth         = base64_encode("{$alpacaKey}:{$alpacaSecret}");

$statuses = [];
$errors   = [];

foreach ($journal_ids as $journalId) {
    $journalId = trim((string) $journalId);
    if (!$journalId) continue;

    $url = "{$baseUrl}/v1/journals/{$journalId}";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Basic {$auth}",
            "Accept: application/json",
        ],
        CURLOPT_TIMEOUT        => 10,
    ]);

    $body    = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        $errors[] = "Journal {$journalId}: HTTP {$httpCode}";
        continue;
    }

    $data   = json_decode($body, true);
    $status = strtolower($data['status'] ?? 'unknown');
    $statuses[$journalId] = $status;

    // Update the orders table: if settled → mark orders as funded
    if ($status === 'executed') {
        try {
            $stmt = $conn->prepare("
                UPDATE orders
                SET status = 'funded'
                WHERE alpaca_journal_id = ?
                  AND status IN ('approved', 'journaled')
            ");
            $stmt->execute([$journalId]);
        } catch (Exception $e) {
            error_log("check-journal-status.php DB update error: " . $e->getMessage());
        }

    
    }
}

echo json_encode([
    'success'  => true,
    'statuses' => $statuses,
    'errors'   => $errors,
]);
