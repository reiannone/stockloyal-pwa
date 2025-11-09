<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/earned_points.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // ✅ PDO + shared config

$input = json_decode(file_get_contents("php://input"), true);
$member_id     = $input['member_id']     ?? '';
$merchant_id   = $input['merchant_id']   ?? '';
$points        = intval($input['points'] ?? 0);
$cash_balance  = isset($input['cash_balance']) ? floatval($input['cash_balance']) : 0.00;

if (!$member_id || !$merchant_id || $points <= 0 || $cash_balance <= 0) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid input: member_id, merchant_id, points, and cash_balance are required."
    ]);
    exit;
}

try {
    // ✅ Use transaction to prevent race conditions
    $conn->beginTransaction();

    $stmt = $conn->prepare("
        SELECT record_id, points, cash_balance 
        FROM wallet 
        WHERE member_id = :member_id
        LIMIT 1
    ");
    $stmt->execute([":member_id" => $member_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        // 🟢 Update existing wallet
        $newPoints  = intval($row['points']) + $points;
        $newBalance = floatval($row['cash_balance']) + $cash_balance;

        $u = $conn->prepare("
            UPDATE wallet 
            SET points = :points, cash_balance = :cash_balance, updated_at = NOW()
            WHERE record_id = :rid
        ");
        $u->execute([
            ":points"       => $newPoints,
            ":cash_balance" => $newBalance,
            ":rid"          => $row['record_id']
        ]);

        $conn->commit();

        echo json_encode([
            "success"       => true,
            "existing"      => true,
            "member_id"     => $member_id,
            "merchant_id"   => $merchant_id,
            "points_added"  => $points,
            "points_total"  => $newPoints,
            "cash_balance"  => number_format($newBalance, 2, '.', '')
        ]);
    } else {
        // 🚀 New member → let frontend handle create
        $conn->commit();
        echo json_encode([
            "success"        => true,
            "existing"       => false,
            "member_id"      => $member_id,
            "merchant_id"    => $merchant_id,
            "points_pending" => $points,
            "cash_balance"   => number_format($cash_balance, 2, '.', '')
        ]);
    }
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Server error: " . $e->getMessage()
    ]);
}
