<?php
// api/save-wallet.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit;
}

require_once 'config.php'; // $conn is PDO

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    echo json_encode(["success" => false, "error" => "Invalid JSON input"]);
    exit;
}

try {
    if (!empty($input['member_id'])) {
        // Check if wallet exists
        $check = $conn->prepare("SELECT member_id FROM wallet WHERE member_id = :member_id LIMIT 1");
        $check->execute(['member_id' => $input['member_id']]);
        $exists = $check->fetchColumn();

        // --- normalize + validate fields ---
        // member_timezone: allow IANA style, or null
        $memberTimezone = $input['member_timezone'] ?? null;
        if ($memberTimezone !== null) {
            $memberTimezone = trim((string)$memberTimezone);
            if ($memberTimezone === '') {
                $memberTimezone = null;
            } elseif (strlen($memberTimezone) > 64 || !preg_match('/^[A-Za-z_\/\-]+$/', $memberTimezone)) {
                echo json_encode(["success" => false, "error" => "Invalid timezone format"]);
                exit;
            }
        }

        // numeric normals
        $points          = isset($input['points']) ? (int)$input['points'] : 0;
        $cashBalance     = isset($input['cash_balance']) ? (float)$input['cash_balance'] : 0.00;
        $portfolioValue  = isset($input['portfolio_value']) ? (float)$input['portfolio_value'] : 0.00;
        $sweepPercentage = isset($input['sweep_percentage']) ? (float)$input['sweep_percentage'] : 0.00;

        // --- Build params (shared) ---
        $params = [
            ':member_id'            => $input['member_id'] ?? null,
            ':member_email'         => $input['member_email'] ?? null,
            ':first_name'           => $input['first_name'] ?? null,
            ':middle_name'          => $input['middle_name'] ?? null,
            ':last_name'            => $input['last_name'] ?? null,
            ':member_address_line1' => $input['member_address_line1'] ?? null,
            ':member_address_line2' => $input['member_address_line2'] ?? null,
            ':member_town_city'     => $input['member_town_city'] ?? null,
            ':member_state'         => $input['member_state'] ?? null,
            ':member_zip'           => $input['member_zip'] ?? null,
            ':member_country'       => $input['member_country'] ?? null,
            ':member_timezone'      => $memberTimezone, // ✅ keep timezone
            ':merchant_id'          => $input['merchant_id'] ?? null,
            ':merchant_name'        => $input['merchant_name'] ?? null,
            ':broker'               => $input['broker'] ?? null,
            ':broker_url'           => $input['broker_url'] ?? null,
            ':election_type'        => $input['election_type'] ?? null,
            ':points'               => $points,
            ':cash_balance'         => $cashBalance,
            ':portfolio_value'      => $portfolioValue,
            ':sweep_percentage'     => $sweepPercentage,
        ];

        // --- Handle password reset securely ---
        $passwordClause = "";
        if (!empty($input['new_password'])) {
            $hashed = password_hash($input['new_password'], PASSWORD_BCRYPT);
            $params[':member_password_hash'] = $hashed;
            $passwordClause = ", member_password_hash = :member_password_hash";
        }

        if ($exists) {
            // ✅ Update existing (NO conversion_rate)
            $sql = "
                UPDATE wallet SET
                    member_email = :member_email,
                    first_name = :first_name,
                    middle_name = :middle_name,
                    last_name = :last_name,
                    member_address_line1 = :member_address_line1,
                    member_address_line2 = :member_address_line2,
                    member_town_city = :member_town_city,
                    member_state = :member_state,
                    member_zip = :member_zip,
                    member_country = :member_country,
                    member_timezone = :member_timezone,
                    merchant_id = :merchant_id,
                    merchant_name = :merchant_name,
                    broker = :broker,
                    broker_url = :broker_url,
                    election_type = :election_type,
                    points = :points,
                    cash_balance = :cash_balance,
                    portfolio_value = :portfolio_value,
                    sweep_percentage = :sweep_percentage
                    $passwordClause
                WHERE member_id = :member_id
            ";
            $stmt = $conn->prepare($sql);
        } else {
            // ✅ Insert new (NO conversion_rate)
            if (empty($input['new_password'])) {
                echo json_encode(["success" => false, "error" => "New records require a password"]);
                exit;
            }
            $sql = "
                INSERT INTO wallet (
                    member_id, member_email, member_password_hash,
                    first_name, middle_name, last_name,
                    member_address_line1, member_address_line2,
                    member_town_city, member_state, member_zip, member_country, member_timezone,
                    merchant_id, merchant_name,
                    broker, broker_url, election_type,
                    points, cash_balance, portfolio_value, sweep_percentage
                ) VALUES (
                    :member_id, :member_email, :member_password_hash,
                    :first_name, :middle_name, :last_name,
                    :member_address_line1, :member_address_line2,
                    :member_town_city, :member_state, :member_zip, :member_country, :member_timezone,
                    :merchant_id, :merchant_name,
                    :broker, :broker_url, :election_type,
                    :points, :cash_balance, :portfolio_value, :sweep_percentage
                )
            ";
            $stmt = $conn->prepare($sql);
        }

        $stmt->execute($params);

        echo json_encode(["success" => true, "wallet" => $input]);
    } else {
        echo json_encode(["success" => false, "error" => "Missing member_id"]);
    }
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
