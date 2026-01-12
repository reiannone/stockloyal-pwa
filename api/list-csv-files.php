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

// Get input (optional filters)
$input = json_decode(file_get_contents("php://input"), true);
$broker = isset($input['broker']) ? trim($input['broker']) : null;
$type = isset($input['type']) ? trim($input['type']) : null;

try {
  // Build query with optional filters
  $sql = "
    SELECT 
      file_id,
      merchant_id,
      broker,
      filename,
      relative_path,
      file_size,
      file_type as type,
      created_at
    FROM csv_files
    WHERE 1=1
  ";
  
  $params = [];
  
  if ($broker) {
    $sql .= " AND broker = :broker";
    $params[':broker'] = $broker;
  }
  
  if ($type) {
    $sql .= " AND file_type = :type";
    $params[':type'] = $type;
  }
  
  $sql .= " ORDER BY created_at DESC";
  
  $stmt = $conn->prepare($sql);
  $stmt->execute($params);
  
  $files = $stmt->fetchAll(PDO::FETCH_ASSOC);
  
  // Add full URL for each file
  $apiBase = getenv('API_BASE_URL') ?: 'https://api.stockloyal.com/api';
  
  foreach ($files as &$file) {
    $file['url'] = $apiBase . '/' . ltrim($file['relative_path'], '/');
    
    // Type cast
    $file['file_id'] = (int)$file['file_id'];
    $file['file_size'] = $file['file_size'] ? (int)$file['file_size'] : null;
  }
  
  echo json_encode([
    "success" => true,
    "files" => $files,
    "count" => count($files)
  ]);
  
} catch (PDOException $e) {
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "error" => "Database error: " . $e->getMessage()
  ]);
}
