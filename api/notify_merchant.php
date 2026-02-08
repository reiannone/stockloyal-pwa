<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(204); 
    exit; 
}

header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
$merchantId = $input['merchant_id'] ?? null;
$pointsRedeemed = $input['points_redeemed'] ?? null;
$cashValue = $input['cash_value'] ?? null;
$basketId = $input['basket_id'] ?? null;
$transactionType = $input['transaction_type'] ?? 'redeem';
$timestamp = $input['timestamp'] ?? date('Y-m-d H:i:s');

if (!$memberId || !$merchantId || $pointsRedeemed === null) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing required fields: member_id, merchant_id, points_redeemed"
    ]);
    exit;
}

try {
    // 1. Get merchant webhook/callback URL from merchant table
    $merchantStmt = $conn->prepare("
        SELECT 
            merchant_name,
            contact_email,
            webhook_url,
            api_key
        FROM merchant
        WHERE merchant_id = :merchant_id
    ");
    $merchantStmt->execute([':merchant_id' => $merchantId]);
    $merchant = $merchantStmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$merchant) {
        // Merchant not found, but don't fail the order
        error_log("notify_merchant.php: Merchant not found: $merchantId");
        echo json_encode([
            "success" => true,
            "message" => "Merchant not found, notification skipped",
            "notified" => false
        ]);
        exit;
    }
    
    // 2. Get member details for notification
    $memberStmt = $conn->prepare("
        SELECT 
            member_email,
            first_name,
            last_name,
            member_tier
        FROM wallet
        WHERE member_id = :member_id
    ");
    $memberStmt->execute([':member_id' => $memberId]);
    $member = $memberStmt->fetch(PDO::FETCH_ASSOC);
    
    // 3. Prepare notification payload
    $notificationPayload = [
        'event' => 'points_redeemed',
        'merchant_id' => $merchantId,
        'member_id' => $memberId,
        'member_email' => $member['member_email'] ?? null,
        'member_name' => trim(($member['first_name'] ?? '') . ' ' . ($member['last_name'] ?? '')),
        'member_tier' => $member['member_tier'] ?? null,
        'points_redeemed' => (int)$pointsRedeemed,
        'cash_value' => (float)$cashValue,
        'basket_id' => $basketId,
        'transaction_type' => $transactionType,
        'timestamp' => $timestamp
    ];
    
    // 4. Log notification attempt
    $logStmt = $conn->prepare("
        INSERT INTO merchant_notifications (
            merchant_id,
            member_id,
            event_type,
            points_amount,
            cash_amount,
            basket_id,
            payload,
            status,
            created_at
        ) VALUES (
            :merchant_id,
            :member_id,
            :event_type,
            :points_amount,
            :cash_amount,
            :basket_id,
            :payload,
            :status,
            NOW()
        )
    ");
    
    $logStmt->execute([
        ':merchant_id' => $merchantId,
        ':member_id' => $memberId,
        ':event_type' => 'points_redeemed',
        ':points_amount' => $pointsRedeemed,
        ':cash_amount' => $cashValue,
        ':basket_id' => $basketId,
        ':payload' => json_encode($notificationPayload),
        ':status' => 'pending'
    ]);
    
    $notificationId = $conn->lastInsertId();
    
    // 5. Send webhook notification if URL exists
    $webhookSent = false;
    $webhookResponse = null;
    
    if (!empty($merchant['webhook_url'])) {
        $webhookUrl = $merchant['webhook_url'];
        
        // Prepare headers
        $headers = [
            'Content-Type: application/json',
            'User-Agent: StockLoyal/1.0'
        ];
        
        // Add API key if available
        if (!empty($merchant['api_key'])) {
            $headers[] = 'X-API-Key: ' . $merchant['api_key'];
        }
        
        // Send webhook
        $ch = curl_init($webhookUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($notificationPayload));
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
            $updateStmt = $conn->prepare("
                UPDATE merchant_notifications 
                SET status = 'sent', 
                    sent_at = NOW(),
                    response_code = :response_code,
                    response_body = :response_body
                WHERE id = :id
            ");
            $updateStmt->execute([
                ':response_code' => $httpCode,
                ':response_body' => substr($webhookResponse, 0, 1000), // Limit to 1000 chars
                ':id' => $notificationId
            ]);
        } else {
            $updateStmt = $conn->prepare("
                UPDATE merchant_notifications 
                SET status = 'failed',
                    response_code = :response_code,
                    error_message = :error_message
                WHERE id = :id
            ");
            $updateStmt->execute([
                ':response_code' => $httpCode,
                ':error_message' => $curlError ?: "HTTP $httpCode",
                ':id' => $notificationId
            ]);
        }
    }
    
    // 6. Send email notification as fallback
    $emailSent = false;
    if (!empty($merchant['contact_email'])) {
        $emailSubject = "Points Redemption - Member {$memberId}";
        $emailBody = "A member has redeemed points:\n\n";
        $emailBody .= "Member ID: {$memberId}\n";
        $emailBody .= "Member Email: " . ($member['member_email'] ?? 'N/A') . "\n";
        $emailBody .= "Points Redeemed: " . number_format($pointsRedeemed) . "\n";
        $emailBody .= "Cash Value: $" . number_format($cashValue, 2) . "\n";
        $emailBody .= "Basket ID: {$basketId}\n";
        $emailBody .= "Timestamp: {$timestamp}\n";
        
        $emailHeaders = "From: noreply@stockloyal.com\r\n";
        $emailHeaders .= "Reply-To: support@stockloyal.com\r\n";
        
        $emailSent = @mail($merchant['contact_email'], $emailSubject, $emailBody, $emailHeaders);
    }
    
    echo json_encode([
        "success" => true,
        "message" => "Merchant notification processed",
        "notification_id" => $notificationId,
        "webhook_sent" => $webhookSent,
        "email_sent" => $emailSent,
        "notified" => $webhookSent || $emailSent
    ]);
    
} catch (PDOException $e) {
    error_log("notify_merchant.php error: " . $e->getMessage());
    
    // Don't fail the order, just log the error
    echo json_encode([
        "success" => true,
        "message" => "Notification failed but order succeeded",
        "error" => $e->getMessage(),
        "notified" => false
    ]);
}
