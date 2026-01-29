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

// Get input
$input = json_decode(file_get_contents("php://input"), true);
$memberId = $input['member_id'] ?? null;

if (!$memberId) {
    echo json_encode(["success" => false, "error" => "member_id required"]);
    exit;
}

/**
 * Send email via AWS SES SMTP
 */
function sendViaSES(string $to, string $subject, string $body, string $fromName = 'StockLoyal', string $fromEmail = 'noreply@stockloyal.com'): bool {
    // AWS SES SMTP Configuration
    $smtpHost = 'email-smtp.us-east-2.amazonaws.com';
    $smtpPort = 587;
    $smtpUser = 'AKIAXJRZMKPYZOTO2DHA';
    $smtpPass = 'BBFBFD2WxeuQWmPvsBBwjmEtcw+FS2Ku88OrnqCHuC6w';
    
    try {
        // Connect to SMTP server
        $socket = fsockopen($smtpHost, $smtpPort, $errno, $errstr, 30);
        if (!$socket) {
            error_log("[SES] Connection failed: $errstr ($errno)");
            return false;
        }
        
        // Helper function to send command and get response
        $sendCmd = function($cmd, $expectedCode = null) use ($socket) {
            if ($cmd) {
                fwrite($socket, $cmd . "\r\n");
            }
            $response = '';
            while ($line = fgets($socket, 515)) {
                $response .= $line;
                if (substr($line, 3, 1) == ' ') break;
            }
            if ($expectedCode && strpos($response, (string)$expectedCode) !== 0) {
                error_log("[SES] Unexpected response: $response");
                return false;
            }
            return $response;
        };
        
        // SMTP handshake
        $sendCmd(null, 220);
        $sendCmd("EHLO stockloyal.com", 250);
        $sendCmd("STARTTLS", 220);
        
        // Enable TLS
        stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        
        // Re-introduce after TLS
        $sendCmd("EHLO stockloyal.com", 250);
        
        // Authenticate
        $sendCmd("AUTH LOGIN", 334);
        $sendCmd(base64_encode($smtpUser), 334);
        $sendCmd(base64_encode($smtpPass), 235);
        
        // Send email
        $sendCmd("MAIL FROM:<$fromEmail>", 250);
        $sendCmd("RCPT TO:<$to>", 250);
        $sendCmd("DATA", 354);
        
        // Build message
        $message = "From: $fromName <$fromEmail>\r\n";
        $message .= "To: $to\r\n";
        $message .= "Subject: $subject\r\n";
        $message .= "MIME-Version: 1.0\r\n";
        $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $message .= "Reply-To: support@stockloyal.com\r\n";
        $message .= "\r\n";
        $message .= $body;
        $message .= "\r\n.";
        
        $sendCmd($message, 250);
        $sendCmd("QUIT", 221);
        
        fclose($socket);
        return true;
        
    } catch (Exception $e) {
        error_log("[SES] Exception: " . $e->getMessage());
        return false;
    }
}

/**
 * Send order confirmation email to member
 */
function sendOrderConfirmationEmail(PDO $conn, string $memberId, array $orders): bool {
    // Get member email from wallet table
    $stmt = $conn->prepare("SELECT member_email, first_name FROM wallet WHERE member_id = :member_id LIMIT 1");
    $stmt->execute([':member_id' => $memberId]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$member || empty($member['member_email'])) {
        error_log("[broker_confirm] No email found for member: $memberId");
        return false;
    }
    
    $email = $member['member_email'];
    $firstName = $member['first_name'] ?: 'Valued Member';
    
    // Build order details for email
    $orderDetails = "";
    $totalValue = 0;
    
    foreach ($orders as $order) {
        $symbol = $order['symbol'] ?? 'N/A';
        $amount = number_format((float)($order['amount'] ?? 0), 2);
        $shares = $order['shares'] ?? null;
        $totalValue += (float)($order['amount'] ?? 0);
        
        $orderDetails .= "• $symbol - \$$amount";
        if ($shares) {
            $orderDetails .= " ({$shares} shares)";
        }
        $orderDetails .= "\n";
    }
    
    $totalFormatted = number_format($totalValue, 2);
    $orderCount = count($orders);
    $orderWord = $orderCount === 1 ? 'order' : 'orders';
    
    // Email subject
    $subject = "Your StockLoyal Investment Order Has Been Confirmed";
    
    // Email body (plain text)
    $body = "Hi $firstName,\n\n";
    $body .= "Great news! Your investment $orderWord with StockLoyal have been confirmed and executed.\n\n";
    $body .= "ORDER CONFIRMATION\n";
    $body .= str_repeat("-", 40) . "\n";
    $body .= $orderDetails;
    $body .= str_repeat("-", 40) . "\n";
    $body .= "Total Investment: \$$totalFormatted\n\n";
    $body .= "Your portfolio has been updated to reflect these purchases. ";
    $body .= "You can view your holdings anytime in the StockLoyal app.\n\n";
    $body .= "Thank you for investing with StockLoyal!\n\n";
    $body .= "— The StockLoyal Team\n\n";
    $body .= "---\n";
    $body .= "This is an automated message. Please do not reply directly to this email.\n";
    
    // Send via AWS SES
    $sent = sendViaSES($email, $subject, $body);
    
    if ($sent) {
        error_log("[broker_confirm] Confirmation email sent to $email for member $memberId ($orderCount $orderWord)");
    } else {
        error_log("[broker_confirm] Failed to send email to $email for member $memberId");
    }
    
    return $sent;
}

try {
    // 1) FIRST: Get all pending/placed orders for THIS MEMBER (for email notifications)
    // Note: status enum has both 'pending' and 'Pending', so check both
    $stmtPending = $conn->prepare("
        SELECT order_id, member_id, symbol, amount, shares, points_used
        FROM orders
        WHERE member_id = :member_id
          AND LOWER(status) IN ('pending', 'placed')
    ");
    $stmtPending->execute([':member_id' => $memberId]);
    $pendingOrders = $stmtPending->fetchAll(PDO::FETCH_ASSOC);
    
    // Group orders by member_id for email notifications
    $ordersByMember = [];
    foreach ($pendingOrders as $order) {
        $mid = $order['member_id'];
        if (!isset($ordersByMember[$mid])) {
            $ordersByMember[$mid] = [];
        }
        $ordersByMember[$mid][] = $order;
    }

    // 2) Update pending/placed orders for THIS MEMBER → confirmed + executed_at timestamp
    $stmt = $conn->prepare("
        UPDATE orders
        SET status = 'confirmed',
            executed_at = NOW()
        WHERE member_id = :member_id
          AND LOWER(status) IN ('pending', 'placed')
    ");
    $stmt->execute([':member_id' => $memberId]);
    $updatedRows = $stmt->rowCount();

    // 3) Recalculate portfolio_value for THIS member
    $stmt2 = $conn->prepare("
        SELECT member_id, COALESCE(SUM(amount), 0) AS total
        FROM orders
        WHERE member_id = :member_id
          AND status = 'confirmed'
        GROUP BY member_id
    ");
    $stmt2->execute([':member_id' => $memberId]);
    $rows = $stmt2->fetchAll(PDO::FETCH_ASSOC);

    // 4) Update each wallet with recalculated portfolio_value
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

    // 5) Send confirmation emails to members (don't fail the whole request if emails fail)
    $emailsSent = 0;
    $emailsFailed = 0;
    
    foreach ($ordersByMember as $memberId => $memberOrders) {
        try {
            $sent = sendOrderConfirmationEmail($conn, $memberId, $memberOrders);
            if ($sent) {
                $emailsSent++;
            } else {
                $emailsFailed++;
            }
        } catch (Exception $emailEx) {
            error_log("[broker_confirm] Email error for member $memberId: " . $emailEx->getMessage());
            $emailsFailed++;
        }
    }

    // 6) Return JSON response
    echo json_encode([
        "success"         => true,
        "member_id"       => $memberId,
        "orders_found"    => count($pendingOrders),
        "updated_orders"  => $updatedRows,
        "updated_wallets" => count($rows),
        "emails_sent"     => $emailsSent,
        "emails_failed"   => $emailsFailed,
        "timestamp"       => date("Y-m-d H:i:s")
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
