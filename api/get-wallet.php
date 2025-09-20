<?php
// api/get-wallet.php

header("Access-Control-Allow-Origin: *");
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
    // 1. Fetch full wallet row (all columns)
    $stmt = $conn->prepare("
        SELECT *
        FROM wallet
        WHERE member_id = :member_id
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

    // ✅ Normalize numeric fields if they exist
    foreach (['points', 'cash_balance', 'portfolio_value', 'sweep_percentage'] as $col) {
        if (isset($wallet[$col])) {
            if (in_array($col, ['points', 'sweep_percentage'])) {
                $wallet[$col] = (int) $wallet[$col];
            } else {
                $wallet[$col] = (float) $wallet[$col];
            }
        }
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
