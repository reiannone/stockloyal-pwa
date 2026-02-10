<?php
// api/admin-reset-broker-lockout.php
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

require_once __DIR__ . '/config.php';

// ✅ Expect JSON
$input = json_decode(file_get_contents("php://input"), true) ?? [];
$memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;

if (!$memberId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing member_id"
    ]);
    exit;
}

try {
    // ── Check current state ──
    $checkStmt = $conn->prepare("
        SELECT credential_fail_count, locked_at
        FROM broker_credentials
        WHERE member_id = :member_id
        LIMIT 1
    ");
    $checkStmt->execute([":member_id" => $memberId]);
    $row = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        echo json_encode([
            "success" => false,
            "error"   => "No broker credentials found for member: {$memberId}"
        ]);
        exit;
    }

    $previousFailCount = (int)$row['credential_fail_count'];
    $wasLocked = ($row['locked_at'] !== null);

    // ── Reset fail count and unlock ──
    $resetStmt = $conn->prepare("
        UPDATE broker_credentials
        SET credential_fail_count = 0,
            locked_at = NULL,
            fail_reset_at = NOW()
        WHERE member_id = :member_id
    ");
    $resetStmt->execute([":member_id" => $memberId]);

    echo json_encode([
        "success"              => true,
        "member_id"            => $memberId,
        "previous_fail_count"  => $previousFailCount,
        "was_locked"           => $wasLocked,
        "message"              => $wasLocked
            ? "Member {$memberId} has been unlocked and fail count reset to 0."
            : "Fail count reset to 0 for member {$memberId} (was {$previousFailCount})."
    ]);

} catch (Exception $e) {
    error_log("admin-reset-broker-lockout.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}
