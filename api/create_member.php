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

require_once 'config.php'; // $conn (PDO)

function is_email(string $s): bool {
    return filter_var($s, FILTER_VALIDATE_EMAIL) !== false;
}

try {
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) $input = $_POST ?? [];

    $merchantId  = trim((string)($input['merchant_id'] ?? ''));
    $memberIdRaw = trim((string)($input['member_id'] ?? ''));
    $emailRaw    = trim((string)($input['member_email'] ?? ''));
    $password    = (string)($input['password'] ?? '');
    $memberTier  = trim((string)($input['member_tier'] ?? '')); // ✅ NEW

    if ($memberIdRaw === '') {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Missing required field: member_id"]);
        exit;
    }
    if ($emailRaw === '') {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Missing required field: member_email"]);
        exit;
    }
    if ($password === '') {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Missing required field: password"]);
        exit;
    }

    if (is_email($memberIdRaw)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Username cannot be an email address."]);
        exit;
    }
    if (!is_email($emailRaw)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Please provide a valid email address."]);
        exit;
    }
    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Password must be at least 8 characters long"]);
        exit;
    }

    $memberId = mb_strtolower($memberIdRaw);
    $memberEmail = mb_strtolower($emailRaw);
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $conn->beginTransaction();

    // Username uniqueness (case-insensitive)
    $checkIdStmt = $conn->prepare("
        SELECT COUNT(*)
        FROM wallet
        WHERE LOWER(member_id) = :member_id
    ");
    $checkIdStmt->execute([":member_id" => $memberId]);
    if ((int)$checkIdStmt->fetchColumn() > 0) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "error" => "Username already exists: $memberId"]);
        exit;
    }

    // Email uniqueness (case-insensitive)
    $checkEmailStmt = $conn->prepare("
        SELECT COUNT(*)
        FROM wallet
        WHERE LOWER(member_email) = :member_email
    ");
    $checkEmailStmt->execute([":member_email" => $memberEmail]);
    if ((int)$checkEmailStmt->fetchColumn() > 0) {
        $conn->rollBack();
        http_response_code(409);
        echo json_encode(["success" => false, "error" => "Email already exists: $memberEmail"]);
        exit;
    }

    // ✅ Default to lowest tier if not provided
    if ($memberTier === '' && $merchantId !== '') {
        $tierStmt = $conn->prepare("
            SELECT 
                tier_1_name, tier_1_min_points,
                tier_2_name, tier_2_min_points,
                tier_3_name, tier_3_min_points,
                tier_4_name, tier_4_min_points,
                tier_5_name, tier_5_min_points,
                tier_6_name, tier_6_min_points
            FROM merchant 
            WHERE merchant_id = :merchant_id
            LIMIT 1
        ");
        $tierStmt->execute([':merchant_id' => $merchantId]);
        $tierData = $tierStmt->fetch(PDO::FETCH_ASSOC);
        
        if ($tierData) {
            // Find lowest tier (tier with smallest min_points)
            $tiers = [];
            for ($i = 1; $i <= 6; $i++) {
                $tierName = $tierData["tier_{$i}_name"];
                $tierMinPoints = $tierData["tier_{$i}_min_points"];
                if ($tierName) {
                    $tiers[] = [
                        'name' => $tierName,
                        'min_points' => floatval($tierMinPoints ?? 0)
                    ];
                }
            }
            
            if (!empty($tiers)) {
                // Sort by min_points ascending
                usort($tiers, function($a, $b) {
                    return $a['min_points'] <=> $b['min_points'];
                });
                $memberTier = $tiers[0]['name'];
                error_log("create_member.php: Defaulted to lowest tier: $memberTier");
            }
        }
    }

    $stmt = $conn->prepare("
        INSERT INTO wallet (
            member_id,
            member_email,
            member_password_hash,
            merchant_id,
            member_tier,
            created_at,
            updated_at
        ) VALUES (
            :member_id,
            :member_email,
            :member_password_hash,
            :merchant_id,
            :member_tier,
            NOW(),
            NOW()
        )
    ");
    $stmt->execute([
        ":member_id" => $memberId,
        ":member_email" => $memberEmail,
        ":member_password_hash" => $hash,
        ":merchant_id" => ($merchantId !== '' ? $merchantId : null),
        ":member_tier" => ($memberTier !== '' ? $memberTier : null),
    ]);

    $conn->commit();

    // Optionally return merchant_name (if merchant_id exists)
    $merchantName = null;
    if ($merchantId !== '') {
        $m = $conn->prepare("SELECT merchant_name FROM merchant WHERE merchant_id = :merchant_id LIMIT 1");
        $m->execute([":merchant_id" => $merchantId]);
        $merchantName = $m->fetchColumn() ?: null;
    }

    echo json_encode([
        "success" => true,
        "member_id" => $memberId,
        "member_email" => $memberEmail,
        "merchant_id" => ($merchantId !== '' ? $merchantId : null),
        "merchant_name" => $merchantName,
        "member_tier" => ($memberTier !== '' ? $memberTier : null),
        "broker" => null,
        "member_timezone" => null
    ]);
} catch (Exception $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    error_log("create_member.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server error: " . $e->getMessage()]);
}
