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
    // Get the notification
    $stmt = $conn->prepare("
        SELECT 
            mn.*,
            m.webhook_url,
            m.api_key,
            m.merchant_email
        FROM merchant_notifications mn
        LEFT JOIN merchant m ON mn.merchant_id = m.merchant_id
        WHERE mn.id = :id
    ");
    $stmt->execute([':id' => $id]);
    $notification = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$notification) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error" => "Notification not found"
        ]);
        exit;
    }

    // Parse payload
    $payload = json_decode($notification['payload'], true);
    if (!$payload) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error" => "Invalid payload JSON"
        ]);
        exit;
    }

    // Reset status to pending
    $updateStmt = $conn->prepare("
        UPDATE merchant_notifications 
        SET status = 'pending',
            error_message = NULL,
            response_code = NULL,
            response_body = NULL
        WHERE id = :id
    ");
    $updateStmt->execute([':id' => $id]);

    // Send webhook notification if URL exists
    $webhookSent = false;
    $webhookResponse = null;
    $httpCode = null;
    
    if (!empty($notification['webhook_url'])) {
        $webhookUrl = $notification['webhook_url'];
        
        // Prepare headers
        $headers = [
            'Content-Type: application/json',
            'User-Agent: StockLoyal/1.0'
        ];
        
        // Add API key if available
        if (!empty($notification['api_key'])) {
            $headers[] = 'X-API-Key: ' . $notification['api_key'];
        }
        
        // Send webhook
        $ch = curl_init($webhookUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        
        $webhookResponse = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);
        
        // Update notification status
        if ($httpCode >= 200 && $httpCode < 300) {
            $webhookSent = true;
            $statusUpdateStmt = $conn->prepare("
                UPDATE merchant_notifications 
                SET status = 'sent', 
                    sent_at = NOW(),
                    response_code = :response_code,
                    response_body = :response_body,
                    error_message = NULL
                WHERE id = :id
            ");
            $statusUpdateStmt->execute([
                ':response_code' => $httpCode,
                ':response_body' => substr($webhookResponse, 0, 1000),
                ':id' => $id
            ]);
        } else {
            $statusUpdateStmt = $conn->prepare("
                UPDATE merchant_notifications 
                SET status = 'failed',
                    response_code = :response_code,
                    error_message = :error_message
                WHERE id = :id
            ");
            $statusUpdateStmt->execute([
                ':response_code' => $httpCode,
                ':error_message' => $curlError ?: "HTTP $httpCode",
                ':id' => $id
            ]);
        }
    } else {
        // No webhook URL configured
        $statusUpdateStmt = $conn->prepare("
            UPDATE merchant_notifications 
            SET status = 'failed',
                error_message = 'No webhook URL configured for merchant'
            WHERE id = :id
        ");
        $statusUpdateStmt->execute([':id' => $id]);
    }

    echo json_encode([
        "success" => true,
        "message" => "Retry completed",
        "webhook_sent" => $webhookSent,
        "http_code" => $httpCode,
        "notification_id" => $id
    ]);

} catch (PDOException $e) {
    error_log("retry-merchant-notification.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Database error: " . $e->getMessage()
    ]);
}
