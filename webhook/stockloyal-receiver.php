<?php
declare(strict_types=1);

/**
 * stockloyal-receiver.php
 *
 * CORS-enabled webhook receiver for StockLoyal.
 * - Handles OPTIONS preflight (via cors.php)
 * - Validates API key (X-API-Key) or Bearer token (Authorization: Bearer ...)
 * - Optional HMAC signature verification (X-Signature: sha256=<hex>)
 * - Logs inbound webhook + ack attempt
 * - Basic idempotency (dedupe) by X-Request-Id
 * - Optional round-trip ACK to ack_url in payload
 *
 * Drop into:
 *   https://app.stockloyal.com/webhooks/stockloyal-receiver.php
 */

require_once __DIR__ . '/cors.php';      // must set headers + exit on OPTIONS
require_once __DIR__ . '/_loadenv.php';  // optional in your stack
require_once __DIR__ . '/config.php';    // optional in your stack

header('Content-Type: application/json');

//
// ---- Config (override via env if you want) ----
//
$WEBHOOK_SECRET = getenv('STOCKLOYAL_WEBHOOK_SECRET') ?: 'test_webhook_api_key_123456';

// Where to write logs (ensure folder is writable by web server user)
$LOG_DIR = __DIR__ . '/logs';
$RECEIVE_LOG = $LOG_DIR . '/stockloyal_receiver.log';
$ACK_LOG     = $LOG_DIR . '/stockloyal_receiver_ack.log';

// Simple dedupe store (file-based). For scale, replace with DB/Redis.
$DEDUPE_DIR = $LOG_DIR . '/dedupe';

//
// ---- Helpers ----
//
function ensureDir(string $dir): void {
  if (!is_dir($dir)) {
    @mkdir($dir, 0775, true);
  }
}

function headersLower(): array {
  $h = function_exists('getallheaders') ? getallheaders() : [];
  $out = [];
  foreach ($h as $k => $v) $out[strtolower((string)$k)] = (string)$v;
  return $out;
}

function hget(array $headers, string $name): string {
  return $headers[strtolower($name)] ?? '';
}

function jsonOut(int $code, array $payload): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
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

function logLine(string $file, string $line): void {
  file_put_contents($file, $line . "\n", FILE_APPEND);
}

function mask(string $s, int $keep = 4): string {
  if ($s === '') return '';
  $n = strlen($s);
  if ($n <= $keep) return str_repeat('*', $n);
  return str_repeat('*', max(0, $n - $keep)) . substr($s, -$keep);
}

/**
 * Auth: accept either
 * - X-API-Key: <secret>
 * - Authorization: Bearer <secret>
 */
function isAuthorized(array $headers, string $secret): bool {
  $xKey = hget($headers, 'X-API-Key');
  if ($xKey !== '' && hash_equals($secret, $xKey)) return true;

  $auth = hget($headers, 'Authorization');
  if ($auth !== '' && preg_match('/^\s*Bearer\s+(.+)\s*$/i', $auth, $m)) {
    $token = trim($m[1]);
    if ($token !== '' && hash_equals($secret, $token)) return true;
  }
  return false;
}

/**
 * Signature header format: "sha256=<hex>"
 * If present, verify against raw JSON bytes (exact string received).
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
 * File-based idempotency:
 * - create a marker file for request_id
 * - if exists, treat as duplicate
 */
function isDuplicateRequest(string $dedupeDir, string $requestId): bool {
  if ($requestId === '') return false;
  $key = preg_replace('/[^a-zA-Z0-9_\-:.]/', '_', $requestId);
  $path = rtrim($dedupeDir, '/') . '/' . $key . '.seen';
  if (file_exists($path)) return true;
  @file_put_contents($path, nowUtcIso());
  return false;
}

/**
 * POST JSON back to ack_url (server-to-server; no CORS needed)
 */
function postJson(string $url, array $payload, array $headers, int $timeoutSec = 10): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES),
    CURLOPT_TIMEOUT => $timeoutSec,
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
// ---- Ensure dirs exist ----
//
ensureDir($LOG_DIR);
ensureDir($DEDUPE_DIR);

//
// ---- Read request ----
//
$headers = headersLower();
$raw = file_get_contents('php://input') ?: '';
$payload = safeJsonDecode($raw);

$eventType = hget($headers, 'X-Event-Type');
if ($eventType === '') $eventType = (string)($payload['event_type'] ?? $payload['event'] ?? 'unknown');

$requestId = hget($headers, 'X-Request-Id');
if ($requestId === '') $requestId = (string)($payload['request_id'] ?? $payload['event_id'] ?? ('req_' . bin2hex(random_bytes(8))));

$receivedAt = nowUtcIso();

//
// ---- Auth ----
//
if (!isAuthorized($headers, $WEBHOOK_SECRET)) {
  logLine($RECEIVE_LOG, sprintf(
    "[%s] UNAUTHORIZED request_id=%s event_type=%s origin=%s api_key=%s",
    date('Y-m-d H:i:s'),
    $requestId,
    $eventType,
    $headers['origin'] ?? '',
    mask(hget($headers, 'X-API-Key'))
  ));
  jsonOut(401, ['success' => false, 'error' => 'Unauthorized']);
}

//
// ---- Optional signature verification ----
//
$sigCheck = verifySignatureIfPresent($headers, $raw, $WEBHOOK_SECRET);
// If you want to REQUIRE signatures in production, flip this to:
// if ($sigCheck['reason'] !== 'absent' && !$sigCheck['verified']) { ... }
// For now, we accept missing signature but reject mismatched signature when provided.
if ($sigCheck['reason'] !== 'absent' && !$sigCheck['verified']) {
  logLine($RECEIVE_LOG, sprintf(
    "[%s] BAD_SIGNATURE request_id=%s event_type=%s reason=%s",
    date('Y-m-d H:i:s'),
    $requestId,
    $eventType,
    $sigCheck['reason']
  ));
  jsonOut(401, ['success' => false, 'error' => 'Invalid signature', 'reason' => $sigCheck['reason']]);
}

//
// ---- Idempotency ----
//
if (isDuplicateRequest($DEDUPE_DIR, $requestId)) {
  logLine($RECEIVE_LOG, sprintf(
    "[%s] DUPLICATE request_id=%s event_type=%s",
    date('Y-m-d H:i:s'),
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
// ---- Log inbound ----
//
logLine($RECEIVE_LOG, sprintf(
  "[%s] RECEIVED request_id=%s event_type=%s sig=%s origin=%s payload=%s",
  date('Y-m-d H:i:s'),
  $requestId,
  $eventType,
  $sigCheck['reason'] === 'absent' ? 'absent' : ($sigCheck['verified'] ? 'verified' : 'bad'),
  $headers['origin'] ?? '',
  $raw !== '' ? $raw : '{}'
));

//
// ---- Optional round-trip ACK ----
//
$ackUrl = '';
if (isset($payload['ack_url']) && is_string($payload['ack_url'])) $ackUrl = trim($payload['ack_url']);
if ($ackUrl === '' && isset($payload['callback_url']) && is_string($payload['callback_url'])) $ackUrl = trim($payload['callback_url']);

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
  ];

  // Add signature on ACK too (nice for symmetry)
  $ackSig = hash_hmac('sha256', json_encode($ackPayload, JSON_UNESCAPED_SLASHES), $WEBHOOK_SECRET);

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

  logLine($ACK_LOG, sprintf(
    "[%s] ACK request_id=%s event_type=%s url=%s status=%s err=%s resp=%s",
    date('Y-m-d H:i:s'),
    $requestId,
    $eventType,
    $ackUrl,
    (string)$res['http_status'],
    $res['curl_error'] ?: '-',
    $res['response_text'] ?: ''
  ));
}

//
// ---- Response ----
//
jsonOut(200, [
  'success' => true,
  'request_id' => $requestId,
  'event_type' => $eventType,
  'received_at' => $receivedAt,
  'signature' => [
    'present' => ($sigCheck['reason'] !== 'absent'),
    'verified' => $sigCheck['verified'],
    'reason' => $sigCheck['reason'],
  ],
  'ack' => $ackResult,
]);
