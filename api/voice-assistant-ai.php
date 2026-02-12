<?php
// api/voice-assistant-ai.php
// ═══════════════════════════════════════════════════════════════════════════════
// Proxy for Claude API — keeps the Anthropic API key server-side.
// The VoiceAssistant frontend sends conversation + member context here,
// and this endpoint forwards it to Claude and returns the response.
// ═══════════════════════════════════════════════════════════════════════════════
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

// ── Your Anthropic API key (keep this secret!) ──────────────────────────────
// Option A: Set as environment variable (recommended)
//   export ANTHROPIC_API_KEY=sk-ant-...
// Option B: Hardcode here (quick-start, less secure)
$apiKey = getenv('ANTHROPIC_API_KEY') ?: 'YOUR_API_KEY_HERE';

if ($apiKey === 'YOUR_API_KEY_HERE') {
    echo json_encode([
        "success" => false,
        "error"   => "Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable or edit voice-assistant-ai.php.",
    ]);
    exit;
}

// ── Read request ────────────────────────────────────────────────────────────
$input = json_decode(file_get_contents("php://input"), true);

if (!$input || !isset($input['system']) || !isset($input['messages'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Missing system or messages"]);
    exit;
}

$system   = $input['system'];
$messages = $input['messages'];

// ── Call Claude API ─────────────────────────────────────────────────────────
$payload = json_encode([
    "model"      => "claude-sonnet-4-20250514",
    "max_tokens" => 300,
    "system"     => $system,
    "messages"   => array_slice($messages, -10), // Last 10 turns
]);

$ch = curl_init("https://api.anthropic.com/v1/messages");
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_HTTPHEADER     => [
        "Content-Type: application/json",
        "x-api-key: $apiKey",
        "anthropic-version: 2023-06-01",
    ],
]);

$response   = curl_exec($ch);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(["success" => false, "error" => "API request failed: $curlError"]);
    exit;
}

if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo json_encode([
        "success"   => false,
        "error"     => "Claude API returned HTTP $httpCode",
        "details"   => json_decode($response, true),
    ]);
    exit;
}

$data = json_decode($response, true);

// Extract text from response
$text = "";
if (isset($data['content']) && is_array($data['content'])) {
    foreach ($data['content'] as $block) {
        if (isset($block['type']) && $block['type'] === 'text') {
            $text .= $block['text'];
        }
    }
}

echo json_encode([
    "success" => true,
    "reply"   => trim($text),
]);
