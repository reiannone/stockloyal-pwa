<?php
declare(strict_types=1);

// Enable error logging
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

error_log("=== get-wallet.php START ===");
error_log("REQUEST_METHOD: " . ($_SERVER['REQUEST_METHOD'] ?? 'none'));
error_log("CONTENT_TYPE: " . ($_SERVER['CONTENT_TYPE'] ?? 'none'));

try {
    require_once __DIR__ . '/cors.php';
    error_log("cors.php loaded");
    
    
    error_log("stockloyal_bootstrap.php loaded");
    
    require_once __DIR__ . '/_loadenv.php';
    error_log("_loadenv.php loaded");
} catch (Exception $e) {
    error_log("ERROR loading required files: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Configuration error"]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    error_log("Handling OPTIONS request");
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");

try {
    require_once 'config.php';
    error_log("config.php loaded");
} catch (Exception $e) {
    error_log("ERROR loading config.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database configuration error"]);
    exit;
}

// Check if $conn exists
if (!isset($conn)) {
    error_log("ERROR: \$conn not defined in config.php");
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Database connection not available"]);
    exit;
}

// Get and validate input
$rawInput = file_get_contents("php://input");
error_log("Raw input: " . $rawInput);

$input = json_decode($rawInput, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    error_log("JSON parse error: " . json_last_error_msg());
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Invalid JSON: " . json_last_error_msg()
    ]);
    exit;
}

$memberId = isset($input['member_id']) ? strtolower(trim((string)$input['member_id'])) : null;
error_log("member_id: " . ($memberId ?? 'null'));

if (!$memberId) {
    error_log("Missing member_id");
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing member_id"
    ]);
    exit;
}

try {
    error_log("Executing wallet query for member_id: " . $memberId);
    
    // 1. Fetch wallet + merchant conversion rate
    $stmt = $conn->prepare("
        SELECT 
            w.*,
            m.merchant_name,
            m.conversion_rate
        FROM wallet w
        LEFT JOIN merchant m ON w.merchant_id = m.merchant_id
        WHERE w.member_id = :member_id
        LIMIT 1
    ");
    $stmt->execute([":member_id" => $memberId]);
    $wallet = $stmt->fetch(PDO::FETCH_ASSOC);

    error_log("Wallet query result: " . ($wallet ? "found" : "not found"));

    if (!$wallet) {
        error_log("Wallet not found for member_id: " . $memberId);
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error"   => "Wallet not found"
        ]);
        exit;
    }

    // Normalize numeric fields
    foreach (['points', 'cash_balance', 'portfolio_value', 'sweep_percentage', 'conversion_rate'] as $col) {
        if (isset($wallet[$col])) {
            if ($col === 'points' || $col === 'sweep_percentage') {
                $wallet[$col] = (int) $wallet[$col];
            } else {
                $wallet[$col] = (float) $wallet[$col];
            }
        }
    }

    // Normalize timezone field
    if (array_key_exists('member_timezone', $wallet)) {
        $tz = $wallet['member_timezone'];
        if ($tz !== null) {
            $tz = trim((string)$tz);
            if ($tz === '' || strlen($tz) > 64 || !preg_match('/^[A-Za-z_\/\-]+$/', $tz)) {
                $tz = null;
            }
        }
        $wallet['member_timezone'] = $tz;
    } else {
        $wallet['member_timezone'] = null;
    }

    error_log("Executing broker_credentials query for member_id: " . $memberId);
    
    // 2. Fetch broker_credentials info
    $stmt2 = $conn->prepare("
        SELECT *
        FROM broker_credentials
        WHERE member_id = :member_id
        LIMIT 1
    ");
    $stmt2->execute([":member_id" => $memberId]);
    $brokerCreds = $stmt2->fetch(PDO::FETCH_ASSOC);

    error_log("Broker credentials query result: " . ($brokerCreds ? "found" : "not found"));

    $response = [
        "success"             => true,
        "wallet"              => $wallet,
        "broker_credentials"  => $brokerCreds ?: null
    ];
    
    error_log("Success! Sending response");
    echo json_encode($response);

} catch (PDOException $e) {
    error_log("PDO ERROR: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Database error: " . $e->getMessage()
    ]);
} catch (Exception $e) {
    error_log("GENERAL ERROR: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage()
    ]);
}

error_log("=== get-wallet.php END ===");