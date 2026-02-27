# StockLoyal — Plaid Transfer Integration Architecture

## Overview

Replace the current manual ACH workflow (generate CSV → merchant initiates bank transfer) with **Plaid Transfer**, enabling StockLoyal to **programmatically debit merchant bank accounts** to fund the IB sweep account.

### Current Flow (Manual ACH)
```
Approved Orders → Admin clicks "Fund IB Account"
  → XLSX + ACH CSV generated
  → Merchant downloads CSV, initiates ACH at their bank
  → Funds arrive in StockLoyal sweep account (2-3 days)
  → Admin marks orders as settled
```

### New Flow (Plaid Transfer)
```
Approved Orders → Admin clicks "Fund IB Account"
  → StockLoyal calls Plaid /transfer/authorization/create (balance check + risk)
  → StockLoyal calls Plaid /transfer/create (initiates ACH debit)
  → Funds land in StockLoyal's Plaid Ledger (2-3 business days)
  → Webhook confirms settlement → orders auto-marked as settled
  → StockLoyal withdraws Ledger → IB sweep bank account
```

### Why Plaid Transfer (Not Just Plaid Auth)

- **Plaid Auth** only retrieves bank account/routing numbers — you still initiate ACH yourself via your bank or an ACH processor.
- **Plaid Transfer** handles the full money movement: authorization, risk scoring, ACH origination, settlement tracking, return handling. Single integration, no separate ACH processor needed.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    MERCHANT ADMIN PORTAL                  │
│                                                          │
│   ┌─────────────┐    ┌──────────────┐   ┌────────────┐  │
│   │ Plaid Link  │    │   Funding    │   │  Transfer  │  │
│   │ (Bank Conn) │    │   Dashboard  │   │   History   │  │
│   └──────┬──────┘    └──────┬───────┘   └─────┬──────┘  │
│          │                  │                  │         │
└──────────┼──────────────────┼──────────────────┼─────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────┐
│                   PHP BACKEND (EC2)                       │
│                                                          │
│   plaid-link-token.php      plaid-initiate-funding.php   │
│   plaid-exchange-token.php  plaid-transfer-status.php    │
│   plaid-webhook.php         plaid-withdraw-ledger.php    │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │              PlaidClient.php (wrapper)            │   │
│   │  - createLinkToken()    - createAuthorization()   │   │
│   │  - exchangePublicToken()- createTransfer()        │   │
│   │  - getBalance()         - withdrawLedger()        │   │
│   │  - syncTransferEvents() - getTransferStatus()     │   │
│   └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          ▼                               │
│   ┌────────────────┐  ┌──────────────────────────────┐   │
│   │   MySQL (RDS)  │  │      Plaid API (HTTPS)       │   │
│   │                │  │                              │   │
│   │ merchant_plaid │  │  /link/token/create          │   │
│   │ plaid_transfers│  │  /item/public_token/exchange  │   │
│   │ plaid_events   │  │  /transfer/authorization/create│  │
│   └────────────────┘  │  /transfer/create             │   │
│                       │  /transfer/event/sync         │   │
│                       │  /transfer/ledger/withdraw    │   │
│                       └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: `merchant_plaid`
Stores each merchant's linked Plaid bank connection.

```sql
CREATE TABLE merchant_plaid (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id     VARCHAR(100) NOT NULL,
  plaid_item_id   VARCHAR(255) NOT NULL,        -- Plaid Item identifier
  access_token    VARCHAR(255) NOT NULL,         -- encrypted Plaid access_token
  account_id      VARCHAR(255) NOT NULL,         -- Plaid account_id for debits
  account_name    VARCHAR(255) DEFAULT NULL,     -- "Business Checking ****1234"
  account_mask    VARCHAR(10)  DEFAULT NULL,     -- last 4 digits
  institution_id  VARCHAR(100) DEFAULT NULL,     -- Plaid institution ID
  institution_name VARCHAR(255) DEFAULT NULL,    -- "Chase", "Bank of America"
  consent_date    DATETIME     NOT NULL,         -- when merchant authorized
  status          ENUM('active','disconnected','revoked') DEFAULT 'active',
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_merchant_plaid (merchant_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### New Table: `plaid_transfers`
Tracks every funding transfer initiated via Plaid.

```sql
CREATE TABLE plaid_transfers (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  transfer_id         VARCHAR(255) NOT NULL,         -- Plaid transfer ID
  authorization_id    VARCHAR(255) NOT NULL,          -- Plaid authorization ID
  batch_id            VARCHAR(100) DEFAULT NULL,      -- links to existing payment_batches
  merchant_id         VARCHAR(100) NOT NULL,
  broker              VARCHAR(100) DEFAULT NULL,
  amount              DECIMAL(12,2) NOT NULL,
  currency            VARCHAR(3)  DEFAULT 'USD',
  type                ENUM('debit','credit') DEFAULT 'debit',
  network             VARCHAR(20) DEFAULT 'ach',       -- ach, same-day-ach, rtp
  ach_class           VARCHAR(10) DEFAULT 'ccd',       -- corporate credit/debit
  description         VARCHAR(255) DEFAULT NULL,
  status              VARCHAR(50)  DEFAULT 'pending',  -- pending, posted, settled, failed, returned
  failure_reason      TEXT         DEFAULT NULL,
  return_code         VARCHAR(10)  DEFAULT NULL,       -- R01, R02, etc.
  plaid_created_at    DATETIME     DEFAULT NULL,
  settled_at          DATETIME     DEFAULT NULL,
  idempotency_key     VARCHAR(50)  NOT NULL,
  order_ids           JSON         DEFAULT NULL,       -- array of order IDs in this transfer
  order_count         INT          DEFAULT 0,
  created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_transfer_id (transfer_id),
  UNIQUE KEY uq_idempotency (idempotency_key),
  INDEX idx_merchant (merchant_id),
  INDEX idx_batch (batch_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### New Table: `plaid_events`
Audit log of all Plaid webhook/sync events for reconciliation.

```sql
CREATE TABLE plaid_events (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  event_id        INT            NOT NULL,            -- Plaid event ID from /transfer/event/sync
  transfer_id     VARCHAR(255)   NOT NULL,
  event_type      VARCHAR(50)    NOT NULL,            -- pending, cancelled, failed, posted, settled, returned
  amount          DECIMAL(12,2)  DEFAULT NULL,
  failure_reason  TEXT           DEFAULT NULL,
  timestamp       DATETIME       NOT NULL,
  raw_json        JSON           DEFAULT NULL,
  created_at      DATETIME       DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_event_id (event_id),
  INDEX idx_transfer (transfer_id),
  INDEX idx_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Existing Table Changes

```sql
-- Add to merchant_master (or wherever merchant config lives)
ALTER TABLE merchant
  ADD COLUMN funding_method ENUM('manual_ach','plaid') DEFAULT 'manual_ach',
  ADD COLUMN plaid_onboarded_at DATETIME DEFAULT NULL;

-- Add to payment_batches (existing table)
ALTER TABLE payment_batches
  ADD COLUMN plaid_transfer_id VARCHAR(255) DEFAULT NULL,
  ADD COLUMN funding_method VARCHAR(20) DEFAULT 'manual_ach';
```

---

## PHP Backend Endpoints

### 1. `plaid-link-token.php` — Generate Link Token

Called by the merchant admin UI to initialize Plaid Link.

```php
<?php
// POST { merchant_id }
// Returns { success, link_token }

require_once 'PlaidClient.php';

$merchant_id = $input['merchant_id'] ?? '';

// Verify admin has access to this merchant
// ... auth check ...

$plaid = new PlaidClient();
$response = $plaid->createLinkToken([
    'user'     => ['client_user_id' => $merchant_id],
    'products' => ['transfer'],          // NOT 'auth' — Transfer handles it
    'country_codes' => ['US'],
    'language' => 'en',
    'client_name' => 'StockLoyal',
]);

json_response(['success' => true, 'link_token' => $response['link_token']]);
```

### 2. `plaid-exchange-token.php` — Exchange Public Token

Called after merchant completes Plaid Link. Stores the access token.

```php
<?php
// POST { merchant_id, public_token, account_id, account_name, account_mask,
//        institution_id, institution_name }
// Returns { success }

$plaid = new PlaidClient();
$exchange = $plaid->exchangePublicToken($input['public_token']);

$access_token = encrypt_value($exchange['access_token']); // AES-256

$db->prepare("
    INSERT INTO merchant_plaid
        (merchant_id, plaid_item_id, access_token, account_id,
         account_name, account_mask, institution_id, institution_name, consent_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
        plaid_item_id = VALUES(plaid_item_id),
        access_token = VALUES(access_token),
        account_id = VALUES(account_id),
        account_name = VALUES(account_name),
        account_mask = VALUES(account_mask),
        institution_id = VALUES(institution_id),
        institution_name = VALUES(institution_name),
        consent_date = NOW(),
        status = 'active'
")->execute([
    $merchant_id, $exchange['item_id'], $access_token,
    $input['account_id'], $input['account_name'] ?? null,
    $input['account_mask'] ?? null, $input['institution_id'] ?? null,
    $input['institution_name'] ?? null,
]);

// Update merchant funding method
$db->prepare("
    UPDATE merchant_master
    SET funding_method = 'plaid', plaid_onboarded_at = NOW()
    WHERE merchant_id = ?
")->execute([$merchant_id]);

json_response(['success' => true]);
```

### 3. `plaid-initiate-funding.php` — Create Transfer (Core)

Replaces `export-payments-file.php` for Plaid-enabled merchants. Called from PaymentsProcessing when admin clicks "Fund IB Account."

```php
<?php
// POST { merchant_id, broker, order_ids[], network: 'ach'|'same-day-ach' }
// Returns { success, transfer_id, authorization_id, status, amount, order_count }

$merchant_id = $input['merchant_id'];
$broker      = $input['broker'] ?? null;
$network     = $input['network'] ?? 'ach';

// 1. Verify merchant has Plaid connected
$mp = $db->query("SELECT * FROM merchant_plaid WHERE merchant_id = ? AND status = 'active'",
    [$merchant_id])->fetch();
if (!$mp) {
    json_error("Merchant does not have a linked bank account. Connect via Plaid first.");
}

$access_token = decrypt_value($mp['access_token']);
$account_id   = $mp['account_id'];

// 2. Get approved orders for this merchant+broker
$orders = get_approved_orders($merchant_id, $broker); // existing helper
if (empty($orders)) {
    json_error("No approved orders to fund.");
}

$total_amount = array_sum(array_map(fn($o) => floatval($o['payment_amount']), $orders));
$order_ids    = array_column($orders, 'order_id');

// 3. Generate idempotency key (prevents duplicate transfers on retry)
$idempotency_key = "SL-{$merchant_id}-" . date('Ymd-His') . "-" . substr(md5(json_encode($order_ids)), 0, 8);

// 4. Create transfer authorization (includes balance + risk check)
$plaid = new PlaidClient();

$auth_response = $plaid->createTransferAuthorization([
    'access_token' => $access_token,
    'account_id'   => $account_id,
    'type'         => 'debit',
    'network'      => $network,
    'amount'       => number_format($total_amount, 2, '.', ''),
    'ach_class'    => 'ccd',        // Corporate Credit or Debit
    'user'         => [
        'legal_name' => get_merchant_legal_name($merchant_id),
    ],
    'idempotency_key' => $idempotency_key . '-auth',
]);

$authorization = $auth_response['authorization'];

// 4a. Check if authorization was approved
if ($authorization['decision'] !== 'approved') {
    $rationale = $authorization['decision_rationale']['description'] ?? 'Unknown reason';
    json_error("Transfer authorization declined: {$rationale}");
}

// 5. Create the actual transfer
$transfer_response = $plaid->createTransfer([
    'authorization_id' => $authorization['id'],
    'access_token'     => $access_token,
    'account_id'       => $account_id,
    'type'             => 'debit',
    'network'          => $network,
    'amount'           => number_format($total_amount, 2, '.', ''),
    'description'      => "StockLoyal sweep {$merchant_id}" . ($broker ? " [{$broker}]" : ""),
    'ach_class'        => 'ccd',
    'user'             => [
        'legal_name' => get_merchant_legal_name($merchant_id),
    ],
    'idempotency_key'  => $idempotency_key,
]);

$transfer = $transfer_response['transfer'];

// 6. Create batch record (same as existing flow for compatibility)
$batch_id = create_payment_batch($merchant_id, $broker, $total_amount,
    count($orders), 'plaid', $transfer['id']);

// 7. Record in plaid_transfers
$db->prepare("
    INSERT INTO plaid_transfers
        (transfer_id, authorization_id, batch_id, merchant_id, broker,
         amount, network, ach_class, description, status,
         idempotency_key, order_ids, order_count, plaid_created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ccd', ?, ?, ?, ?, ?, ?)
")->execute([
    $transfer['id'], $authorization['id'], $batch_id,
    $merchant_id, $broker, $total_amount, $network,
    $transfer['description'], $transfer['status'],
    $idempotency_key, json_encode($order_ids), count($orders),
    $transfer['created'],
]);

// 8. Mark orders as funded (same as existing export-payments-file.php)
mark_orders_funded($order_ids, $batch_id);

json_response([
    'success'          => true,
    'transfer_id'      => $transfer['id'],
    'authorization_id' => $authorization['id'],
    'batch_id'         => $batch_id,
    'status'           => $transfer['status'],
    'amount'           => $total_amount,
    'order_count'      => count($orders),
    'network'          => $network,
    'expected_settlement' => $transfer['expected_settlement_date'] ?? null,
]);
```

### 4. `plaid-webhook.php` — Handle Transfer Events

Receives webhooks from Plaid when transfer status changes.

```php
<?php
// POST — Plaid webhook payload
// Verify webhook signature, then process events

$plaid = new PlaidClient();

// Verify the webhook (Plaid signs webhooks with JWK)
$body = file_get_contents('php://input');
$plaid->verifyWebhook($body, getallheaders());

$payload = json_decode($body, true);
$webhook_type = $payload['webhook_type'] ?? '';
$webhook_code = $payload['webhook_code'] ?? '';

if ($webhook_type === 'TRANSFER') {
    // Sync all new events since our last cursor
    sync_transfer_events($plaid);
}

http_response_code(200);
echo json_encode(['received' => true]);

function sync_transfer_events($plaid) {
    global $db;

    // Get our last synced event ID
    $last = $db->query("SELECT MAX(event_id) as max_id FROM plaid_events")->fetch();
    $after_id = $last['max_id'] ?? 0;

    $has_more = true;
    while ($has_more) {
        $response = $plaid->syncTransferEvents([
            'after_id' => $after_id,
            'count'    => 25,
        ]);

        foreach ($response['transfer_events'] as $event) {
            // Store event
            $db->prepare("
                INSERT IGNORE INTO plaid_events
                    (event_id, transfer_id, event_type, amount, failure_reason, timestamp, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $event['event_id'], $event['transfer_id'], $event['event_type'],
                $event['amount'] ?? null, $event['failure_reason']['description'] ?? null,
                $event['timestamp'], json_encode($event),
            ]);

            // Update transfer status
            update_transfer_status($event);
            $after_id = $event['event_id'];
        }

        $has_more = $response['has_more'] ?? false;
    }
}

function update_transfer_status($event) {
    global $db;

    $transfer_id = $event['transfer_id'];
    $new_status  = $event['event_type'];  // pending, posted, settled, failed, returned

    // Update plaid_transfers
    $updates = ['status' => $new_status, 'updated_at' => date('Y-m-d H:i:s')];

    if ($new_status === 'settled') {
        $updates['settled_at'] = $event['timestamp'];
    }
    if (in_array($new_status, ['failed', 'returned'])) {
        $updates['failure_reason'] = $event['failure_reason']['description'] ?? null;
        $updates['return_code']    = $event['failure_reason']['ach_return_code'] ?? null;
    }

    $set_clauses = implode(', ', array_map(fn($k) => "$k = ?", array_keys($updates)));
    $db->prepare("UPDATE plaid_transfers SET $set_clauses WHERE transfer_id = ?")
       ->execute([...array_values($updates), $transfer_id]);

    // Update linked payment batch + orders
    $pt = $db->query("SELECT * FROM plaid_transfers WHERE transfer_id = ?",
        [$transfer_id])->fetch();

    if (!$pt) return;

    if ($new_status === 'settled' && $pt['batch_id']) {
        // Mark orders as settled — ready for Stage 3 (journal to Alpaca)
        settle_payment_batch($pt['batch_id']);
    }

    if (in_array($new_status, ['failed', 'returned']) && $pt['batch_id']) {
        // Revert orders back to approved so admin can retry
        revert_payment_batch($pt['batch_id'], $event['failure_reason']['description'] ?? 'Transfer failed');
    }
}
```

### 5. `plaid-withdraw-ledger.php` — Move Funds to Sweep Account

After transfers settle in the Plaid Ledger, withdraw to StockLoyal's bank.

```php
<?php
// POST { amount, network: 'ach'|'same-day-ach'|'rtp' }
// Returns { success, sweep_id, amount }

// Admin-only endpoint
$amount  = floatval($input['amount'] ?? 0);
$network = $input['network'] ?? 'ach';

if ($amount <= 0) json_error("Amount must be positive.");

$plaid = new PlaidClient();

$response = $plaid->withdrawLedger([
    'amount'         => number_format($amount, 2, '.', ''),
    'network'        => $network,
    'idempotency_key' => 'SL-withdraw-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)),
    'description'    => 'StockLoyal IB sweep withdrawal',
]);

json_response([
    'success'  => true,
    'sweep_id' => $response['sweep']['id'] ?? null,
    'amount'   => $amount,
    'network'  => $network,
]);
```

### 6. `PlaidClient.php` — API Wrapper

```php
<?php
class PlaidClient {
    private string $baseUrl;
    private string $clientId;
    private string $secret;

    public function __construct() {
        $env = getenv('PLAID_ENV') ?: 'sandbox';
        $this->baseUrl = match($env) {
            'production' => 'https://production.plaid.com',
            'development' => 'https://development.plaid.com',  // ← testing with real banks
            default => 'https://sandbox.plaid.com',
        };
        $this->clientId = getenv('PLAID_CLIENT_ID');
        $this->secret   = getenv('PLAID_SECRET');
    }

    public function createLinkToken(array $params): array {
        return $this->post('/link/token/create', array_merge([
            'client_name' => 'StockLoyal',
        ], $params));
    }

    public function exchangePublicToken(string $publicToken): array {
        return $this->post('/item/public_token/exchange', [
            'public_token' => $publicToken,
        ]);
    }

    public function createTransferAuthorization(array $params): array {
        return $this->post('/transfer/authorization/create', $params);
    }

    public function createTransfer(array $params): array {
        return $this->post('/transfer/create', $params);
    }

    public function getTransfer(string $transferId): array {
        return $this->post('/transfer/get', ['transfer_id' => $transferId]);
    }

    public function syncTransferEvents(array $params): array {
        return $this->post('/transfer/event/sync', $params);
    }

    public function withdrawLedger(array $params): array {
        return $this->post('/transfer/ledger/withdraw', $params);
    }

    public function getLedgerBalance(): array {
        return $this->post('/transfer/balance/get', []);
    }

    // ── Internal HTTP ──

    private function post(string $endpoint, array $body): array {
        $body['client_id'] = $this->clientId;
        $body['secret']    = $this->secret;

        $ch = curl_init($this->baseUrl . $endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($body),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $data = json_decode($response, true);

        if ($httpCode >= 400 || isset($data['error_type'])) {
            $msg = $data['error_message'] ?? $data['display_message'] ?? "Plaid API error";
            throw new Exception("Plaid: {$msg} [{$data['error_code'] ?? $httpCode}]");
        }

        return $data;
    }
}
```

---

## Frontend Integration

### Merchant Bank Linking (Plaid Link)

Add a "Connect Bank Account" section to the Merchant Settings or a dedicated admin page. Uses Plaid's drop-in Link component.

```jsx
// MerchantBankLink.jsx — Plaid Link integration for merchant funding
import React, { useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { apiPost } from "../api.js";
import { Building2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function MerchantBankLink({ merchantId, existingBank, onLinked }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Get a link_token from your backend
  const initLink = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiPost("plaid-link-token.php", { merchant_id: merchantId });
      if (res?.success) setLinkToken(res.link_token);
      else setError(res?.error || "Failed to initialize bank connection.");
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle Plaid Link success
  const onSuccess = useCallback(async (publicToken, metadata) => {
    const account = metadata.accounts?.[0];
    try {
      await apiPost("plaid-exchange-token.php", {
        merchant_id:      merchantId,
        public_token:     publicToken,
        account_id:       account?.id,
        account_name:     account?.name,
        account_mask:     account?.mask,
        institution_id:   metadata.institution?.institution_id,
        institution_name: metadata.institution?.name,
      });
      onLinked?.({
        institution_name: metadata.institution?.name,
        account_name: account?.name,
        account_mask: account?.mask,
      });
    } catch (err) {
      setError("Failed to save bank connection.");
    }
  }, [merchantId, onLinked]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => { if (err) setError("Bank connection was cancelled."); },
  });

  // Auto-open Link when token arrives
  React.useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <div style={{ /* ... card styling ... */ }}>
      <h3><Building2 size={18} /> Funding Bank Account</h3>

      {existingBank ? (
        <div>
          <CheckCircle size={16} color="#10b981" />
          <strong>{existingBank.institution_name}</strong> ····{existingBank.account_mask}
          <button onClick={initLink}>Change</button>
        </div>
      ) : (
        <button onClick={initLink} disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : null}
          Connect Bank Account
        </button>
      )}

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
    </div>
  );
}
```

**Install dependency:**
```bash
npm install react-plaid-link
```

### PaymentsProcessing.jsx Changes

The existing `processBroker()` function gets a parallel Plaid path:

```jsx
// In PaymentsProcessing.jsx — updated processBroker function

const processBroker = async (mid, broker) => {
  try {
    // Check if this merchant uses Plaid funding
    const merchant = merchants.find(m => m.merchant_id === mid);
    const usePlaid = merchant?.funding_method === 'plaid';

    if (usePlaid) {
      // ── Plaid Transfer path ──
      const res = await apiPost("plaid-initiate-funding.php", {
        merchant_id: mid,
        broker,
        network: "ach",   // or "same-day-ach" if admin selects
      });
      return {
        merchant_id: mid, broker,
        success: res?.success || false,
        batch_id: res?.batch_id || null,
        transfer_id: res?.transfer_id || null,
        order_count: res?.order_count || 0,
        total_amount: res?.amount || 0,
        error: res?.error || null,
        method: 'plaid',
        expected_settlement: res?.expected_settlement || null,
        // No xlsx/csv files needed — funds move automatically
      };
    } else {
      // ── Legacy ACH CSV path (unchanged) ──
      const res = await apiPost("export-payments-file.php", { merchant_id: mid, broker });
      return {
        merchant_id: mid, broker,
        success: res?.success || false,
        batch_id: res?.batch_id || null,
        order_count: res?.order_count || 0,
        total_amount: res?.total_amount || 0,
        error: res?.error || null,
        xlsx: res?.xlsx || null,
        detail_csv: res?.detail_csv || null,
        ach_csv: res?.ach_csv || null,
        method: 'manual_ach',
      };
    }
  } catch (err) {
    return { merchant_id: mid, broker, success: false, error: err.message };
  }
};
```

The ResultsBanner would show different UI for Plaid vs manual:
- **Plaid:** "ACH debit initiated. Transfer ID: xxx. Expected settlement: March 3."
- **Manual:** Download XLSX / CSV links (existing behavior).

---

## Environment Configuration

Add to your `.env` or EC2 environment:

```bash
# Plaid API Credentials
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret_key
PLAID_ENV=sandbox                  # sandbox → development → production

# Plaid Webhook URL (configure in Plaid Dashboard)
PLAID_WEBHOOK_URL=https://api.stockloyal.com/api/plaid-webhook.php

# Encryption key for storing Plaid access tokens
PLAID_TOKEN_ENCRYPTION_KEY=your-32-byte-aes-key
```

---

## Plaid Dashboard Setup

1. **Sign up** at [dashboard.plaid.com](https://dashboard.plaid.com)
2. **Apply for Transfer** under Settings → Products
3. **Configure webhook URL** to `https://api.stockloyal.com/api/plaid-webhook.php`
4. **Set ACH SEC code** to `CCD` (Corporate Credit/Debit — appropriate for B2B merchant debits)
5. **Start in Sandbox**, then move to **Development** (real banks, test money), then **Production**

---

## Migration Strategy

### Phase 1: Parallel Operation
- Add `funding_method` column to `merchant_master`
- Default all existing merchants to `manual_ach`
- Build Plaid Link UI for merchant admin
- When a merchant connects their bank, flip to `plaid`
- PaymentsProcessing routes to the correct handler based on `funding_method`
- Existing manual ACH continues working for merchants who haven't connected

### Phase 2: Encourage Migration
- Show "Connect Bank for Automatic Funding" prompt on merchant dashboard
- Highlight benefits: faster settlement, no manual CSV downloads, real-time status

### Phase 3: Full Plaid
- Once all merchants connected, deprecate manual ACH CSV generation
- Remove ACH bank detail fields from broker_master (no longer needed)

---

## Security Considerations

- **Plaid access tokens** are stored AES-256 encrypted in MySQL, never logged
- **Webhook verification** uses Plaid's JWK signing to prevent spoofing
- **Idempotency keys** prevent duplicate transfers on retry
- **Authorization check** runs balance + risk scoring before every transfer
- **ACH return handling** automatically reverts orders if debit fails (R01 insufficient funds, etc.)
- **HTTPS only** — all Plaid API calls over TLS 1.2+

---

## Costs

Plaid Transfer pricing (as of 2025):
- **ACH debit:** ~$0.30–$1.00 per transfer (volume-dependent)
- **Same-Day ACH:** ~$1.50–$3.00 per transfer
- **RTP/FedNow:** ~$0.50–$1.00 per transfer (instant)
- **No monthly minimums** in most plans
- Contact Plaid sales for exact pricing for your volume

Compare to manual ACH: $0 in direct API fees, but factor in merchant labor, delayed settlement, and operational overhead of CSV file management.
