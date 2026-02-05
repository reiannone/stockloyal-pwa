<?php
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$email       = trim(strtolower($input['email'] ?? ''));
$code        = trim($input['code'] ?? '');
$newPassword = $input['new_password'] ?? '';

if (!$email || !$code || !$newPassword) {
    echo json_encode(['success' => false, 'error' => 'Email, code, and new password are required.']);
    exit;
}

if (strlen($newPassword) < 6) {
    echo json_encode(['success' => false, 'error' => 'Password must be at least 6 characters.']);
    exit;
}

// Look up the reset code
$stmt = $conn->prepare("
    SELECT id, member_id, expires_at
    FROM password_resets
    WHERE email = :email AND code = :code AND used = 0
    ORDER BY created_at DESC
    LIMIT 1
");
$stmt->execute([':email' => $email, ':code' => $code]);
$reset = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$reset) {
    echo json_encode(['success' => false, 'error' => 'Invalid or expired reset code.']);
    exit;
}

// Check expiry
if (strtotime($reset['expires_at']) < time()) {
    $conn->prepare("UPDATE password_resets SET used = 1 WHERE id = :id")->execute([':id' => $reset['id']]);
    echo json_encode(['success' => false, 'error' => 'Reset code has expired. Please request a new one.']);
    exit;
}

// Update the password in the wallet table
$hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);

$stmt = $conn->prepare("UPDATE wallet SET member_password_hash = :password WHERE member_id = :member_id");
$stmt->execute([
    ':password'  => $hashedPassword,
    ':member_id' => $reset['member_id'],
]);

if ($stmt->rowCount() === 0) {
    echo json_encode(['success' => false, 'error' => 'Account not found. Please contact support.']);
    exit;
}

// Mark the reset code as used
$conn->prepare("UPDATE password_resets SET used = 1 WHERE id = :id")->execute([':id' => $reset['id']]);

echo json_encode(['success' => true]);
