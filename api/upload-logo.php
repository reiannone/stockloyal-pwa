<?php
/**
 * upload-logo.php
 * 
 * Handles logo images for brokers and merchants.
 * Two modes:
 *   1. FILE UPLOAD: multipart/form-data with 'logo' file field
 *   2. URL FETCH:   JSON body with 'source_url' — fetches the image and saves it
 * 
 * Both modes save the image to the production /uploads/logos/ directory
 * and return the public URL.
 * 
 * Returns JSON:
 *   { success: true, url: "https://...", filename: "...", ... }
 *   { success: false, error: "..." }
 */

declare(strict_types=1);

require_once __DIR__ . '/cors.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// ── Config ──────────────────────────────────────────────────────────────
$uploadDir  = __DIR__ . '/uploads/logos/';
$maxSize    = 2 * 1024 * 1024; // 2 MB

$allowedMimes = [
    'image/png'     => 'png',
    'image/jpeg'    => 'jpg',
    'image/jpg'     => 'jpg',
    'image/gif'     => 'gif',
    'image/webp'    => 'webp',
    'image/svg+xml' => 'svg',
];

// Common image extensions for URL-based fetches
$allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'];

// ── Create upload dir if needed ─────────────────────────────────────────
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Failed to create upload directory']);
        exit;
    }
}

// ── Detect mode: file upload vs URL fetch ───────────────────────────────
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$isJsonRequest = (stripos($contentType, 'application/json') !== false);

if ($isJsonRequest) {
    // ════════════════════════════════════════════════════════════════════
    //  MODE 2: Fetch image from external URL
    // ════════════════════════════════════════════════════════════════════
    $raw   = file_get_contents('php://input');
    $input = json_decode($raw, true);

    if (!is_array($input)) {
        echo json_encode(['success' => false, 'error' => 'Invalid JSON payload']);
        exit;
    }

    $sourceUrl = trim($input['source_url'] ?? '');
    $type      = $input['type']      ?? 'broker';
    $entityId  = $input['broker_id'] ?? $input['merchant_id'] ?? ('url_' . time());

    if ($sourceUrl === '') {
        echo json_encode(['success' => false, 'error' => 'source_url is required']);
        exit;
    }

    // Validate URL format
    if (!filter_var($sourceUrl, FILTER_VALIDATE_URL)) {
        echo json_encode(['success' => false, 'error' => 'Invalid URL format']);
        exit;
    }

    // Only allow http/https
    $scheme = parse_url($sourceUrl, PHP_URL_SCHEME);
    if (!in_array(strtolower($scheme ?? ''), ['http', 'https'])) {
        echo json_encode(['success' => false, 'error' => 'Only http/https URLs are supported']);
        exit;
    }

    // Fetch the image via cURL
    $ch = curl_init($sourceUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => 'StockLoyal-LogoFetcher/1.0',
    ]);

    $imageData   = curl_exec($ch);
    $httpCode    = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $fetchedMime = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $curlError   = curl_error($ch);
    curl_close($ch);

    if ($imageData === false || $httpCode !== 200) {
        echo json_encode([
            'success' => false,
            'error'   => 'Failed to fetch image from URL (HTTP ' . $httpCode . ')',
            'details' => $curlError ?: null,
        ]);
        exit;
    }

    // Validate size
    if (strlen($imageData) > $maxSize) {
        echo json_encode(['success' => false, 'error' => 'Fetched image exceeds 2MB limit']);
        exit;
    }

    // Determine extension from MIME or URL
    $fetchedMime = explode(';', (string) $fetchedMime)[0];
    $fetchedMime = trim($fetchedMime);

    if (isset($allowedMimes[$fetchedMime])) {
        $extension = $allowedMimes[$fetchedMime];
    } else {
        // Fallback: try to get extension from URL path
        $urlPath = parse_url($sourceUrl, PHP_URL_PATH);
        $ext = strtolower(pathinfo($urlPath ?? '', PATHINFO_EXTENSION));
        if (in_array($ext, $allowedExtensions)) {
            $extension = ($ext === 'jpeg') ? 'jpg' : $ext;
        } else {
            // Last resort: write temp file and detect with finfo
            $tmpFile = tempnam(sys_get_temp_dir(), 'logo_');
            file_put_contents($tmpFile, $imageData);
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $detectedMime = finfo_file($finfo, $tmpFile);
            finfo_close($finfo);
            unlink($tmpFile);

            if (isset($allowedMimes[$detectedMime])) {
                $extension = $allowedMimes[$detectedMime];
            } else {
                echo json_encode([
                    'success' => false,
                    'error'   => 'Unsupported image type: ' . ($detectedMime ?: $fetchedMime),
                ]);
                exit;
            }
        }
    }

    // Save to disk
    $sanitizedId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $entityId);
    $filename    = $type . '_' . $sanitizedId . '_' . time() . '.' . $extension;
    $filepath    = $uploadDir . $filename;

    if (file_put_contents($filepath, $imageData) === false) {
        echo json_encode(['success' => false, 'error' => 'Failed to save image to disk']);
        exit;
    }

} else {
    // ════════════════════════════════════════════════════════════════════
    //  MODE 1: Direct file upload (multipart/form-data)
    // ════════════════════════════════════════════════════════════════════
    if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE   => 'File exceeds server limit',
            UPLOAD_ERR_FORM_SIZE  => 'File exceeds form limit',
            UPLOAD_ERR_PARTIAL    => 'File only partially uploaded',
            UPLOAD_ERR_NO_FILE    => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temp folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write to disk',
            UPLOAD_ERR_EXTENSION  => 'Upload blocked by extension',
        ];
        $errorCode = $_FILES['logo']['error'] ?? UPLOAD_ERR_NO_FILE;
        $errorMsg  = $errorMessages[$errorCode] ?? 'Unknown upload error';
        echo json_encode(['success' => false, 'error' => $errorMsg]);
        exit;
    }

    $file     = $_FILES['logo'];
    $type     = $_POST['type']      ?? 'broker';
    $entityId = $_POST['broker_id'] ?? $_POST['merchant_id'] ?? ('upload_' . time());

    // Validate MIME type
    $finfo    = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!isset($allowedMimes[$mimeType])) {
        echo json_encode(['success' => false, 'error' => 'Invalid file type: ' . $mimeType]);
        exit;
    }

    // Validate file size
    if ($file['size'] > $maxSize) {
        echo json_encode(['success' => false, 'error' => 'File too large. Maximum size is 2MB.']);
        exit;
    }

    // Save to disk
    $extension   = $allowedMimes[$mimeType];
    $sanitizedId = preg_replace('/[^a-zA-Z0-9_-]/', '_', $entityId);
    $filename    = $type . '_' . $sanitizedId . '_' . time() . '.' . $extension;
    $filepath    = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file']);
        exit;
    }
}

// ── Build public URL ────────────────────────────────────────────────────
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host     = $_SERVER['HTTP_HOST'] ?? 'api.stockloyal.com';

if (strpos($host, 'localhost') !== false || strpos($host, '127.0.0.1') !== false) {
    $baseUrl = $protocol . '://' . $host . '/api';
} else {
    $baseUrl = 'https://api.stockloyal.com/api';
}

$publicUrl = $baseUrl . '/uploads/logos/' . $filename;

error_log("[upload-logo] Saved: $filename for {$type}:{$entityId} -> $publicUrl");

echo json_encode([
    'success'   => true,
    'url'       => $publicUrl,
    'filename'  => $filename,
    'type'      => $type,
    'entity_id' => $entityId,
]);
