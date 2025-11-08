<?php
declare(strict_types=1);
require_once '/home/bitnami/stockloyal_bootstrap.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
// added above lines to support api.stockloyal.com for backend API access
// api/get_promotions.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once "config.php"; // defines $conn as PDO

error_log("get_promotions.php: REQUEST_METHOD = " . $_SERVER['REQUEST_METHOD']);
error_log("get_promotions.php: CONTENT_TYPE = " . ($_SERVER['CONTENT_TYPE'] ?? 'none'));
error_log("get_promotions.php: POST = " . print_r($_POST, true));


try {
    $input = json_decode(file_get_contents("php://input"), true);
    $merchantId = $input['merchant_id'] ?? '';

    // Debug logging
    error_log("get_promotions.php: merchantId = " . $merchantId);
    $raw = file_get_contents("php://input");
    error_log("get_promotions.php: raw input = " . $raw);
    $input = json_decode($raw, true);
    $merchantId = $input['merchant_id'] ?? '';
    error_log("get_promotions.php: merchantId = " . $merchantId);


    if (!$merchantId) {
        echo json_encode([
            "success" => false,
            "error"   => "No merchant_id provided"
        ]);
        exit;
    }

    $stmt = $conn->prepare("
        SELECT merchant_id, merchant_name, promotion_text
        FROM merchant
        WHERE merchant_id = ?
          AND promotion_active = 1
          AND active_status = 1
        LIMIT 1
    ");
    $stmt->execute([$merchantId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        echo json_encode([
            "success"    => true,
            "promotions" => [$row]
        ]);
    } else {
        echo json_encode([
            "success"    => true,
            "promotions" => []
        ]);
    }
} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage()
    ]);
}
