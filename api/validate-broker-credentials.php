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
require_once __DIR__ . '/config.php';

// ✅ Expect JSON
$input = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
$broker   = trim((string)($input['broker'] ?? ''));
$username = trim((string)($input['username'] ?? ''));
$password = (string)($input['password'] ?? '');
$email    = trim((string)($input['email'] ?? ''));

// For Alpaca: only need member_id, broker, and email
// For others: need member_id, broker, username, password
if (!$memberId || !$broker) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing required fields: member_id, broker"
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
        echo json_encode([
            "success"    => true,
            "validated"  => false,
            "locked"     => true,
            "fail_count" => $currentFailCount,
            "message"    => "Your account has been locked due to too many failed credential attempts. Please contact support.",
        ]);
        exit;
    }

    // ── Determine broker type ──
    $brokerStmt = $conn->prepare("
        SELECT broker_id, broker_name, api_key, broker_type
        FROM broker_master 
        WHERE broker_id = ? 
        LIMIT 1
    ");
    $brokerStmt->execute([$broker]);
    $brokerRow = $brokerStmt->fetch(PDO::FETCH_ASSOC);

    $brokerType = $brokerRow['broker_type'] ?? 'webhook'; // 'alpaca' or 'webhook'

    // ╔═══════════════════════════════════════════════════════╗
    // ║  ALPACA BROKER API VALIDATION                         ║
    // ╚═══════════════════════════════════════════════════════╝
    if ($brokerType === 'alpaca') {

        if (empty($email)) {
            http_response_code(400);
            echo json_encode([
                "success" => false,
                "error"   => "Email is required for Alpaca account lookup"
            ]);
            exit;
        }

        require_once __DIR__ . '/AlpacaBrokerAPI.php';
        $alpaca = new AlpacaBrokerAPI();

        // Search for existing Alpaca account by email
        $account = $alpaca->findAccountByEmail($email);

        if ($account) {
            // ✅ Account found — store the broker_account_id
            $brokerAccountId = $account['id'] ?? '';
            $brokerAccountNumber   = $account['account_number'] ?? '';
            $brokerAccountStatus   = $account['status'] ?? 'UNKNOWN';

            // Upsert broker_credentials with Alpaca account info
            if ($lockRow) {
                // Row exists — update it
                $updateStmt = $conn->prepare("
                    UPDATE broker_credentials
                    SET broker = :broker,
                        broker_account_id     = :broker_acct_id,
                        broker_account_number = :broker_acct_num,
                        broker_account_status = :broker_acct_status,
                        credential_fail_count = 0,
                        locked_at = NULL,
                        fail_reset_at = NOW()
                    WHERE member_id = :member_id
                ");
                $updateStmt->execute([
                    ':broker'        => $broker,
                    ':broker_acct_id'     => $brokerAccountId,
                    ':broker_acct_num' => $brokerAccountNumber,
                    ':broker_acct_status' => $brokerAccountStatus,
                    ':member_id'     => $memberId,
                ]);
            } else {
                // No row yet — insert
                $insertStmt = $conn->prepare("
                    INSERT INTO broker_credentials
                        (member_id, broker, username, encrypted_password, broker_account_id, broker_account_number, broker_account_status)
                    VALUES
                        (:member_id, :broker, :email, '', :broker_acct_id, :broker_acct_num, :broker_acct_status)
                ");
                $insertStmt->execute([
                    ':member_id'     => $memberId,
                    ':broker'        => $broker,
                    ':email'         => $email,
                    ':broker_acct_id'     => $brokerAccountId,
                    ':broker_acct_num' => $brokerAccountNumber,
                    ':broker_acct_status' => $brokerAccountStatus,
                ]);
            }

            // Also update wallet.broker
            $walletStmt = $conn->prepare("UPDATE wallet SET broker = :broker WHERE member_id = :member_id");
            $walletStmt->execute([':broker' => $broker, ':member_id' => $memberId]);

            echo json_encode([
                "success"            => true,
                "validated"          => true,
                "fail_count"         => 0,
                "broker_account_id"  => $brokerAccountId,
                "account_number"     => $brokerAccountNumber,
                "account_status"     => $brokerAccountStatus,
                "message"            => "Alpaca account found and linked successfully.",
            ]);
        } else {
            // ❌ No Alpaca account found — direct to onboarding
            echo json_encode([
                "success"         => true,
                "validated"       => false,
                "no_account"      => true,
                "fail_count"      => $currentFailCount, // Don't increment — not a credential failure
                "message"         => "No brokerage account found for this email. Please complete onboarding to open an account.",
                "redirect"        => "/onboard",
            ]);
        }
        exit;
    }

    // ╔═══════════════════════════════════════════════════════╗
    // ║  WEBHOOK-BASED VALIDATION (existing brokers)          ║
    // ╚═══════════════════════════════════════════════════════╝

    if (!$username || !$password) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Missing required fields: username, password"
        ]);
        exit;
    }

    $webhookUrl = 'https://api.stockloyal.com/api/broker-receiver.php';

    if (strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost') !== false) {
        $webhookUrl = 'http://localhost/api/broker-receiver.php';
    }

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

    if ($result['validated']) {
        $resetStmt = $conn->prepare("
            UPDATE broker_credentials
            SET credential_fail_count = 0, locked_at = NULL, fail_reset_at = NOW()
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
