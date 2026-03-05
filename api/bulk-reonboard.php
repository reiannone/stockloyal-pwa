<?php
/**
 * bulk-reonboard.php
 * Fills missing DOB/phone for test members and creates Alpaca accounts for each.
 * Run from EC2: php bulk-reonboard.php
 */
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/BrokerAdapterFactory.php';

$DUMMY_DOB    = '1990-01-01';
$DUMMY_PHONE  = '5555550000';
$DUMMY_TAX_ID = '666-00-1234';  // Dummy SSN for sandbox testing only

$members = [
    'bucket', 'claude', 'liam111', 'logan104', 'sunday928',
    'robertson', 'seahawk01', 'jan30', 'rex1330', 'stockloyal'
];

$ipAddress = '127.0.0.1';

echo "=== Bulk Re-onboard ===\n\n";

foreach ($members as $memberId) {

    echo "── {$memberId} ──\n";

    // 1. Fetch wallet row
    $stmt = $conn->prepare("
        SELECT member_id, member_email, first_name, last_name, date_of_birth,
               member_phone, member_address_line1, member_town_city,
               member_state, member_zip, member_country, merchant_id
        FROM wallet WHERE member_id = ?
    ");
    $stmt->execute([$memberId]);
    $w = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$w) {
        echo "  SKIP — not found in wallet\n\n";
        continue;
    }

    // 2. Check if already has a broker account
    $credStmt = $conn->prepare("
        SELECT broker_account_id FROM broker_credentials
        WHERE member_id = ? AND broker_account_id IS NOT NULL LIMIT 1
    ");
    $credStmt->execute([$memberId]);
    $existing = $credStmt->fetch(PDO::FETCH_ASSOC);

    if (!empty($existing['broker_account_id'])) {
        echo "  SKIP — already has account: {$existing['broker_account_id']}\n\n";
        continue;
    }

    // 3. Fill missing fields with dummy data
    $dob        = $w['date_of_birth']        ?: $DUMMY_DOB;
    $phone      = $w['member_phone']         ?: $DUMMY_PHONE;
    $firstName  = $w['first_name']           ?: 'Test';
    $lastName   = $w['last_name']            ?: 'Member';
    $street     = $w['member_address_line1'] ?: '123 Test Street';
    $city       = $w['member_town_city']     ?: 'Testville';
    $state      = $w['member_state']         ?: 'NJ';
    $zip        = $w['member_zip']           ?: '07450';
    $country    = $w['member_country']       ?: 'USA';
    $email      = $w['member_email'];
    $merchantId = $w['merchant_id']          ?: 'merchant001';

    // Normalize country to 3-letter code
    if (strtoupper($country) === 'US') $country = 'USA';

    echo "  Email:    {$email}\n";
    echo "  Name:     {$firstName} {$lastName}\n";
    echo "  DOB:      {$dob}" . ($w['date_of_birth'] ? '' : ' (dummy)') . "\n";
    echo "  Phone:    {$phone}" . ($w['member_phone'] ? '' : ' (dummy)') . "\n";
    echo "  Merchant: {$merchantId}\n";

    // 4. Get Alpaca adapter
    try {
        $adapter = BrokerAdapterFactory::forMerchant($conn, $merchantId, 'Alpaca');
        $alpaca  = $adapter->getApi();
    } catch (Exception $e) {
        echo "  ERROR — broker config: {$e->getMessage()}\n\n";
        continue;
    }

    // 5. Create Alpaca account
    $kycData = [
        'email'          => $email,
        'first_name'     => $firstName,
        'last_name'      => $lastName,
        'date_of_birth'  => $dob,
        'phone'          => $phone,
        'street_address' => $street,
        'city'           => $city,
        'state'          => $state,
        'postal_code'    => $zip,
        'country'        => $country,
        'funding_source' => 'employment_income',
        'ip_address'     => $ipAddress,
        'tax_id'         => $DUMMY_TAX_ID,
        'tax_id_type'    => 'USA_SSN',
    ];

    $result = $alpaca->createAccount($kycData);

    if (!$result['success']) {
        echo "  ERROR — Alpaca: " . ($result['error'] ?? json_encode($result['data'])) . "\n\n";
        continue;
    }

    $alpacaAccountId = $result['data']['id'] ?? '';
    if (empty($alpacaAccountId)) {
        echo "  ERROR — no account ID in response\n\n";
        continue;
    }

    echo "  Alpaca account created: {$alpacaAccountId}\n";

    // 6. Upsert broker_credentials
    $upsert = $conn->prepare("
        INSERT INTO broker_credentials (member_id, broker, broker_account_id, broker_account_status)
        VALUES (?, 'Alpaca', ?, 'ACTIVE')
        ON DUPLICATE KEY UPDATE
            broker_account_id     = VALUES(broker_account_id),
            broker_account_status = 'ACTIVE'
    ");
    $upsert->execute([$memberId, $alpacaAccountId]);

    echo "  broker_credentials updated ✓\n\n";
}

echo "=== Done ===\n";
