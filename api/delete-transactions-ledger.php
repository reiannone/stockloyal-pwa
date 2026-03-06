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

$input = json_decode(file_get_contents('php://input'), true) ?? [];

// Accept any of the possible PK column names the frontend might send
$id = $input['id'] ?? $input['tx_id'] ?? $input['record_id'] ?? $input['ledger_id'] ?? null;

if (!$id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing record id']);
    exit;
}

try {
    $stmt = $conn->prepare("DELETE FROM transactions_ledger WHERE tx_id = ?");
    $stmt->execute([(int) $id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Record not found']);
        exit;
    }

    echo json_encode(['success' => true, 'deleted_id' => (int) $id]);
} catch (Exception $e) {
    error_log('delete-transactions-ledger.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
