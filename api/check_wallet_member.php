<?php
// api/check_wallet_member.php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once 'config.php';

header("Content-Type: application/json; charset=utf-8");

$raw = @file_get_contents("php://input");
$input = json_decode($raw, true);
if (!is_array($input)) {
    $input = $_POST ?? [];
}

$merchant_id = trim($input['merchant_id'] ?? '');
$member_id   = strtolower(trim((string)($input['member_id'] ?? '')));  // treat as email-shaped id

if ($merchant_id === '' || $member_id === '') {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "merchant_id and member_id are required"
    ]);
    exit;
}

try {
    $stmt = $conn->prepare("
        SELECT *
        FROM wallet
        WHERE merchant_id = :merchant_id
          AND member_id   = :member_id
        LIMIT 1
    ");
    $stmt->execute([
        ':merchant_id' => $merchant_id,
        ':member_id'   => $member_id,
    ]);
    $wallet = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($wallet) {
        echo json_encode([
            "success" => true,
            "exists"  => true,
            "wallet"  => $wallet,
        ]);
    } else {
        echo json_encode([
            "success" => true,
            "exists"  => false,
        ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Server error: " . $e->getMessage(),
    ]);
}
