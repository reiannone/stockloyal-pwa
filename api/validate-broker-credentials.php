<?php
// api/validate-broker-credentials.php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once __DIR__ . '/config.php';

// ✅ Expect JSON
$input = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
$broker   = trim((string)($input['broker'] ?? ''));
$username = trim((string)($input['username'] ?? ''));
$password = (string)($input['password'] ?? '');

if (!$memberId || !$broker || !$username || !$password) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing required fields: member_id, broker, username, password"
    ]);
    exit;
}

try {
    // ── Check if member is already locked out ──
    $lockStmt = $conn->prepare("
        SELECT credential_fail_count, locked_at
        FROM broker_credentials
        WHERE member_id = :member_id
        LIMIT 1
    ");
    $lockStmt->execute([":member_id" => $memberId]);
    $lockRow = $lockStmt->fetch(PDO::FETCH_ASSOC);

    $currentFailCount = (int)($lockRow['credential_fail_count'] ?? 0);
    $maxFails = 10;

    if ($lockRow && $lockRow['locked_at'] !== null) {
        // Already locked
        echo json_encode([
            "success"    => true,
            "validated"  => false,
            "locked"     => true,
            "fail_count" => $currentFailCount,
            "message"    => "Your account has been locked due to too many failed credential attempts. Please contact support.",
        ]);
        exit;
    }

    // ── Call broker-receiver.php webhook internally ──
    $webhookUrl = 'https://api.stockloyal.com/api/broker-receiver.php';

    // In local/dev environment, use localhost
    if (strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost') !== false) {
        $webhookUrl = 'http://localhost/api/broker-receiver.php';
    }

    // Look up broker API key for authentication
    $brokerStmt = $conn->prepare("
        SELECT broker_id, broker_name, api_key 
        FROM broker_master 
        WHERE broker_id = ? 
        LIMIT 1
    ");
    $brokerStmt->execute([$broker]);
    $brokerRow = $brokerStmt->fetch(PDO::FETCH_ASSOC);

    $webhookPayload = json_encode([
        'event_type'  => 'credentials.validate',
        'member_id'   => $memberId,
        'broker'      => $broker,
        'broker_id'   => $brokerRow['broker_id'] ?? $broker,
        'broker_name' => $brokerRow['broker_name'] ?? $broker,
        'username'    => $username,
        'password'    => $password,
    ]);

    $headers = [
        'Content-Type: application/json',
        'X-Event-Type: credentials.validate',
    ];

    // Include broker API key if available
    if (!empty($brokerRow['api_key'])) {
        $headers[] = 'X-API-Key: ' . $brokerRow['api_key'];
    }

    $ch = curl_init($webhookUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $webhookPayload,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200 || $response === false) {
        error_log("validate-broker-credentials.php: Webhook failed HTTP {$httpCode}: {$curlError}");
        echo json_encode([
            "success"   => false,
            "validated" => false,
            "error"     => "Unable to reach broker for credential validation. Please try again.",
        ]);
        exit;
    }

    $result = json_decode($response, true);

    if (!$result || !isset($result['validated'])) {
        error_log("validate-broker-credentials.php: Invalid webhook response: {$response}");
        echo json_encode([
            "success"   => false,
            "validated" => false,
            "error"     => "Unexpected response from broker. Please try again.",
        ]);
        exit;
    }

    // ✅ Return the validation result to the frontend
    if ($result['validated']) {
        // ── Success: reset fail count ──
        $resetStmt = $conn->prepare("
            UPDATE broker_credentials
            SET credential_fail_count = 0,
                locked_at = NULL,
                fail_reset_at = NOW()
            WHERE member_id = :member_id
        ");
        $resetStmt->execute([":member_id" => $memberId]);

        echo json_encode([
            "success"    => true,
            "validated"  => true,
            "fail_count" => 0,
            "message"    => $result['message'] ?? 'Credentials verified.',
        ]);
    } else {
        // ── Failure: increment fail count ──
        $newFailCount = $currentFailCount + 1;
        $isNowLocked = ($newFailCount >= $maxFails);

        $incrStmt = $conn->prepare("
            UPDATE broker_credentials
            SET credential_fail_count = :fail_count,
                locked_at = " . ($isNowLocked ? "NOW()" : "NULL") . "
            WHERE member_id = :member_id
        ");
        $incrStmt->execute([
            ":fail_count" => $newFailCount,
            ":member_id"  => $memberId,
        ]);

        echo json_encode([
            "success"    => true,
            "validated"  => false,
            "locked"     => $isNowLocked,
            "fail_count" => $newFailCount,
            "message"    => $result['message'] ?? 'Credential verification failed.',
            "reason"     => $result['reason'] ?? null,
        ]);
    }

} catch (Exception $e) {
    error_log("validate-broker-credentials.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
