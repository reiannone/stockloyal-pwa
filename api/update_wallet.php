<?php
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/update_wallet.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

// ✅ Read JSON body
$input = json_decode(file_get_contents("php://input"), true);

// 🔹 Log full input for debugging
error_log("update_wallet.php: Received payload = " . json_encode($input));

if (!$input || !isset($input['member_id'])) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing member_id"
    ]);
    exit;
}

// ✅ Extract + lightly validate timezone (IANA-like)
// Allow letters, slash, underscore, hyphen. Keep it simple and safe.
$memberTimezone = $input['member_timezone'] ?? null;
if ($memberTimezone !== null) {
    $memberTimezone = trim($memberTimezone);
    if ($memberTimezone === "") {
        $memberTimezone = null; // treat empty as null
    } elseif (strlen($memberTimezone) > 64 || !preg_match('/^[A-Za-z_\/\-]+$/', $memberTimezone)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Invalid timezone format"
        ]);
        exit;
    }
}

try {
    $sql = "UPDATE wallet SET
                member_email = :member_email,
                first_name = :first_name,
                middle_name = :middle_name,
                last_name = :last_name,
                member_address_line1 = :member_address_line1,
                member_address_line2 = :member_address_line2,
                member_town_city = :member_town_city,
                member_state = :member_state,
                member_zip = :member_zip,
                member_country = :member_country,
                member_timezone = :member_timezone,
                updated_at = NOW()
            WHERE member_id = :member_id";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':member_email'         => $input['member_email'] ?? null,
        ':first_name'           => $input['first_name'] ?? null,
        ':middle_name'          => $input['middle_name'] ?? null,
        ':last_name'            => $input['last_name'] ?? null,
        ':member_address_line1' => $input['member_address_line1'] ?? null,
        ':member_address_line2' => $input['member_address_line2'] ?? null,
        ':member_town_city'     => $input['member_town_city'] ?? null,
        ':member_state'         => $input['member_state'] ?? null,
        ':member_zip'           => $input['member_zip'] ?? null,
        ':member_country'       => $input['member_country'] ?? null,
        ':member_timezone'      => $memberTimezone,
        ':member_id'            => $input['member_id'],
    ]);

    // 🔹 Log affected rows
    error_log("update_wallet.php: updated rows = " . $stmt->rowCount());

    echo json_encode([
        "success" => true,
        "updated" => $stmt->rowCount()
    ]);
} catch (Exception $e) {
    error_log("update_wallet.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error"
    ]);
}
