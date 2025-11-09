<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';

require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/broker_confirm.php

// header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // ✅ loads $conn (PDO)

try {
    // 1) Update ALL pending/placed orders → confirmed + executed_at timestamp
    $stmt = $conn->prepare("
        UPDATE orders
        SET status = 'confirmed',
            executed_at = NOW()
        WHERE status IN ('pending','placed')
    ");
    $stmt->execute();
    $updatedRows = $stmt->rowCount();

    // 2) Recalculate portfolio_value for each member
    $stmt2 = $conn->query("
        SELECT member_id, COALESCE(SUM(amount), 0) AS total
        FROM orders
        WHERE status = 'confirmed'
        GROUP BY member_id
    ");
    $rows = $stmt2->fetchAll(PDO::FETCH_ASSOC);

    // 3) Update each wallet with recalculated portfolio_value
    $stmt3 = $conn->prepare("
        UPDATE wallet
        SET portfolio_value = :portfolio_value,
            updated_at = NOW()
        WHERE member_id = :member_id
    ");

    foreach ($rows as $row) {
        $stmt3->execute([
            ":portfolio_value" => $row['total'],
            ":member_id"       => $row['member_id']
        ]);
    }

    // 4) Return JSON response
    echo json_encode([
        "success"         => true,
        "updated_orders"  => $updatedRows,
        "updated_wallets" => count($rows),
        "timestamp"       => date("Y-m-d H:i:s")
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
