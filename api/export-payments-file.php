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

    $broker = trim($input['broker'] ?? '');
    if ($broker === '') {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "broker is required for export",
        ]);
        exit;
    }

    // Only confirmed/executed, unpaid orders for this merchant & broker
    $sql = "
        SELECT
            o.*,
            bc.username AS broker_username,
            COALESCE(o.executed_amount, o.amount) AS payment_amount
        FROM stockloyal.orders o
        LEFT JOIN broker_credentials bc
            ON o.broker = bc.broker
           AND o.member_id = bc.member_id
        WHERE o.merchant_id = :merchant_id
          AND o.broker = :broker
          AND o.status IN ('confirmed','executed')
          AND o.paid_flag = 0
        ORDER BY o.order_id
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bindValue(':merchant_id', $merchant_id, PDO::PARAM_STR);
    $stmt->bindValue(':broker', $broker, PDO::PARAM_STR);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$rows) {
        echo json_encode([
            "success" => false,
            "error"   => "No unpaid confirmed/executed orders found for this merchant and broker.",
        ]);
        exit;
    }

    $exportDir = __DIR__ . "/exports";
    if (!is_dir($exportDir)) {
        if (!mkdir($exportDir, 0775, true) && !is_dir($exportDir)) {
            throw new RuntimeException("Failed to create export directory");
        }
    }

    $timestamp = date("Ymd_His");
    $safeBroker = preg_replace('/[^A-Za-z0-9]+/', '_', $broker);
    $filename  = "payments_{$merchant_id}_{$safeBroker}_{$timestamp}.csv";
    $filepath  = $exportDir . "/" . $filename;

    $fp = fopen($filepath, 'w');
    if ($fp === false) {
        throw new RuntimeException("Unable to open export file for writing");
    }

    // Header based on keys from first row
    $header = array_keys($rows[0]);
    fputcsv($fp, $header);

    foreach ($rows as $row) {
        $line = [];
        foreach ($header as $col) {
            $line[] = $row[$col];
        }
        fputcsv($fp, $line);
    }

    fclose($fp);

    echo json_encode([
        "success"       => true,
        "message"       => "Export file created",
        "filename"      => $filename,
        "relative_path" => "api/exports/" . $filename,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage(),
    ]);
}
