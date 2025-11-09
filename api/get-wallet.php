<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get-wallet.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

// ✅ Expect JSON POST body
$input = json_decode(file_get_contents("php://input"), true);
$memberId = $input['member_id'] ?? null;

if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing member_id"
    ]);
    exit;
}

try {
    // 1. Fetch wallet + merchant conversion rate
    $stmt = $conn->prepare("
        SELECT 
            w.*,
            m.merchant_name,
            m.conversion_rate
        FROM wallet w
        LEFT JOIN merchant m ON w.merchant_id = m.merchant_id
        WHERE w.member_id = :member_id
        LIMIT 1
    ");
    $stmt->execute([":member_id" => $memberId]);
    $wallet = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$wallet) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error"   => "Wallet not found"
        ]);
        exit;
    }

    // ✅ Normalize numeric fields
    foreach (['points', 'cash_balance', 'portfolio_value', 'sweep_percentage', 'conversion_rate'] as $col) {
        if (isset($wallet[$col])) {
            if ($col === 'points' || $col === 'sweep_percentage') {
                $wallet[$col] = (int) $wallet[$col];
            } else {
                $wallet[$col] = (float) $wallet[$col];
            }
        }
    }

    // ✅ Lightly normalize timezone field (leave null if not set)
    if (array_key_exists('member_timezone', $wallet)) {
        $tz = $wallet['member_timezone'];
        if ($tz !== null) {
            $tz = trim((string)$tz);
            // Allow letters, slash, underscore, hyphen; cap at 64 chars (matches DB column)
            if ($tz === '' || strlen($tz) > 64 || !preg_match('/^[A-Za-z_\/\-]+$/', $tz)) {
                $tz = null;
            }
        }
        $wallet['member_timezone'] = $tz;
    } else {
        // Column not present in schema yet — keep explicit null for the client
        $wallet['member_timezone'] = null;
    }

    // 2. Fetch broker_credentials info
    $stmt2 = $conn->prepare("
        SELECT *
        FROM broker_credentials
        WHERE member_id = :member_id
        LIMIT 1
    ");
    $stmt2->execute([":member_id" => $memberId]);
    $brokerCreds = $stmt2->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        "success"             => true,
        "wallet"              => $wallet,
        "broker_credentials"  => $brokerCreds
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
