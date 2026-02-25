<?php
// api/alpaca-update-account.php
// Updates an existing Alpaca brokerage account for a StockLoyal member.
// Called by MemberOnboard.jsx when broker_account_id already exists in localStorage.
// Uses PATCH /v1/accounts/{account_id} via AlpacaBrokerAPI::updateAccount().
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
$memberId        = strtolower(trim((string)($input['member_id'] ?? '')));
$brokerAccountId = trim((string)($input['broker_account_id'] ?? ''));

if (!$memberId || !$brokerAccountId) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error"   => "Missing required fields: member_id, broker_account_id.",
    ]);
    exit;
}

// ── Profile fields (same as create) ──
$email     = trim((string)($input['email'] ?? ''));
$firstName = trim((string)($input['first_name'] ?? ''));
$lastName  = trim((string)($input['last_name'] ?? ''));
$dob       = trim((string)($input['date_of_birth'] ?? ''));
$phone     = trim((string)($input['phone'] ?? ''));
$street    = trim((string)($input['street_address'] ?? ''));
$city      = trim((string)($input['city'] ?? ''));
$state     = trim((string)($input['state'] ?? ''));
$zip       = trim((string)($input['postal_code'] ?? ''));
$country   = trim((string)($input['country'] ?? 'USA'));
$taxId     = trim((string)($input['tax_id'] ?? ''));
$fundingSrc = trim((string)($input['funding_source'] ?? ''));

$middleName    = trim((string)($input['middle_name'] ?? ''));
$taxCountry    = trim((string)($input['tax_country'] ?? 'USA'));
$isControl     = (bool)($input['is_control_person'] ?? false);
$isAffiliated  = (bool)($input['is_affiliated'] ?? false);
$isPep         = (bool)($input['is_politically_exposed'] ?? false);
$familyExposed = (bool)($input['immediate_family_exposed'] ?? false);

try {
    // ── Verify member exists ──
    $memberStmt = $conn->prepare("SELECT member_id FROM wallet WHERE member_id = ?");
    $memberStmt->execute([$memberId]);
    $member = $memberStmt->fetch(PDO::FETCH_ASSOC);

    if (!$member) {
        http_response_code(404);
        echo json_encode(["success" => false, "error" => "Member not found"]);
        exit;
    }

    // ── Verify broker_account_id belongs to this member ──
    $credStmt = $conn->prepare("
        SELECT broker_account_id FROM broker_credentials
        WHERE member_id = ? AND broker_account_id = ?
        LIMIT 1
    ");
    $credStmt->execute([$memberId, $brokerAccountId]);
    $cred = $credStmt->fetch(PDO::FETCH_ASSOC);

    if (!$cred) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Broker account not found for this member."]);
        exit;
    }

    // ── Build KYC data (same keys as createAccount) ──
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
    ];

    // ── Call Alpaca Broker API PATCH ──
    $alpaca = new AlpacaBrokerAPI();
    $result = $alpaca->updateAccount($brokerAccountId, $kycData);

    if (!$result['success']) {
        error_log("[alpaca-update-account] Failed for member {$memberId} account {$brokerAccountId}: " . json_encode($result));

        $errorMsg = $result['error'] ?? 'Account update failed';
        $httpCode = $result['http_code'] ?? 500;

        if ($httpCode === 422) {
            $errorMsg = "Please check your information. " . $errorMsg;
        } elseif ($httpCode === 404) {
            $errorMsg = "Broker account not found at Alpaca. It may have been closed.";
        }

        echo json_encode([
            "success"   => false,
            "error"     => $errorMsg,
            "http_code" => $httpCode,
            "details"   => $result['data'] ?? null,
        ]);
        exit;
    }

    // ── Success — update broker_credentials status if returned ──
    $acctData      = $result['data'];
    $accountStatus = $acctData['status'] ?? 'ACTIVE';

    $updateCredStmt = $conn->prepare("
        UPDATE broker_credentials
        SET broker_account_status = :status,
            username              = COALESCE(NULLIF(:email, ''), username)
        WHERE member_id = :member_id AND broker_account_id = :broker_acct_id
    ");
    $updateCredStmt->execute([
        ':status'         => $accountStatus,
        ':email'          => $email,
        ':member_id'      => $memberId,
        ':broker_acct_id' => $brokerAccountId,
    ]);

    error_log("[alpaca-update-account] ✅ Updated Alpaca account {$brokerAccountId} for member {$memberId}");

    echo json_encode([
        "success"            => true,
        "broker_account_id"  => $brokerAccountId,
        "account_status"     => $accountStatus,
        "message"            => "Brokerage account updated successfully!",
    ]);

} catch (Exception $e) {
    error_log("[alpaca-update-account] Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error"   => "Server error: " . $e->getMessage(),
    ]);
}
