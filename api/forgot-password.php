<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

// ───────────────────────────────────────────────────
// Send email via AWS SES SMTP
// ───────────────────────────────────────────────────
function sendViaSES(string $to, string $subject, string $body, string $fromName = 'StockLoyal', string $fromEmail = 'noreply@stockloyal.com'): bool {
    $smtpHost = 'email-smtp.us-east-2.amazonaws.com';
    $smtpPort = 587;
    $smtpUser = 'AKIAXJRZMKPYZOTO2DHA';
    $smtpPass = 'BBFBFD2WxeuQWmPvsBBwjmEtcw+FS2Ku88OrnqCHuC6w';

    try {
        $socket = fsockopen($smtpHost, $smtpPort, $errno, $errstr, 30);
        if (!$socket) {
            error_log("[SES] Connection failed: $errstr ($errno)");
            return false;
        }

        $sendCmd = function($cmd, $expectedCode = null) use ($socket) {
            if ($cmd) {
                fwrite($socket, $cmd . "\r\n");
            }
            $response = '';
            while ($line = fgets($socket, 515)) {
                $response .= $line;
                if (isset($line[3]) && $line[3] === ' ') break;
            }
            if ($expectedCode && strpos($response, (string)$expectedCode) !== 0) {
                error_log("[SES] Expected $expectedCode, got: " . trim($response));
                return false;
            }
            return $response;
        };

        $sendCmd(null, 220);
        $sendCmd("EHLO stockloyal.com", 250);

        $sendCmd("STARTTLS", 220);
        stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        $sendCmd("EHLO stockloyal.com", 250);

        $sendCmd("AUTH LOGIN", 334);
        $sendCmd(base64_encode($smtpUser), 334);
        $sendCmd(base64_encode($smtpPass), 235);

        $sendCmd("MAIL FROM:<{$fromEmail}>", 250);
        $sendCmd("RCPT TO:<{$to}>", 250);
        $sendCmd("DATA", 354);

        $message  = "From: {$fromName} <{$fromEmail}>\r\n";
        $message .= "To: {$to}\r\n";
        $message .= "Subject: {$subject}\r\n";
        $message .= "MIME-Version: 1.0\r\n";
        $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $message .= "\r\n";
        $message .= $body;

        $sendCmd($message . "\r\n.", 250);
        $sendCmd("QUIT", 221);

        fclose($socket);
        return true;

    } catch (\Throwable $ex) {
        error_log("[SES] Exception: " . $ex->getMessage());
        if (isset($socket) && is_resource($socket)) fclose($socket);
        return false;
    }
}

// ───────────────────────────────────────────────────
// Main logic
// ───────────────────────────────────────────────────
$input = json_decode(file_get_contents('php://input'), true);
$email = trim(strtolower($input['email'] ?? ''));
$merchantId = trim($input['merchant_id'] ?? '');

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'error' => 'A valid email address is required.']);
    exit;
}

// Look up the member by email in the wallet table
$stmt = $conn->prepare("SELECT member_id, member_email FROM wallet WHERE LOWER(member_email) = :email LIMIT 1");
$stmt->execute([':email' => $email]);
$member = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$member) {
    // Don't reveal whether the email exists — return success either way
    echo json_encode(['success' => true]);
    exit;
}

// Generate a 6-digit code and expiry (15 minutes)
$code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$expiresAt = date('Y-m-d H:i:s', strtotime('+15 minutes'));

// Invalidate any previous unused codes for this email
$stmt = $conn->prepare("UPDATE password_resets SET used = 1 WHERE email = :email AND used = 0");
$stmt->execute([':email' => $email]);

// Insert the new code
$stmt = $conn->prepare("
    INSERT INTO password_resets (member_id, email, code, expires_at)
    VALUES (:member_id, :email, :code, :expires_at)
");
$stmt->execute([
    ':member_id'  => $member['member_id'],
    ':email'      => $email,
    ':code'       => $code,
    ':expires_at' => $expiresAt,
]);

// Send the reset email via SES
$subject = "StockLoyal - Password Reset Code";
$body = "Hi {$member['member_id']},\n\n"
      . "Your password reset code is: {$code}\n\n"
      . "This code expires in 15 minutes.\n\n"
      . "If you didn't request this, you can safely ignore this email.\n\n"
      . "- StockLoyal";

$sent = sendViaSES($email, $subject, $body);

if (!$sent) {
    error_log("[forgot-password] SES send failed for {$email}");
    echo json_encode(['success' => false, 'error' => 'Unable to send reset email. Please try again later.']);
    exit;
}

echo json_encode(['success' => true]);
