<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

$input      = json_decode(file_get_contents('php://input'), true) ?? [];
$merchantId = trim($input['merchant_id'] ?? '');
$broker     = trim($input['broker']      ?? '');
$dateFrom   = trim($input['date_from']   ?? '');
$dateTo     = trim($input['date_to']     ?? '');

try {
    // Ensure table exists
    $conn->exec("
        CREATE TABLE IF NOT EXISTS payment_files (
            file_id       INT AUTO_INCREMENT PRIMARY KEY,
            batch_id      VARCHAR(120) NOT NULL,
            merchant_id   VARCHAR(100) NOT NULL,
            broker        VARCHAR(100) NOT NULL,
            filename      VARCHAR(255) NOT NULL,
            file_type     ENUM('xlsx','ach_csv','detail_csv') NOT NULL,
            relative_path VARCHAR(500) NOT NULL,
            file_size     INT NOT NULL DEFAULT 0,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_merchant (merchant_id),
            INDEX idx_broker   (broker),
            INDEX idx_batch    (batch_id)
        )
    ");

    $where  = ['1=1'];
    $params = [];

    if ($merchantId) { $where[] = 'pf.merchant_id = ?'; $params[] = $merchantId; }
    if ($broker)     { $where[] = 'pf.broker = ?';      $params[] = $broker; }
    if ($dateFrom)   { $where[] = 'DATE(pf.created_at) >= ?'; $params[] = $dateFrom; }
    if ($dateTo)     { $where[] = 'DATE(pf.created_at) <= ?'; $params[] = $dateTo; }

    $whereClause = implode(' AND ', $where);

    $stmt = $conn->prepare("
        SELECT pf.file_id, pf.batch_id, pf.merchant_id, pf.broker,
               pf.filename, pf.file_type AS type, pf.relative_path,
               pf.file_size, pf.created_at,
               m.merchant_name
        FROM   payment_files pf
        LEFT JOIN merchant m ON m.merchant_id = pf.merchant_id
        WHERE  {$whereClause}
        ORDER  BY pf.created_at DESC, pf.file_id DESC
        LIMIT  500
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $apiBase = rtrim(getenv('API_BASE_URL') ?: 'https://api.stockloyal.com/api', '/');

    $files = array_map(function (array $row) use ($apiBase): array {
        return [
            'file_id'       => (int)  $row['file_id'],
            'batch_id'      => $row['batch_id'],
            'merchant_id'   => $row['merchant_id'],
            'merchant_name' => $row['merchant_name'] ?? $row['merchant_id'],
            'broker'        => $row['broker'],
            'filename'      => $row['filename'],
            'type'          => $row['type'],
            'relative_path' => $row['relative_path'],
            'url'           => $apiBase . '/' . ltrim($row['relative_path'], '/'),
            'file_size'     => (int)  $row['file_size'],
            'created_at'    => $row['created_at'],
        ];
    }, $rows);

    echo json_encode(['success' => true, 'files' => $files, 'count' => count($files)]);

} catch (Throwable $e) {
    error_log('[list-csv-files] ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage(), 'files' => []]);
}
