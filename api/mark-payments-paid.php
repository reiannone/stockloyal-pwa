<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

require_once __DIR__ . "/config.php"; // $conn = PDO

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode([
            "success" => false,
            "error"   => "Method not allowed",
        ]);
        exit;
    }

    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Invalid JSON payload",
        ]);
        exit;
    }

    $merchant_id = trim($input['merchant_id'] ?? '');
    if ($merchant_id === '') {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "merchant_id is required",
        ]);
        exit;
    }

    $paid_batch_id = trim($input['paid_batch_id'] ?? '');
    if ($paid_batch_id === '') {
        $timestamp    = date('Ymd_His');
        $paid_batch_id = "batch_{$merchant_id}_{$timestamp}";
    }

    // Update only:
    // - this merchant
    // - confirmed/executed orders
    // - currently unpaid (paid_flag = 0)
    $sql = "
        UPDATE stockloyal.orders o
        SET 
            o.paid_flag     = 1,
            o.paid_batch_id = :paid_batch_id,
            o.paid_at       = NOW()
        WHERE o.merchant_id = :merchant_id
          AND o.status IN ('confirmed','executed')
          AND o.paid_flag = 0
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bindValue(':merchant_id', $merchant_id, PDO::PARAM_STR);
    $stmt->bindValue(':paid_batch_id', $paid_batch_id, PDO::PARAM_STR);
    $stmt->execute();

    $affected = $stmt->rowCount();

    echo json_encode([
        "success"        => true,
        "message"        => "Orders marked as paid",
        "merchant_id"    => $merchant_id,
        "paid_batch_id"  => $paid_batch_id,
        "affected_rows"  => $affected,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage(),
    ]);
}
