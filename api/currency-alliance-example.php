<?php
declare(strict_types=1);

/**
 * currency-alliance-example.php
 *
 * Shows how CurrencyAllianceAPI.php plugs into StockLoyal's
 * existing Prepare → Approve → Fund → Place → Settle pipeline.
 *
 * Prerequisites (set in .env):
 *   CA_PUBLIC_KEY=pub_xxxxxxxxxxxxxxxx
 *   CA_SECRET_KEY=sec_xxxxxxxxxxxxxxxx
 *
 * Get these from: Loyalty API → Credentials in the CA dashboard.
 */

require_once __DIR__ . '/CurrencyAllianceAPI.php';

// ─── Init ────────────────────────────────────────────────────────────────────
$ca = new CurrencyAllianceAPI(
    publicKey: $_ENV['CA_PUBLIC_KEY'],
    secretKey:  $_ENV['CA_SECRET_KEY']
);

// ─── Example values (replace with real data from your orders table) ──────────
$partnerCurrency  = 'SCENEPLUS';            // CA shortcode from My Partnerships
$memberIdentifiers = ['id' => 'M12334532']; // Member's loyalty program ID
$investmentAmount = 50.00;                  // USD value from the prepared order
$orderId          = 'order-uuid-from-db';   // Your orders.id for reconciliation

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Lookup member (validate exists + check balance)
// ─────────────────────────────────────────────────────────────────────────────
try {
    $member = $ca->lookupMember($partnerCurrency, $memberIdentifiers);

    echo "Member: {$member['first_name']} {$member['last_name']}\n";
    echo "Balance: {$member['balance']} {$partnerCurrency} points\n";
    echo "Tier: {$member['tier']['name']}\n\n";

} catch (RuntimeException $e) {
    // Member not found or program unreachable → block the order
    error_log("CA member lookup failed: " . $e->getMessage());
    die("Member validation failed.\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Simulate redemption (show member points cost, no debit)
// ─────────────────────────────────────────────────────────────────────────────
$sim = $ca->simulateRedemption($partnerCurrency, $memberIdentifiers, $investmentAmount);

echo "Simulation result:\n";
echo "  Points required : {$sim['total_loyalty_amount']}\n";
echo "  Fiat value      : \${$sim['total_fiat_amount']}\n";
echo "  Sufficient balance: " . ($sim['sufficient_balance'] ? 'YES' : 'NO') . "\n\n";

if (!$sim['sufficient_balance']) {
    die("Member has insufficient points for this investment.\n");
}

// At this point, show the member the confirmation screen in the UI:
// "Redeem {$sim['total_loyalty_amount']} {$partnerCurrency} points for a $50 investment?"

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Execute redemption (member confirmed; deduct points)
// ─────────────────────────────────────────────────────────────────────────────
$redemption = null;
$transactionId = null;
$externalRef   = null;

try {
    $redemption    = $ca->executeRedemption(
        loyaltyCurrency:   $partnerCurrency,
        memberIdentifiers: $memberIdentifiers,
        fiatAmount:        $investmentAmount,
        fiatCurrency:      'USD',
        externalReference: $orderId,  // Ties CA transaction to your order row
        description:       "Stock investment via StockLoyal order $orderId"
    );

    // The transaction object is in $redemption['transaction'] for 201 responses,
    // or directly in $redemption for 200 (login-required redirect — won't happen
    // server-side; only occurs if partner requires member re-auth).
    $tx            = $redemption['transaction'] ?? $redemption;
    $transactionId = $tx['id'];           // Save this — needed for cancel
    $externalRef   = $tx['external_reference'];
    $confirmedFiat = $sim['total_fiat_amount']; // Use simulated amount for Alpaca

    echo "Redemption executed!\n";
    echo "  CA Transaction ID : $transactionId\n";
    echo "  Status            : {$tx['status']}\n";
    echo "  Confirmed fiat    : \$$confirmedFiat\n\n";

    // ── Update your orders table ─────────────────────────────────────────────
    // UPDATE orders SET
    //   status = 'funded',
    //   ca_transaction_id = '$transactionId',
    //   ca_external_ref   = '$externalRef',
    //   funded_at         = NOW()
    // WHERE id = '$orderId'

} catch (RuntimeException $e) {
    error_log("CA redemption failed: " . $e->getMessage());
    die("Redemption execution failed — order NOT funded.\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Submit to Alpaca (your existing broker execution flow)
// ─────────────────────────────────────────────────────────────────────────────
// $alpaca = new AlpacaBrokerAPI(...);
// try {
//     $order = $alpaca->submitOrder(
//         accountId: $wallet['alpaca_account_id'],
//         symbol:    $order['ticker'],
//         notional:  $confirmedFiat
//     );
//     // UPDATE orders SET status = 'placed', alpaca_order_id = $order['id']
// } catch (Exception $e) {
//     // ── STEP 5 — Alpaca failed → cancel the CA redemption (refund points) ──
//     try {
//         $cancel = $ca->cancelRedemption(
//             previousTransactionId: $transactionId,
//             previousExternalRef:   $externalRef,
//             reason:                'Alpaca order submission failed'
//         );
//         echo "CA redemption cancelled — points refunded to member.\n";
//         // UPDATE orders SET status = 'failed', ca_transaction_id = NULL
//     } catch (RuntimeException $cancelErr) {
//         // Log this for manual review — points deducted but order not placed
//         error_log("CRITICAL: CA cancel failed after Alpaca error. TX: $transactionId");
//     }
// }

echo "Done. Order $orderId is now in 'funded' state — ready for Alpaca execution.\n";
