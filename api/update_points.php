<?php 
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    http_response_code(204);
    exit;
}

require_once 'config.php'; // expects $conn (PDO)

error_log("Start update_points.php");

// Accept JSON body
$raw = @file_get_contents("php://input");
$input = json_decode($raw, true);
if (!is_array($input)) {
    $input = $_POST ?? [];
}

$member_id    = trim($input['member_id'] ?? '');
$merchant_id  = trim($input['merchant_id'] ?? '');  // 🔹 NEW: optional
$points       = isset($input['points']) ? intval($input['points']) : null;
$cash_balance = isset($input['cash_balance']) ? floatval($input['cash_balance']) : null;

error_log("update_points.php input: member_id={$member_id}, merchant_id={$merchant_id}, points=" . var_export($points, true) . ", cash_balance=" . var_export($cash_balance, true));

// Validate required fields
if ($member_id === '' || $points === null || $cash_balance === null) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid input: member_id, points and cash_balance are required."
    ]);
    exit;
}

try {
    // 🔹 OPTIONAL: ensure member exists + has default password for demo
    // Only if merchant_id is provided
    if ($merchant_id !== '') {
        // Look for existing member
        $stmtM = $conn->prepare("
            SELECT member_id, password_hash
            FROM members
            WHERE merchant_id = :merchant_id
              AND member_id   = :member_id
            LIMIT 1
        ");
        $stmtM->execute([
            ':merchant_id' => $merchant_id,
            ':member_id'   => $member_id,
        ]);
        $memberRow = $stmtM->fetch(PDO::FETCH_ASSOC);

        $defaultPassword = 'defaultmemberpassword';
        $defaultHash     = password_hash($defaultPassword, PASSWORD_DEFAULT);

        if (!$memberRow) {
            // 🔹 First time demo user – create member with default password
            $ins = $conn->prepare("
                INSERT INTO members (merchant_id, member_id, password_hash, created_at, updated_at)
                VALUES (:merchant_id, :member_id, :password_hash, NOW(), NOW())
            ");
            $ins->execute([
                ':merchant_id'   => $merchant_id,
                ':member_id'     => $member_id,
                ':password_hash' => $defaultHash,
            ]);
            error_log("update_points.php: created new demo member {$member_id} for merchant {$merchant_id}");
        } else {
            // 🔹 If password_hash is NULL or empty, set default
            if (empty($memberRow['password_hash'])) {
                $updPwd = $conn->prepare("
                    UPDATE members
                    SET password_hash = :password_hash,
                        updated_at    = NOW()
                    WHERE merchant_id = :merchant_id
                      AND member_id   = :member_id
                ");
                $updPwd->execute([
                    ':password_hash' => $defaultHash,
                    ':merchant_id'   => $merchant_id,
                    ':member_id'     => $member_id,
                ]);
                error_log("update_points.php: updated NULL/empty password for demo member {$member_id}");
            }
        }
    }

    // Start transaction for wallet update
    $conn->beginTransaction();

    // Try updating existing wallet row
    $stmt = $conn->prepare("
        UPDATE wallet
        SET points = :points,
            cash_balance = :cash_balance,
            updated_at = NOW()
        WHERE member_id = :member_id
    ");
    $stmt->execute([
        ':points'       => $points,
        ':cash_balance' => $cash_balance,
        ':member_id'    => $member_id
    ]);

    if ($stmt->rowCount() === 0) {
        // No row updated — insert a new wallet record
        $stmtIns = $conn->prepare("
            INSERT INTO wallet (member_id, points, cash_balance, created_at, updated_at)
            VALUES (:member_id, :points, :cash_balance, NOW(), NOW())
        ");
        $stmtIns->execute([
            ':member_id'    => $member_id,
            ':points'       => $points,
            ':cash_balance' => $cash_balance,
        ]);
    }

    // Fetch updated wallet row
    $stmt2 = $conn->prepare("SELECT * FROM wallet WHERE member_id = :member_id LIMIT 1");
    $stmt2->execute([':member_id' => $member_id]);
    $wallet = $stmt2->fetch(PDO::FETCH_ASSOC);

    $conn->commit();

    if (!$wallet) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "message" => "Failed to fetch updated wallet"
        ]);
        exit;
    }

    // Normalize numeric fields
    foreach (['points', 'cash_balance', 'sweep_percentage'] as $col) {
        if (isset($wallet[$col])) {
            if (in_array($col, ['points', 'sweep_percentage'])) {
                $wallet[$col] = (int)$wallet[$col];
            } else {
                $wallet[$col] = (float)$wallet[$col];
            }
        }
    }

    echo json_encode([
        "success" => true,
        "wallet"  => $wallet
    ]);
    exit;
} catch (Exception $e) {
    if ($conn && $conn->inTransaction()) {
        $conn->rollBack();
    }
    error_log("update_points.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Server error: " . $e->getMessage()
    ]);
    exit;
}
