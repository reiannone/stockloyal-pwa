<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
  http_response_code(204); 
  exit; 
}

header("Content-Type: application/json");
require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents("php://input"), true);
$fileIds = $input['file_ids'] ?? [];

if (!is_array($fileIds) || empty($fileIds)) {
  http_response_code(400);
  echo json_encode([
    "success" => false,
    "error" => "file_ids array is required"
  ]);
  exit;
}

try {
  // Get file paths before deleting from database
  $placeholders = implode(',', array_fill(0, count($fileIds), '?'));
  $stmt = $conn->prepare("SELECT file_id, relative_path FROM csv_files WHERE file_id IN ($placeholders)");
  $stmt->execute($fileIds);
  $files = $stmt->fetchAll(PDO::FETCH_ASSOC);
  
  if (empty($files)) {
    echo json_encode([
      "success" => false,
      "error" => "No files found with provided IDs"
    ]);
    exit;
  }
  
  // Delete from database
  $stmt = $conn->prepare("DELETE FROM csv_files WHERE file_id IN ($placeholders)");
  $stmt->execute($fileIds);
  $deletedCount = $stmt->rowCount();
  
  // Delete physical files
  $filesDeleted = 0;
  $errors = [];
  
  foreach ($files as $file) {
    $filePath = __DIR__ . '/' . ltrim($file['relative_path'], '/');
    
    if (file_exists($filePath)) {
      if (unlink($filePath)) {
        $filesDeleted++;
      } else {
        $errors[] = "Failed to delete file: " . basename($filePath);
      }
    }
  }
  
  echo json_encode([
    "success" => true,
    "deleted_from_db" => $deletedCount,
    "physical_files_deleted" => $filesDeleted,
    "errors" => $errors
  ]);
  
} catch (PDOException $e) {
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => "Database error: " . $e->getMessage()
  ]);
}
