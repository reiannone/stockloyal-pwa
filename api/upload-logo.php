<?php
/**
 * upload-logo.php
 * 
 * Handles logo image uploads for brokers and merchants.
 * Stores files in /uploads/logos/ directory and returns the public URL.
 * 
 * POST Parameters:
 *   - logo: File upload (required)
 *   - type: 'broker' or 'merchant' (required)
 *   - broker_id or merchant_id: ID for naming the file (optional, uses timestamp if not provided)
 * 
 * Returns:
 *   - success: boolean
 *   - url: string (public URL to the uploaded image)
 *   - error: string (if failed)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Check if file was uploaded
if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE => 'File exceeds server limit',
        UPLOAD_ERR_FORM_SIZE => 'File exceeds form limit',
        UPLOAD_ERR_PARTIAL => 'File only partially uploaded',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temp folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write to disk',
        UPLOAD_ERR_EXTENSION => 'Upload blocked by extension',
    ];
    $errorCode = $_FILES['logo']['error'] ?? UPLOAD_ERR_NO_FILE;
    $errorMsg = $errorMessages[$errorCode] ?? 'Unknown upload error';
    echo json_encode(['success' => false, 'error' => $errorMsg]);
    exit;
}

$file = $_FILES['logo'];
$type = $_POST['type'] ?? 'broker';
$entityId = $_POST['broker_id'] ?? $_POST['merchant_id'] ?? ('upload_' . time());

// Validate file type
$allowedMimes = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/jpg' => 'jpg',
    'image/gif' => 'gif',
    'image/webp' => 'webp',
    'image/svg+xml' => 'svg',
];

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!isset($allowedMimes[$mimeType])) {
    echo json_encode(['success' => false, 'error' => 'Invalid file type: ' . $mimeType]);
    exit;
}

// Validate file size (max 2MB)
$maxSize = 2 * 1024 * 1024;
if ($file['size'] > $maxSize) {
    echo json_encode(['success' => false, 'error' => 'File too large. Maximum size is 2MB.']);
    exit;
}

// Create uploads directory if it doesn't exist
$uploadDir = __DIR__ . '/uploads/logos/';
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Failed to create upload directory']);
        exit;
    }
}

// Generate unique filename
$extension = $allowedMimes[$mimeType];
$sanitizedId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $entityId);
$filename = $type . '_' . $sanitizedId . '_' . time() . '.' . $extension;
$filepath = $uploadDir . $filename;

// Move uploaded file
if (!move_uploaded_file($file['tmp_name'], $filepath)) {
    echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file']);
    exit;
}

// Generate public URL
// Determine base URL from server or use configured domain
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'api.stockloyal.com';

// If running on localhost, use localhost URL
if (strpos($host, 'localhost') !== false || strpos($host, '127.0.0.1') !== false) {
    $baseUrl = $protocol . '://' . $host . '/api';
} else {
    // Production - use configured domain
    $baseUrl = 'https://api.stockloyal.com/api';
}

$publicUrl = $baseUrl . '/uploads/logos/' . $filename;

// Log the upload
error_log("[upload-logo] Uploaded: $filename for $type:$entityId -> $publicUrl");

echo json_encode([
    'success' => true,
    'url' => $publicUrl,
    'filename' => $filename,
    'type' => $type,
    'entity_id' => $entityId,
]);
