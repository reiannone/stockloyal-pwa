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
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    if (!is_array($input)) $input = [];

    $merchantId = trim((string)($input['merchant_id'] ?? ''));
    $identifier = trim((string)($input['identifier'] ?? ''));

    if ($identifier === '') {
        echo json_encode([
            "success" => true,
            "exists" => false,
            "has_password" => false
        ]);
        exit;
    }

    $identifierLower = mb_strtolower($identifier);
    $isEmail = is_email($identifier);

    if ($isEmail) {
        $stmt = $conn->prepare("
            SELECT member_id, member_email, member_password_hash
            FROM wallet
            WHERE LOWER(member_email) = :identifier
              AND (:merchant_id = '' OR merchant_id = :merchant_id OR merchant_id IS NULL)
            LIMIT 1
        ");
        $stmt->execute([
            ":identifier" => $identifierLower,
            ":merchant_id" => $merchantId
        ]);
    } else {
        $stmt = $conn->prepare("
            SELECT member_id, member_email, member_password_hash
            FROM wallet
            WHERE LOWER(member_id) = :identifier
              AND (:merchant_id = '' OR merchant_id = :merchant_id OR merchant_id IS NULL)
            LIMIT 1
        ");
        $stmt->execute([
            ":identifier" => $identifierLower,
            ":merchant_id" => $merchantId
        ]);
    }

    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        echo json_encode([
            "success" => true,
            "exists" => false,
            "has_password" => false,
            "is_email" => $isEmail
        ]);
        exit;
    }

    $hash = trim((string)($row['member_password_hash'] ?? ''));
    $hasPassword = ($hash !== '');

    echo json_encode([
        "success" => true,
        "exists" => true,
        "has_password" => $hasPassword,
        "is_email" => $isEmail,
        "member_id" => $row['member_id'],
        "member_email" => $row['member_email']
    ]);
} catch (Exception $e) {
    error_log("member_lookup.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Server error: " . $e->getMessage()
    ]);
}
