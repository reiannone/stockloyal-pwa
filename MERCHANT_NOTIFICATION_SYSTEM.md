# Merchant Notification System

## Overview
When members redeem points for stock purchases, the system automatically notifies the merchant so they can deduct points from their records.

## Flow Diagram

```
Member Places Order (Order.jsx)
    ↓
1. Orders Placed Successfully
    ↓
2. Wallet Updated (points deducted)
    ↓
3. Log Transaction in transactions_ledger
    ├─→ tx_type: "redeem_points"
    ├─→ amount_points: [points used]
    └─→ amount_cash: [total order value]
    ↓
4. Notify Merchant (notify_merchant.php)
    ├─→ Send Webhook (if configured)
    ├─→ Send Email (as fallback)
    └─→ Log in merchant_notifications table
```

## Implementation

### 1. Frontend (Order.jsx)

After successful order placement, two API calls are made:

```javascript
// Log points redemption in ledger
await apiPost("log-ledger.php", {
  member_id: memberId,
  merchant_id: merchantId,
  broker: broker,
  client_tx_id: `redeem_${memberId}_${basketId}_${Date.now()}`,
  tx_type: "redeem_points",
  amount_points: pointsUsed,
  amount_cash: totalAmount,
  note: `Points redeemed for stock purchase - Basket: ${basketId}`,
  member_timezone: memberTimezone
});

// Notify merchant
await apiPost("notify_merchant.php", {
  member_id: memberId,
  merchant_id: merchantId,
  points_redeemed: pointsUsed,
  cash_value: totalAmount,
  basket_id: basketId,
  transaction_type: "redeem",
  timestamp: new Date().toISOString()
});
```

### 2. Backend (notify_merchant.php)

The backend:
1. ✅ Looks up merchant webhook URL and API key
2. ✅ Retrieves member details
3. ✅ Logs notification attempt in `merchant_notifications` table
4. ✅ Sends webhook to merchant (if configured)
5. ✅ Sends email notification (as fallback)
6. ✅ Updates notification status (sent/failed)

### 3. Ledger Transaction

A record is created in `transactions_ledger`:

```sql
INSERT INTO transactions_ledger (
    member_id,
    merchant_id,
    broker,
    client_tx_id,
    tx_type,
    direction,
    channel,
    status,
    amount_points,
    amount_cash,
    note,
    member_timezone
) VALUES (
    'member123',
    'merchant001',
    'Robinhood',
    'redeem_member123_basket-123456_1234567890',
    'redeem_points',      -- tx_type enum
    'outbound',           -- points leaving member
    'Broker API',         -- channel
    'confirmed',          -- status
    5000,                 -- points redeemed
    50.00,                -- cash value
    'Points redeemed for stock purchase - Basket: basket-123456',
    'America/New_York'
);
```

## Database Schema

### merchant table (updates)

```sql
ALTER TABLE merchant 
ADD COLUMN webhook_url VARCHAR(500) NULL,
ADD COLUMN api_key VARCHAR(255) NULL;
```

### merchant_notifications table (new)

```sql
CREATE TABLE merchant_notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    merchant_id VARCHAR(30) NOT NULL,
    member_id VARCHAR(50) NOT NULL,
    event_type ENUM('points_received', 'points_redeemed', 'points_adjusted') NOT NULL,
    points_amount INT NULL,
    cash_amount DECIMAL(15,2) NULL,
    basket_id VARCHAR(50) NULL,
    payload JSON NULL,
    status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
    response_code INT NULL,
    response_body TEXT NULL,
    error_message VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    
    INDEX idx_merchant (merchant_id),
    INDEX idx_member (member_id),
    INDEX idx_status (status)
);
```

## Webhook Payload

When a merchant has a `webhook_url` configured, they receive:

```json
{
  "event": "points_redeemed",
  "merchant_id": "merchant001",
  "member_id": "member123",
  "member_email": "user@example.com",
  "member_name": "John Doe",
  "member_tier": "Gold",
  "points_redeemed": 5000,
  "cash_value": 50.00,
  "basket_id": "basket-123456-789",
  "transaction_type": "redeem",
  "timestamp": "2026-01-15T14:30:00.000Z"
}
```

### Webhook Headers

```
Content-Type: application/json
User-Agent: StockLoyal/1.0
X-API-Key: [merchant's API key if configured]
```

## Email Notification

If webhook fails or is not configured, an email is sent to `merchant_email`:

```
Subject: Points Redemption - Member member123

A member has redeemed points:

Member ID: member123
Member Email: user@example.com
Points Redeemed: 5,000
Cash Value: $50.00
Basket ID: basket-123456-789
Timestamp: 2026-01-15T14:30:00.000Z
```

## Error Handling

**Important:** Merchant notification failures DO NOT fail the order.

- ✅ Order is placed successfully
- ✅ Wallet is updated
- ✅ Ledger transaction is logged
- ⚠️ If merchant notification fails, it's logged but doesn't affect the order

This ensures members can always complete their purchases even if the merchant's webhook is down.

## Merchant Configuration

To enable notifications, merchants need to provide:

1. **webhook_url** - Their endpoint to receive notifications
2. **api_key** (optional) - For webhook authentication
3. **merchant_email** - For email fallback notifications

Example:

```sql
UPDATE merchant 
SET webhook_url = 'https://merchant.com/api/stockloyal/webhook',
    api_key = 'sk_live_abc123xyz789',
    merchant_email = 'loyalty@merchant.com'
WHERE merchant_id = 'merchant001';
```

## Testing

### 1. Test Order Flow

```javascript
// Place order with points
// Check console logs:
console.log("[Order] Ledger transaction logged:", clientTxId);
console.log("[Order] Merchant notified of points redemption");
```

### 2. Verify Database

```sql
-- Check ledger transaction
SELECT * FROM transactions_ledger 
WHERE member_id = 'member123' 
AND tx_type = 'redeem_points'
ORDER BY created_at DESC LIMIT 1;

-- Check notification log
SELECT * FROM merchant_notifications
WHERE member_id = 'member123'
ORDER BY created_at DESC LIMIT 1;
```

### 3. Test Webhook

Use a webhook testing service like https://webhook.site:

```sql
UPDATE merchant 
SET webhook_url = 'https://webhook.site/your-unique-url'
WHERE merchant_id = 'merchant001';
```

Then place an order and check webhook.site for the payload.

## Files Modified/Created

### Frontend
- ✅ **Order.jsx** - Added ledger logging and merchant notification

### Backend
- ✅ **notify_merchant.php** (NEW) - Handles merchant notifications
- ✅ **log-ledger.php** (EXISTING) - Logs redemption transactions

### Database
- ✅ **migration_merchant_notifications.sql** - Database changes

### Documentation
- ✅ **MERCHANT_NOTIFICATION_SYSTEM.md** - This file

## Security Considerations

1. **API Key Protection** - Merchant API keys are sent in headers, not body
2. **SSL/TLS Required** - Webhooks use HTTPS only (`curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true)`)
3. **Timeout Protection** - 10 second timeout prevents hanging
4. **Error Isolation** - Notification failures don't affect orders
5. **Data Validation** - All inputs validated before processing

## Monitoring

Query failed notifications:

```sql
SELECT 
    merchant_id,
    COUNT(*) as failed_count,
    MAX(created_at) as last_failure
FROM merchant_notifications
WHERE status = 'failed'
GROUP BY merchant_id
ORDER BY failed_count DESC;
```

## Next Steps

1. ✅ Deploy database migration
2. ✅ Deploy notify_merchant.php
3. ✅ Deploy updated Order.jsx
4. ✅ Configure merchant webhook URLs
5. ✅ Test with sample orders
6. ✅ Monitor merchant_notifications table
