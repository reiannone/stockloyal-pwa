<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/update_balances.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    http_response_code(204);
    exit;
}

require_once 'config.php'; // expects $conn (PDO)

error_log("Start update_balances.php");

// Accept JSON body
$raw = @file_get_contents("php://input");
$input = json_decode($raw, true);
if (!is_array($input)) {
    $input = $_POST ?? [];
}

$member_id      = trim($input['member_id'] ?? '');
$points         = isset($input['points']) ? intval($input['points']) : null;
$cash_balance   = isset($input['cash_balance']) ? floatval($input['cash_balance']) : null;
$portfolio_value = isset($input['portfolio_value']) ? floatval($input['portfolio_value']) : 0;

error_log("update_balances.php input: member_id={$member_id}, points=" . var_export($points, true) . ", cash_balance=" . var_export($cash_balance, true) . ", portfolio_value=" . var_export($portfolio_value, true));

// Validate required fields
if ($member_id === '' || $points === null || $cash_balance === null || $portfolio_value === null) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid input: member_id, points, cash_balance and portfolio_value are required."
    ]);
    exit;
}

try {
    // Start transaction
    $conn->beginTransaction();

    // Try updating existing wallet row
    $stmt = $conn->prepare("
        UPDATE wallet
        SET points = :points,
            cash_balance = :cash_balance,
            portfolio_value = :portfolio_value,
            updated_at = NOW()
        WHERE member_id = :member_id
    ");
    $stmt->execute([
        ':points' => $points,
        ':cash_balance' => $cash_balance,
        ':portfolio_value' => $portfolio_value,
        ':member_id' => $member_id
    ]);

    if ($stmt->rowCount() === 0) {
        // No row updated — insert a new wallet record (dev-friendly)
        $stmtIns = $conn->prepare("
            INSERT INTO wallet (member_id, points, cash_balance, portfolio_value, created_at, updated_at)
            VALUES (:member_id, :points, :cash_balance, :portfolio_value, NOW(), NOW())
        ");
        $stmtIns->execute([
            ':member_id' => $member_id,
            ':points' => $points,
            ':cash_balance' => $cash_balance,
            ':portfolio_value' => $portfolio_value
        ]);
    }

    // Fetch updated wallet row
    $stmt2 = $conn->prepare("SELECT * FROM wallet WHERE member_id = :member_id LIMIT 1");
    $stmt2->execute([':member_id' => $member_id]);
    $wallet = $stmt2->fetch(PDO::FETCH_ASSOC);

    $conn->commit();

    if (!$wallet) {
        // This should not happen, but handle gracefully
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "message" => "Failed to fetch updated wallet"
        ]);
        exit;
    }

    // Normalize numeric fields
    foreach (['points', 'cash_balance', 'portfolio_value', 'sweep_percentage'] as $col) {
        if (isset($wallet[$col])) {
            if (in_array($col, ['points', 'sweep_percentage'])) {
                $wallet[$col] = (int)$wallet[$col];
            } else {
                $wallet[$col] = (float)$wallet[$col];
            }
        }
    }

    echo json_encode([
        "success" => true,
        "wallet"  => $wallet
    ]);
    exit;
} catch (Exception $e) {
    if ($conn && $conn->inTransaction()) {
        $conn->rollBack();
    }
    error_log("update_balances.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Server error: " . $e->getMessage()
    ]);
    exit;
}
