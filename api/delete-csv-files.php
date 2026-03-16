<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');

$input   = json_decode(file_get_contents('php://input'), true) ?? [];
$fileIds = array_filter(array_map('intval', (array) ($input['file_ids'] ?? [])));

if (empty($fileIds)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'file_ids array is required']);
    exit;
}

try {
    $placeholders = implode(',', array_fill(0, count($fileIds), '?'));

    $stmt = $conn->prepare(
        "SELECT file_id, relative_path, filename FROM payment_files WHERE file_id IN ({$placeholders})"
    );
    $stmt->execute(array_values($fileIds));
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($records)) {
        echo json_encode(['success' => false, 'error' => 'No files found with provided IDs']);
        exit;
    }

    $deleted       = 0;
    $filesDeleted  = 0;
    $errors        = [];

    foreach ($records as $record) {
        // Remove physical file
        $fullPath = __DIR__ . '/' . ltrim($record['relative_path'], '/');
        if (file_exists($fullPath)) {
            if (!unlink($fullPath)) {
                $errors[] = "Could not delete file: {$record['filename']}";
                continue;
            }
            $filesDeleted++;
        }
        // Remove DB record
        $conn->prepare("DELETE FROM payment_files WHERE file_id = ?")->execute([$record['file_id']]);
        $deleted++;
    }

    echo json_encode([
        'success'               => $deleted > 0,
        'deleted'               => $deleted,
        'physical_files_deleted'=> $filesDeleted,
        'errors'                => $errors,
    ]);

} catch (Throwable $e) {
    error_log('[delete-csv-files] ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
