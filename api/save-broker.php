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

// api/save-broker.php
// Insert or update broker_master record by broker_id

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode([
            "success" => false,
            "error"   => "Method not allowed",
        ]);
        exit;
    }

    $raw = file_get_contents("php://input");
    $input = json_decode($raw, true);

    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "Invalid JSON payload",
        ]);
        exit;
    }

    $broker_id   = trim($input['broker_id']   ?? '');
    $broker_name = trim($input['broker_name'] ?? '');

    if ($broker_id === '' || $broker_name === '') {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error"   => "broker_id and broker_name are required",
        ]);
        exit;
    }

    // Optional fields (use null if missing)
    $ach_bank_name    = $input['ach_bank_name']    ?? null;
    $ach_routing_num  = $input['ach_routing_num']  ?? null;
    $ach_account_num  = $input['ach_account_num']  ?? null;
    $ach_account_type = $input['ach_account_type'] ?? 'checking';

    $address_line1   = $input['address_line1']   ?? null;
    $address_line2   = $input['address_line2']   ?? null;
    $address_city    = $input['address_city']    ?? null;
    $address_state   = $input['address_state']   ?? null;
    $address_zip     = $input['address_zip']     ?? null;
    $address_country = $input['address_country'] ?? 'USA';

    $min_order_amount         = $input['min_order_amount']         ?? null;
    $max_order_amount         = $input['max_order_amount']         ?? null;
    $max_securities_per_order = $input['max_securities_per_order'] ?? null;
    $default_order_type       = $input['default_order_type']       ?? 'market';

    $support_phone = $input['support_phone'] ?? null;
    $support_email = $input['support_email'] ?? null;
    $contact_name  = $input['contact_name']  ?? null;

    // ✅ NEW: webhook configuration
    $webhook_url = $input['webhook_url'] ?? null;
    $api_key     = $input['api_key']     ?? null;

    // ✅ NEW: logo URL
    $logo_url    = $input['logo_url']    ?? null;

    // Normalize empty strings to NULL so DB stays clean
    $webhook_url = (is_string($webhook_url) && trim($webhook_url) === '') ? null : $webhook_url;
    $api_key     = (is_string($api_key)     && trim($api_key) === '')     ? null : $api_key;
    $logo_url    = (is_string($logo_url)    && trim($logo_url) === '')    ? null : $logo_url;

    // Insert or update
    $sql = "
        INSERT INTO broker_master (
            broker_id,
            broker_name,
            logo_url,
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
            broker_modified_at
        )
        VALUES (
            :broker_id,
            :broker_name,
            :logo_url,
            :ach_bank_name,
            :ach_routing_num,
            :ach_account_num,
            :ach_account_type,
            :address_line1,
            :address_line2,
            :address_city,
            :address_state,
            :address_zip,
            :address_country,
            :min_order_amount,
            :max_order_amount,
            :max_securities_per_order,
            :default_order_type,
            :support_phone,
            :support_email,
            :contact_name,
            :webhook_url,
            :api_key,
            NOW(),
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            broker_name              = VALUES(broker_name),
            logo_url                 = VALUES(logo_url),
            ach_bank_name            = VALUES(ach_bank_name),
            ach_routing_num          = VALUES(ach_routing_num),
            ach_account_num          = VALUES(ach_account_num),
            ach_account_type         = VALUES(ach_account_type),
            address_line1            = VALUES(address_line1),
            address_line2            = VALUES(address_line2),
            address_city             = VALUES(address_city),
            address_state            = VALUES(address_state),
            address_zip              = VALUES(address_zip),
            address_country          = VALUES(address_country),
            min_order_amount         = VALUES(min_order_amount),
            max_order_amount         = VALUES(max_order_amount),
            max_securities_per_order = VALUES(max_securities_per_order),
            default_order_type       = VALUES(default_order_type),
            support_phone            = VALUES(support_phone),
            support_email            = VALUES(support_email),
            contact_name             = VALUES(contact_name),
            webhook_url              = VALUES(webhook_url),
            api_key                  = VALUES(api_key),
            broker_modified_at       = NOW()
    ";

    $stmt = $conn->prepare($sql);

    $stmt->bindValue(':broker_id',   $broker_id,   PDO::PARAM_STR);
    $stmt->bindValue(':broker_name', $broker_name, PDO::PARAM_STR);
    $stmt->bindValue(':logo_url',    $logo_url);

    $stmt->bindValue(':ach_bank_name',    $ach_bank_name);
    $stmt->bindValue(':ach_routing_num',  $ach_routing_num);
    $stmt->bindValue(':ach_account_num',  $ach_account_num);
    $stmt->bindValue(':ach_account_type', $ach_account_type);

    $stmt->bindValue(':address_line1',   $address_line1);
    $stmt->bindValue(':address_line2',   $address_line2);
    $stmt->bindValue(':address_city',    $address_city);
    $stmt->bindValue(':address_state',   $address_state);
    $stmt->bindValue(':address_zip',     $address_zip);
    $stmt->bindValue(':address_country', $address_country);

    $stmt->bindValue(':min_order_amount',         $min_order_amount);
    $stmt->bindValue(':max_order_amount',         $max_order_amount);
    $stmt->bindValue(':max_securities_per_order', $max_securities_per_order);
    $stmt->bindValue(':default_order_type',       $default_order_type);

    $stmt->bindValue(':support_phone', $support_phone);
    $stmt->bindValue(':support_email', $support_email);
    $stmt->bindValue(':contact_name',  $contact_name);

    // ✅ NEW binds
    $stmt->bindValue(':webhook_url', $webhook_url);
    $stmt->bindValue(':api_key',     $api_key);

    $stmt->execute();

    echo json_encode([
        "success"   => true,
        "message"   => "Broker saved",
        "broker_id" => $broker_id,
    ]);

} catch (Exception $e) {
    error_log("save-broker.php ERROR: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error",
        "details" => $e->getMessage(),
    ]);
}
