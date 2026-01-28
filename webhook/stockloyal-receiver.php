<?php
declare(strict_types=1);

/**
 * stockloyal-receiver.php
 *
 * Production-ready CORS-enabled webhook receiver for StockLoyal.
 * 
 * Features:
 * - OPTIONS preflight handling (via cors.php)
 * - Dual authentication: API key (X-API-Key) or Bearer token (Authorization: Bearer ...)
 * - HMAC signature verification (X-Signature: sha256=<hex>)
 * - Database + file logging with rotation
 * - Idempotency/deduplication by X-Request-Id
 * - Rate limiting per IP
 * - Automatic cleanup of old dedupe files
 * - Optional round-trip ACK to ack_url in payload
 *
 * Deploy to: https://app.stockloyal.com/webhooks/stockloyal-receiver.php
 */

require_once __DIR__ . '/cors.php';      // must set headers + exit on OPTIONS
require_once __DIR__ . '/_loadenv.php';  // optional in your stack
require_once __DIR__ . '/config.php';    // DB connection via $conn

header('Content-Type: application/json');

// Use $conn (your standard) instead of $pdo
if (!isset($conn)) {
    error_log("[webhook-receiver] ERROR: Database connection \$conn not available");
    jsonOut(500, ['success' => false, 'error' => 'Database connection unavailable']);
}

//
// ---- Configuration ----
//
$WEBHOOK_SECRET = getenv('STOCKLOYAL_WEBHOOK_SECRET') ?: 'test_webhook_api_key_123456';
$ENVIRONMENT = getenv('ENVIRONMENT') ?: 'production';

// Signature requirements
$REQUIRE_SIGNATURE = ($ENVIRONMENT === 'production');

// Rate limiting (requests per minute per IP)
$RATE_LIMIT_MAX = (int)(getenv('WEBHOOK_RATE_LIMIT') ?: 60);

// Logging
$LOG_DIR = __DIR__ . '/logs';
$LOG_RETENTION_DAYS = 30; // Keep logs for 30 days
$DEDUPE_RETENTION_DAYS = 7; // Keep dedupe markers for 7 days

// Directories
$RECEIVE_LOG_DIR = $LOG_DIR . '/receive';
$ACK_LOG_DIR = $LOG_DIR . '/ack';
$DEDUPE_DIR = $LOG_DIR . '/dedupe';

//
// ---- Helper Functions ----
//

function ensureDir(string $dir): void {
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
}

function headersLower(): array {
    $h = function_exists('getallheaders') ? getallheaders() : [];
    $out = [];
    foreach ($h as $k => $v) {
        $out[strtolower((string)$k)] = (string)$v;
    }
    return $out;
}

function hget(array $headers, string $name): string {
    return $headers[strtolower($name)] ?? '';
}

function jsonOut(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function safeJsonDecode(string $raw): array {
    if ($raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function nowUtcIso(): string {
    return gmdate('c');
}

function mask(string $s, int $keep = 4): string {
    if ($s === '') return '';
    $n = strlen($s);
    if ($n <= $keep) return str_repeat('*', $n);
    return str_repeat('*', max(0, $n - $keep)) . substr($s, -$keep);
}

/**
 * Get current date-based log file path
 */
function getLogFilePath(string $baseDir, string $prefix): string {
    return rtrim($baseDir, '/') . '/' . $prefix . '_' . date('Y-m-d') . '.log';
}

/**
 * Write log line to date-based log file
 */
function logLine(string $baseDir, string $prefix, string $line): void {
    $file = getLogFilePath($baseDir, $prefix);
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($file, "[{$timestamp}] {$line}\n", FILE_APPEND | LOCK_EX);
}

/**
 * Clean old log files
 */
function cleanOldLogFiles(string $dir, int $retentionDays): void {
    if (!is_dir($dir)) return;
    
    $cutoff = time() - ($retentionDays * 86400);
    $pattern = $dir . '/*.log';
    
    foreach (glob($pattern) as $file) {
        if (is_file($file) && filemtime($file) < $cutoff) {
            @unlink($file);
        }
    }
}

/**
 * Clean old dedupe marker files
 */
function cleanOldDedupeFiles(string $dir, int $maxAgeDays = 7): void {
    if (!is_dir($dir)) return;
    
    $cutoff = time() - ($maxAgeDays * 86400);
    $pattern = $dir . '/*.seen';
    
    foreach (glob($pattern) as $file) {
        if (is_file($file) && filemtime($file) < $cutoff) {
            @unlink($file);
        }
    }
}

/**
 * Rate limiting check (file-based, simple implementation)
 * For production scale, use Redis or similar
 */
function checkRateLimit(string $ip, int $maxPerMinute): bool {
    $key = 'webhook_rate_' . md5($ip) . '_' . date('YmdHi');
    $file = sys_get_temp_dir() . "/{$key}.cnt";
    
    $count = 0;
    if (file_exists($file)) {
        $count = (int)file_get_contents($file);
    }
    
    if ($count >= $maxPerMinute) {
        return false;
    }
    
    file_put_contents($file, (string)($count + 1), LOCK_EX);
    return true;
}

/**
 * Auth: accept either X-API-Key or Authorization: Bearer
 */
function isAuthorized(array $headers, string $secret): bool {
    $xKey = hget($headers, 'X-API-Key');
    if ($xKey !== '' && hash_equals($secret, $xKey)) {
        return true;
    }

    $auth = hget($headers, 'Authorization');
    if ($auth !== '' && preg_match('/^\s*Bearer\s+(.+)\s*$/i', $auth, $m)) {
        $token = trim($m[1]);
        if ($token !== '' && hash_equals($secret, $token)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Verify HMAC signature if present
 * Format: X-Signature: sha256=<hex>
 */
function verifySignatureIfPresent(array $headers, string $raw, string $secret): array {
    $sigHeader = hget($headers, 'X-Signature');
    
    if ($sigHeader === '') {
        return ['verified' => false, 'reason' => 'absent'];
    }

    if (!preg_match('/^\s*sha256\s*=\s*([a-f0-9]{64})\s*$/i', $sigHeader, $m)) {
        return ['verified' => false, 'reason' => 'bad_format'];
    }

    $provided = strtolower($m[1]);
    $calc = hash_hmac('sha256', $raw, $secret);

    if (!hash_equals($calc, $provided)) {
        return ['verified' => false, 'reason' => 'mismatch'];
    }

    return ['verified' => true, 'reason' => 'ok'];
}

/**
 * File-based idempotency check
 */
function isDuplicateRequest(string $dedupeDir, string $requestId): bool {
    if ($requestId === '') return false;
    
    $key = preg_replace('/[^a-zA-Z0-9_\-:.]/', '_', $requestId);
    $path = rtrim($dedupeDir, '/') . '/' . $key . '.seen';
    
    if (file_exists($path)) {
        return true;
    }
    
    @file_put_contents($path, nowUtcIso(), LOCK_EX);
    return false;
}

/**
 * Log webhook to database
 */
function logToDatabase(
    PDO $conn,
    string $requestId,
    string $eventType,
    string $payload,
    bool $signatureVerified,
    string $sourceIp,
    string $origin
): bool {
    try {
        $stmt = $conn->prepare("
            INSERT INTO webhook_logs (
                request_id,
                event_type,
                payload,
                signature_verified,
                source_ip,
                origin,
                received_at,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        ");
        
        return $stmt->execute([
            $requestId,
            $eventType,
            $payload,
            $signatureVerified ? 1 : 0,
            $sourceIp,
            $origin
        ]);
    } catch (PDOException $e) {
        // Log error but don't fail the webhook
        error_log("Webhook DB logging failed: " . $e->getMessage());
        return false;
    }
}

/**
 * POST JSON to URL (for ACK callback)
 */
function postJson(string $url, array $payload, array $headers, int $timeoutSec = 10): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => $timeoutSec,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    
    $resp = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'http_status' => $code,
        'response_text' => is_string($resp) ? $resp : '',
        'curl_error' => $err ?: null,
    ];
}

//
// ---- Initialize ----
//
ensureDir($LOG_DIR);
ensureDir($RECEIVE_LOG_DIR);
ensureDir($ACK_LOG_DIR);
ensureDir($DEDUPE_DIR);

// Periodic cleanup (run on ~1% of requests)
if (random_int(1, 100) === 1) {
    cleanOldLogFiles($RECEIVE_LOG_DIR, $LOG_RETENTION_DAYS);
    cleanOldLogFiles($ACK_LOG_DIR, $LOG_RETENTION_DAYS);
    cleanOldDedupeFiles($DEDUPE_DIR, $DEDUPE_RETENTION_DAYS);
}

//
// ---- Read Request ----
//
$headers = headersLower();
$raw = file_get_contents('php://input') ?: '';
$payload = safeJsonDecode($raw);

$sourceIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$origin = hget($headers, 'origin') ?: ($_SERVER['HTTP_ORIGIN'] ?? '');

$eventType = hget($headers, 'X-Event-Type');
if ($eventType === '') {
    $eventType = (string)($payload['event_type'] ?? $payload['event'] ?? 'unknown');
}

$requestId = hget($headers, 'X-Request-Id');
if ($requestId === '') {
    $requestId = (string)($payload['request_id'] ?? $payload['event_id'] ?? ('req_' . bin2hex(random_bytes(8))));
}

$receivedAt = nowUtcIso();

//
// ---- Rate Limiting ----
//
if (!checkRateLimit($sourceIp, $RATE_LIMIT_MAX)) {
    logLine($RECEIVE_LOG_DIR, 'receiver', sprintf(
        "RATE_LIMITED ip=%s request_id=%s event_type=%s",
        $sourceIp,
        $requestId,
        $eventType
    ));
    
    jsonOut(429, [
        'success' => false,
        'error' => 'Rate limit exceeded',
        'limit' => $RATE_LIMIT_MAX,
        'window' => '1 minute'
    ]);
}

//
// ---- Authentication ----
//
if (!isAuthorized($headers, $WEBHOOK_SECRET)) {
    logLine($RECEIVE_LOG_DIR, 'receiver', sprintf(
        "UNAUTHORIZED ip=%s request_id=%s event_type=%s origin=%s api_key=%s",
        $sourceIp,
        $requestId,
        $eventType,
        $origin,
        mask(hget($headers, 'X-API-Key'))
    ));
    
    jsonOut(401, [
        'success' => false,
        'error' => 'Unauthorized'
    ]);
}

//
// ---- Signature Verification ----
//
$sigCheck = verifySignatureIfPresent($headers, $raw, $WEBHOOK_SECRET);

// In production, require signature; in dev/test, it's optional
if ($REQUIRE_SIGNATURE && $sigCheck['reason'] === 'absent') {
    logLine($RECEIVE_LOG_DIR, 'receiver', sprintf(
        "MISSING_SIGNATURE ip=%s request_id=%s event_type=%s",
        $sourceIp,
        $requestId,
        $eventType
    ));
    
    jsonOut(401, [
        'success' => false,
        'error' => 'Signature required in production',
        'environment' => $ENVIRONMENT
    ]);
}

// If signature is present but invalid, reject
if ($sigCheck['reason'] !== 'absent' && !$sigCheck['verified']) {
    logLine($RECEIVE_LOG_DIR, 'receiver', sprintf(
        "BAD_SIGNATURE ip=%s request_id=%s event_type=%s reason=%s",
        $sourceIp,
        $requestId,
        $eventType,
        $sigCheck['reason']
    ));
    
    jsonOut(401, [
        'success' => false,
        'error' => 'Invalid signature',
        'reason' => $sigCheck['reason']
    ]);
}

//
// ---- Idempotency Check ----
//
if (isDuplicateRequest($DEDUPE_DIR, $requestId)) {
    logLine($RECEIVE_LOG_DIR, 'receiver', sprintf(
        "DUPLICATE ip=%s request_id=%s event_type=%s",
        $sourceIp,
        $requestId,
        $eventType
    ));
    
    jsonOut(200, [
        'success' => true,
        'duplicate' => true,
        'request_id' => $requestId,
        'event_type' => $eventType,
        'received_at' => $receivedAt
    ]);
}

//
// ---- Log to Database ----
//
$dbLogged = false;
if (isset($conn) && $conn instanceof PDO) {
    $dbLogged = logToDatabase(
        $conn,
        $requestId,
        $eventType,
        $raw,
        $sigCheck['verified'],
        $sourceIp,
        $origin
    );
}

//
// ---- Log to File ----
//
logLine($RECEIVE_LOG_DIR, 'receiver', sprintf(
    "RECEIVED ip=%s request_id=%s event_type=%s sig=%s origin=%s db_logged=%s payload_size=%d",
    $sourceIp,
    $requestId,
    $eventType,
    $sigCheck['reason'] === 'absent' ? 'absent' : ($sigCheck['verified'] ? 'verified' : 'invalid'),
    $origin,
    $dbLogged ? 'yes' : 'no',
    strlen($raw)
));

//
// ---- Optional Round-Trip ACK ----
//
$ackUrl = '';
if (isset($payload['ack_url']) && is_string($payload['ack_url'])) {
    $ackUrl = trim($payload['ack_url']);
}
if ($ackUrl === '' && isset($payload['callback_url']) && is_string($payload['callback_url'])) {
    $ackUrl = trim($payload['callback_url']);
}

$ackResult = [
    'attempted' => false,
    'ack_url' => $ackUrl ?: null,
    'http_status' => null,
    'curl_error' => null,
    'response_json' => null,
];

if ($ackUrl !== '') {
    $ackResult['attempted'] = true;

    $ackPayload = [
        'success' => true,
        'request_id' => $requestId,
        'event_type' => $eventType,
        'received_at' => $receivedAt,
        'receiver' => 'app.stockloyal.com/webhooks/stockloyal-receiver.php',
        'environment' => $ENVIRONMENT,
    ];

    // Sign the ACK payload
    $ackJson = json_encode($ackPayload, JSON_UNESCAPED_SLASHES);
    $ackSig = hash_hmac('sha256', $ackJson, $WEBHOOK_SECRET);

    $res = postJson($ackUrl, $ackPayload, [
        'Content-Type: application/json',
        "X-API-Key: {$WEBHOOK_SECRET}",
        "X-Request-Id: {$requestId}",
        "X-Event-Type: {$eventType}",
        "X-Signature: sha256={$ackSig}",
    ]);

    $ackResult['http_status'] = $res['http_status'];
    $ackResult['curl_error'] = $res['curl_error'];

    $decoded = json_decode($res['response_text'], true);
    $ackResult['response_json'] = is_array($decoded) ? $decoded : ['_raw' => $res['response_text']];

    logLine($ACK_LOG_DIR, 'ack', sprintf(
        "ACK_SENT request_id=%s event_type=%s url=%s status=%s err=%s resp_size=%d",
        $requestId,
        $eventType,
        $ackUrl,
        (string)$res['http_status'],
        $res['curl_error'] ?: '-',
        strlen($res['response_text'])
    ));
}

//
// ---- Success Response ----
//
jsonOut(200, [
    'success' => true,
    'request_id' => $requestId,
    'event_type' => $eventType,
    'received_at' => $receivedAt,
    'environment' => $ENVIRONMENT,
    'signature' => [
        'present' => ($sigCheck['reason'] !== 'absent'),
        'verified' => $sigCheck['verified'],
        'reason' => $sigCheck['reason'],
        'required' => $REQUIRE_SIGNATURE,
    ],
    'database_logged' => $dbLogged,
    'ack' => $ackResult,
]);
