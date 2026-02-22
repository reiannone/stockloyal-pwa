<?php
// api/alpaca-create-account.php
// Creates a new Alpaca brokerage account for a StockLoyal member
declare(strict_types=1);
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/_loadenv.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header("Content-Type: application/json");
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/AlpacaBrokerAPI.php';

$input = json_decode(file_get_contents("php://input"), true) ?? [];

// ── Required fields ──
$memberId  = strtolower(trim((string)($input['member_id'] ?? '')));
$email     = trim((string)($input['email'] ?? ''));
$firstName = trim((string)($input['first_name'] ?? ''));
$lastName  = trim((string)($input['last_name'] ?? ''));
$dob       = trim((string)($input['date_of_birth'] ?? '')); // YYYY-MM-DD
$phone     = trim((string)($input['phone'] ?? ''));
$street    = trim((string)($input['street_address'] ?? ''));
$city      = trim((string)($input['city'] ?? ''));
$state     = trim((string)($input['state'] ?? ''));
$zip       = trim((string)($input['postal_code'] ?? ''));
$country   = trim((string)($input['country'] ?? 'USA'));
$taxId     = trim((string)($input['tax_id'] ?? '')); // SSN
$fundingSrc = trim((string)($input['funding_source'] ?? 'employment_income'));

// ── Optional fields ──
$middleName    = trim((string)($input['middle_name'] ?? ''));
$taxCountry    = trim((string)($input['tax_country'] ?? 'USA'));
$isControl     = (bool)($input['is_control_person'] ?? false);
$isAffiliated  = (bool)($input['is_affiliated'] ?? false);
$isPep         = (bool)($input['is_politically_exposed'] ?? false);
$familyExposed = (bool)($input['immediate_family_exposed'] ?? false);

// ── Validate required fields ──
$missing = [];
if (!$memberId)  $missing[] = 'member_id';
if (!$email)     $missing[] = 'email';
if (!$firstName) $missing[] = 'first_name';
if (!$lastName)  $missing[] = 'last_name';
if (!$dob)       $missing[] = 'date_of_birth';
if (!$phone)     $missing[] = 'phone';
if (!$street)    $missing[] = 'street_address';
if (!$city)      $missing[] = 'city';

if (!empty($missing)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing required fields: " . implode(', ', $missing),
    ]);
    exit;
}

// ── Validate date format ──
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "date_of_birth must be in YYYY-MM-DD format",
    ]);
    exit;
}

try {
    // ── Check member exists ──
    $memberStmt = $conn->prepare("SELECT member_id FROM wallet WHERE member_id = ?");
    $memberStmt->execute([$memberId]);
    $member = $memberStmt->fetch(PDO::FETCH_ASSOC);

    if (!$member) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error"   => "Member not found",
        ]);
        exit;
    }

    // ── Check if member already has an Alpaca account (via broker_credentials) ──
    $credStmt = $conn->prepare("SELECT broker_account_id FROM broker_credentials WHERE member_id = ? AND broker_account_id IS NOT NULL LIMIT 1");
    $credStmt->execute([$memberId]);
    $existingCred = $credStmt->fetch(PDO::FETCH_ASSOC);

    if (!empty($existingCred['broker_account_id'])) {
        echo json_encode([
            "success"           => true,
            "already_exists"    => true,
            "broker_account_id" => $existingCred['broker_account_id'],
            "message"           => "This member already has a linked Alpaca account.",
        ]);
        exit;
    }

    // ── Get client IP for agreements ──
    $ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    if (strpos($ipAddress, ',') !== false) {
        $ipAddress = trim(explode(',', $ipAddress)[0]);
    }

    // ── Create account via Alpaca Broker API ──
    $alpaca = new AlpacaBrokerAPI();

    $kycData = [
        'email'                    => $email,
        'phone'                    => $phone,
        'street_address'           => $street,
        'city'                     => $city,
        'state'                    => $state,
        'postal_code'              => $zip,
        'country'                  => $country,
        'first_name'               => $firstName,
        'middle_name'              => $middleName,
        'last_name'                => $lastName,
        'date_of_birth'            => $dob,
        'tax_id'                   => $taxId,
        'tax_id_type'              => ($country === 'USA') ? 'USA_SSN' : 'NOT_SPECIFIED',
        'tax_country'              => $taxCountry,
        'funding_source'           => $fundingSrc,
        'is_control_person'        => $isControl,
        'is_affiliated'            => $isAffiliated,
        'is_politically_exposed'   => $isPep,
        'immediate_family_exposed' => $familyExposed,
        'ip_address'               => $ipAddress,
    ];

    $result = $alpaca->createAccount($kycData);

    if (!$result['success']) {
        error_log("[alpaca-create-account] Failed for member {$memberId}: " . json_encode($result));

        // Parse Alpaca error for user-friendly message
        $errorMsg = $result['error'] ?? 'Account creation failed';
        $httpCode = $result['http_code'] ?? 500;

        // Common Alpaca errors
        if ($httpCode === 409) {
            $errorMsg = "An account with this email already exists at Alpaca.";
        } elseif ($httpCode === 422) {
            $errorMsg = "Please check your information. " . $errorMsg;
        }

        echo json_encode([
            "success"    => false,
            "error"      => $errorMsg,
            "http_code"  => $httpCode,
            "details"    => $result['data'] ?? null,
        ]);
        exit;
    }

    // ── Success — store Alpaca account info in broker_credentials ──
    $acctData = $result['data'];
    $brokerAccountId = $acctData['id'] ?? '';
    $brokerAccountNumber   = $acctData['account_number'] ?? '';
    $brokerAccountStatus   = $acctData['status'] ?? 'SUBMITTED';

    // Upsert broker_credentials
    $existingCredStmt = $conn->prepare("SELECT id FROM broker_credentials WHERE member_id = ? LIMIT 1");
    $existingCredStmt->execute([$memberId]);
    $existingCredRow = $existingCredStmt->fetch(PDO::FETCH_ASSOC);

    if ($existingCredRow) {
        $updateCredStmt = $conn->prepare("
            UPDATE broker_credentials
            SET broker = 'Alpaca',
                username = :email,
                broker_account_id     = :broker_acct_id,
                broker_account_number = :broker_acct_num,
                broker_account_status = :broker_acct_status
            WHERE member_id = :member_id
        ");
        $updateCredStmt->execute([
            ':email'         => $email,
            ':broker_acct_id'     => $brokerAccountId,
            ':broker_acct_num' => $brokerAccountNumber,
            ':broker_acct_status' => $brokerAccountStatus,
            ':member_id'     => $memberId,
        ]);
    } else {
        $insertCredStmt = $conn->prepare("
            INSERT INTO broker_credentials
                (member_id, broker, username, encrypted_password, broker_account_id, broker_account_number, broker_account_status)
            VALUES
                (:member_id, 'Alpaca', :email, '', :broker_acct_id, :broker_acct_num, :broker_acct_status)
        ");
        $insertCredStmt->execute([
            ':member_id'     => $memberId,
            ':email'         => $email,
            ':broker_acct_id'     => $brokerAccountId,
            ':broker_acct_num' => $brokerAccountNumber,
            ':broker_acct_status' => $brokerAccountStatus,
        ]);
    }

    // Update wallet with broker + personal info
    $updateWalletStmt = $conn->prepare("
        UPDATE wallet 
        SET broker                = 'Alpaca',
            first_name            = COALESCE(NULLIF(:first_name, ''), first_name),
            middle_name           = COALESCE(NULLIF(:middle_name, ''), middle_name),
            last_name             = COALESCE(NULLIF(:last_name, ''), last_name),
            member_email          = COALESCE(NULLIF(:email, ''), member_email),
            member_address_line1  = COALESCE(NULLIF(:street, ''), member_address_line1),
            member_town_city      = COALESCE(NULLIF(:city, ''), member_town_city),
            member_state          = COALESCE(NULLIF(:state, ''), member_state),
            member_zip            = COALESCE(NULLIF(:zip, ''), member_zip),
            member_country        = COALESCE(NULLIF(:country, ''), member_country)
        WHERE member_id = :member_id
    ");
    $updateWalletStmt->execute([
        ':first_name'    => $firstName,
        ':middle_name'   => $middleName,
        ':last_name'     => $lastName,
        ':email'         => $email,
        ':street'        => $street,
        ':city'          => $city,
        ':state'         => $state,
        ':zip'           => $zip,
        ':country'       => $country,
        ':member_id'     => $memberId,
    ]);

    // Log the event
    error_log("[alpaca-create-account] ✅ Created Alpaca account {$brokerAccountId} for member {$memberId}");

    echo json_encode([
        "success"            => true,
        "broker_account_id"  => $brokerAccountId,
        "account_number"     => $brokerAccountNumber,
        "account_status"     => $brokerAccountStatus,
        "message"            => "Brokerage account created successfully!",
    ]);

} catch (Exception $e) {
    error_log("[alpaca-create-account] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage(),
    ]);
}
