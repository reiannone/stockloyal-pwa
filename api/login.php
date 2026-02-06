<?php
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

require_once 'config.php'; // $conn (PDO)

function is_email(string $s): bool {
    return filter_var($s, FILTER_VALIDATE_EMAIL) !== false;
}

try {
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) $input = $_POST ?? [];

    $merchantId = trim((string)($input['merchant_id'] ?? ''));
    // Back-compat: accept member_id but prefer identifier
    $identifier = trim((string)($input['identifier'] ?? ($input['member_id'] ?? '')));
    $password   = (string)($input['password'] ?? '');

    if ($identifier === '') {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Username or Email is required"]);
        exit;
    }
    if ($password === '') {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Password is required"]);
        exit;
    }

    $identifierLower = mb_strtolower($identifier);
    $isEmail = is_email($identifier);

    // ✅ Pull merchant_name from merchant table (like get-wallet.php) and return broker + timezone
    if ($isEmail) {
        $stmt = $conn->prepare("
            SELECT
                w.member_id,
                w.member_email,
                w.member_password_hash,
                w.member_status,
                w.merchant_id,
                m.merchant_name,
                w.broker,
                w.member_timezone
            FROM wallet w
            LEFT JOIN merchant m
              ON w.merchant_id = m.merchant_id
            WHERE LOWER(w.member_email) = :identifier
              AND (:merchant_id = '' OR w.merchant_id = :merchant_id OR w.merchant_id IS NULL)
            LIMIT 1
        ");
        $stmt->execute([
            ":identifier" => $identifierLower,
            ":merchant_id" => $merchantId
        ]);
    } else {
        $stmt = $conn->prepare("
            SELECT
                w.member_id,
                w.member_email,
                w.member_password_hash,
                w.member_status,
                w.merchant_id,
                m.merchant_name,
                w.broker,
                w.member_timezone
            FROM wallet w
            LEFT JOIN merchant m
              ON w.merchant_id = m.merchant_id
            WHERE LOWER(w.member_id) = :identifier
              AND (:merchant_id = '' OR w.merchant_id = :merchant_id OR w.merchant_id IS NULL)
            LIMIT 1
        ");
        $stmt->execute([
            ":identifier" => $identifierLower,
            ":merchant_id" => $merchantId
        ]);
    }

    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(["success" => false, "error" => "No account found for this username/email"]);
        exit;
    }

    $hash = (string)($user['member_password_hash'] ?? '');
    if ($hash === '' || !password_verify($password, $hash)) {
        http_response_code(401);
        echo json_encode(["success" => false, "error" => "Invalid password"]);
        exit;
    }

    // ✅ Check member_status — reject blocked or closed accounts
    $memberStatus = strtolower(trim($user['member_status'] ?? 'active'));
    if ($memberStatus === 'blocked') {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Your account has been blocked. Please contact support."]);
        exit;
    }
    if ($memberStatus === 'closed') {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Your account has been closed. Please contact support."]);
        exit;
    }

    // Update last_login
    $update = $conn->prepare("UPDATE wallet SET last_login = NOW() WHERE member_id = :member_id");
    $update->execute([":member_id" => $user['member_id']]);

    http_response_code(200);
    echo json_encode([
        "success" => true,
        "member_id" => $user['member_id'],
        "member_email" => $user['member_email'] ?? null,
        "merchant_id" => $user['merchant_id'] ?? null,
        "merchant_name" => $user['merchant_name'] ?? null,
        "broker" => $user['broker'] ?? null,
        "member_timezone" => $user['member_timezone'] ?? null
    ]);
} catch (Exception $e) {
    error_log("login.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Server error: " . $e->getMessage()
    ]);
}
