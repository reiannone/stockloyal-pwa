<?php
declare(strict_types=1);

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// api/get-brokers.php
// Fetch all broker_master records

try {
    $sql = "SELECT 
                broker_id,
                broker_name,
                broker_type,
                logo_url,
                website_url,
                ach_bank_name,
                ach_routing_num,
                ach_account_num,
                ach_account_type,
                address_line1,
                address_line2,
                address_city,
                address_state,
                address_zip,
                address_country,
                min_order_amount,
                max_order_amount,
                max_securities_per_order,
                default_order_type,
                support_phone,
                support_email,
                contact_name,
                webhook_url,
                api_key,
                broker_created_at,
                broker_modified_at,
                created_at,
                updated_at
            FROM broker_master
            ORDER BY broker_name ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $brokers = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "success" => true,
        "brokers" => $brokers,
    ], JSON_NUMERIC_CHECK);

} catch (Exception $e) {
    error_log("get-brokers.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage(),
    ]);
}
