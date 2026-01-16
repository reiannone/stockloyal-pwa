<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$id = $input['id'] ?? null;

if (!$id) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing notification ID"
    ]);
    exit;
}

try {
    // Build UPDATE statement
    $updates = [];
    $params = [':id' => $id];

    if (isset($input['merchant_id'])) {
        $updates[] = "merchant_id = :merchant_id";
        $params[':merchant_id'] = $input['merchant_id'];
    }

    if (isset($input['member_id'])) {
        $updates[] = "member_id = :member_id";
        $params[':member_id'] = $input['member_id'];
    }

    if (isset($input['event_type'])) {
        $updates[] = "event_type = :event_type";
        $params[':event_type'] = $input['event_type'];
    }

    if (isset($input['points_amount'])) {
        $updates[] = "points_amount = :points_amount";
        $params[':points_amount'] = $input['points_amount'] === '' ? null : (int)$input['points_amount'];
    }

    if (isset($input['cash_amount'])) {
        $updates[] = "cash_amount = :cash_amount";
        $params[':cash_amount'] = $input['cash_amount'] === '' ? null : (float)$input['cash_amount'];
    }

    if (isset($input['basket_id'])) {
        $updates[] = "basket_id = :basket_id";
        $params[':basket_id'] = $input['basket_id'];
    }

    if (isset($input['status'])) {
        $updates[] = "status = :status";
        $params[':status'] = $input['status'];
    }

    if (isset($input['response_code'])) {
        $updates[] = "response_code = :response_code";
        $params[':response_code'] = $input['response_code'] === '' ? null : (int)$input['response_code'];
    }

    if (isset($input['response_body'])) {
        $updates[] = "response_body = :response_body";
        $params[':response_body'] = $input['response_body'];
    }

    if (isset($input['error_message'])) {
        $updates[] = "error_message = :error_message";
        $params[':error_message'] = $input['error_message'];
    }

    if (isset($input['payload'])) {
        $updates[] = "payload = :payload";
        // Handle both JSON string and array
        $params[':payload'] = is_string($input['payload']) 
            ? $input['payload'] 
            : json_encode($input['payload']);
    }

    if (empty($updates)) {
        echo json_encode([
            "success" => false,
            "error" => "No fields to update"
        ]);
        exit;
    }

    $sql = "UPDATE merchant_notifications SET " . implode(', ', $updates) . " WHERE id = :id";
    
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    echo json_encode([
        "success" => true,
        "message" => "Notification updated",
        "rows_affected" => $stmt->rowCount()
    ]);

} catch (PDOException $e) {
    error_log("save-merchant-notification.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Database error: " . $e->getMessage()
    ]);
}
