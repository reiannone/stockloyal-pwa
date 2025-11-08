<?php
require_once __DIR__ . '/cors.php';
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/deduct_points.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // ✅ shared PDO connection + encryption

$input = json_decode(file_get_contents("php://input"), true);
$memberId     = trim($input['member_id'] ?? '');
$pointsUsed   = intval($input['points'] ?? 0);
$cashUsed     = floatval($input['cash_balance'] ?? 0.00);

if (!$memberId || ($pointsUsed <= 0 && $cashUsed <= 0)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Invalid input — member_id and deduction values required"
    ]);
    exit;
}

try {
    // 🔎 Fetch current wallet
    $stmt = $conn->prepare("
        SELECT record_id, points, cash_balance
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
            "error"   => "Wallet not found for member_id=$memberId"
        ]);
        exit;
    }

    $currentPoints = intval($wallet['points']);
    $currentCash   = floatval($wallet['cash_balance']);

    // ✅ Deduct, but never go negative
    $newPoints = max($currentPoints - $pointsUsed, 0);
    $newCash   = max($currentCash - $cashUsed, 0.00);

    $update = $conn->prepare("
        UPDATE wallet
        SET points = :points,
            cash_balance = :cash_balance,
            updated_at = NOW()
        WHERE record_id = :rid
    ");
    $update->execute([
        ":points"       => $newPoints,
        ":cash_balance" => $newCash,
        ":rid"          => $wallet['record_id']
    ]);

    echo json_encode([
        "success"       => true,
        "member_id"     => $memberId,
        "points_deducted" => $pointsUsed,
        "cash_deducted"   => $cashUsed,
        "points_total"    => $newPoints,
        "cash_balance"    => number_format($newCash, 2, '.', '')
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
