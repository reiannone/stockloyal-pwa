# StockLoyal Webhook Duplicate Fix - Deployment Guide

## Overview

This fix addresses two critical issues in your existing StockLoyal infrastructure:

1. **Duplicate ledger entries** for `points_received` transactions
2. **404 errors** when external systems send webhooks to StockLoyal

## What Changed

### Files Modified:
1. **api/log-ledger.php** - Added duplicate prevention BEFORE insert (not after)
2. **webhooks/stockloyal-receiver.php** - NEW inbound webhook receiver
3. **.htaccess** - Updated routing to prevent React from catching webhook URLs

### Files Unchanged (Your Existing System):
- ✅ api/webhook-admin.php
- ✅ api/webhook-config.php
- ✅ api/webhook-stats.php
- ✅ api/webhook-logs.php
- ✅ api/get-broker-notifications.php
- ✅ api/retry-broker-notification.php
- ✅ All other API endpoints

## Understanding the Problem

### Problem 1: Duplicate Ledger Entries

**Your current log-ledger.php (lines 140-142):**
```php
} catch (PDOException $e) {
    // Check for duplicate client_tx_id
    if ($e->getCode() == 23000 && strpos($e->getMessage(), 'client_tx_id') !== false) {
        echo json_encode(["success" => false, "error" => "Duplicate transaction ID"]);
    }
```

**Issue:** This catches duplicates AFTER the INSERT fails, causing:
- Error returned to caller (makes them think it failed)
- No graceful handling of retries/race conditions
- Webhook senders retry on "failure", creating more duplicate attempts

**Fixed approach:**
```php
// Check BEFORE insert
$checkStmt = $conn->prepare("SELECT tx_id FROM transactions_ledger WHERE client_tx_id = ? LIMIT 1");
$checkStmt->execute([$clientTxId]);
$existing = $checkStmt->fetch();

if ($existing) {
    // Return SUCCESS with duplicate flag (idempotent)
    echo json_encode(["success" => true, "duplicate" => true, "tx_id" => $existing['tx_id']]);
    exit;
}

// No duplicate - proceed with insert
```

### Problem 2: 404 on Webhook URLs

**Current issue:** Apache routes `webhooks/stockloyal-receiver.php` to React's index.html

**Why:** Your .htaccess probably has rules like:
```apache
RewriteRule ^ index.html [L]  # Catches everything!
```

**Fix:** Add explicit rules BEFORE React fallback:
```apache
RewriteRule ^webhooks/stockloyal-receiver\.php$ webhooks/stockloyal-receiver.php [L,QSA]
# ... then React fallback
```

## Deployment Steps

### Step 1: Backup Current Files

```bash
# SSH into your server
ssh -i your-key.pem ec2-user@your-server

# Navigate to web root
cd /var/www/html

# Backup current files
cp api/log-ledger.php api/log-ledger.php.backup.$(date +%Y%m%d)
cp .htaccess .htaccess.backup.$(date +%Y%m%d)

# Verify backups exist
ls -la api/log-ledger.php.backup*
ls -la .htaccess.backup*
```

### Step 2: Create Webhooks Directory

```bash
# Create webhooks directory if it doesn't exist
mkdir -p /var/www/html/webhooks

# Set proper permissions
chmod 755 /var/www/html/webhooks
chown apache:apache /var/www/html/webhooks  # or www-data:www-data on Ubuntu
```

### Step 3: Create Logs Directory

```bash
# Create logs directory
mkdir -p /var/www/html/logs

# Set proper permissions
chmod 755 /var/www/html/logs
chown apache:apache /var/www/html/logs
```

### Step 4: Upload New Files

**Option A: Using SCP**
```bash
# From your local machine
scp -i your-key.pem stockloyal-receiver.php ec2-user@your-server:/tmp/
scp -i your-key.pem log-ledger.php ec2-user@your-server:/tmp/
scp -i your-key.pem .htaccess-updated ec2-user@your-server:/tmp/

# On server, move files to correct locations
ssh -i your-key.pem ec2-user@your-server
sudo mv /tmp/stockloyal-receiver.php /var/www/html/webhooks/
sudo mv /tmp/log-ledger.php /var/www/html/api/
sudo mv /tmp/.htaccess-updated /var/www/html/.htaccess

# Set permissions
sudo chown apache:apache /var/www/html/webhooks/stockloyal-receiver.php
sudo chown apache:apache /var/www/html/api/log-ledger.php
sudo chown apache:apache /var/www/html/.htaccess
sudo chmod 644 /var/www/html/webhooks/stockloyal-receiver.php
sudo chmod 644 /var/www/html/api/log-ledger.php
sudo chmod 644 /var/www/html/.htaccess
```

**Option B: Using Git**
```bash
# On your server
cd /var/www/html

# Pull latest changes
git pull origin main

# Or manually copy from repo
# git checkout origin/main -- webhooks/stockloyal-receiver.php api/log-ledger.php .htaccess
```

### Step 5: Verify Apache Configuration

```bash
# Check if mod_rewrite is enabled
apache2ctl -M | grep rewrite
# Should show: rewrite_module (shared)

# If not enabled:
sudo a2enmod rewrite
sudo systemctl restart apache2

# Test Apache config
sudo apache2ctl configtest
# Should show: Syntax OK
```

### Step 6: Verify AllowOverride Setting

```bash
# Check Apache config for .htaccess support
sudo cat /etc/apache2/sites-available/000-default.conf | grep -A5 "Directory"

# Should contain:
# <Directory /var/www/html>
#     AllowOverride All
# </Directory>

# If not present, add it:
sudo nano /etc/apache2/sites-available/000-default.conf
```

Add this inside `<VirtualHost *:80>`:
```apache
<Directory /var/www/html>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
```

```bash
# Restart Apache
sudo systemctl restart apache2
```

### Step 7: Test the Deployment

**Test 1: Verify Files Exist**
```bash
curl -I https://yourdomain.com/webhooks/stockloyal-receiver.php
# Expected: 405 Method Not Allowed (because it requires POST)

curl -I https://yourdomain.com/api/log-ledger.php
# Expected: 405 Method Not Allowed (because it requires POST)
```

**Test 2: Send Test Webhook**
```bash
curl -X POST https://yourdomain.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $(grep STOCKLOYAL_WEBHOOK_SECRET /var/www/html/.env | cut -d= -f2)" \
  -d '{
    "event_type": "test.connection",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'

# Expected response:
# {"success":true,"request_id":"wh_...","event_type":"test.connection","timestamp":"..."}
```

**Test 3: Send Duplicate Transactions**
```bash
# First transaction
curl -X POST https://yourdomain.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-webhook-secret" \
  -d '{
    "event_type": "points_received",
    "member_id": "TEST_MEMBER_001",
    "merchant_id": "TEST_MERCHANT",
    "points": 1000,
    "transaction_id": "duplicate-test-'$(date +%s)'",
    "note": "Test duplicate prevention"
  }'

# Save the transaction_id from response, then send again with SAME transaction_id
curl -X POST https://yourdomain.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-webhook-secret" \
  -d '{
    "event_type": "points_received",
    "member_id": "TEST_MEMBER_001",
    "merchant_id": "TEST_MERCHANT",
    "points": 1000,
    "transaction_id": "duplicate-test-SAME-ID-AS-ABOVE",
    "note": "Test duplicate prevention"
  }'

# Second response should show: "duplicate": true
```

**Test 4: Check Database**
```sql
-- Connect to database
mysql -u root -p stockloyal

-- Check for duplicates (should be 0)
SELECT 
    client_tx_id, 
    COUNT(*) as count
FROM transactions_ledger 
WHERE client_tx_id LIKE '%duplicate-test%'
GROUP BY client_tx_id
HAVING count > 1;

-- Should return: Empty set (no duplicates!)
```

**Test 5: Check Logs**
```bash
# View webhook logs
tail -50 /var/www/html/logs/webhook-inbound.log

# Should see entries like:
# [2025-01-28 10:30:15] Inbound webhook received from 1.2.3.4
# [2025-01-28 10:30:15] Processing points_received: member=TEST_MEMBER_001, points=1000, client_tx_id=merchant_TEST_MERCHANT_duplicate-test-1234567890
# [2025-01-28 10:30:15] ✅ Ledger entry created: tx_id=123, client_tx_id=merchant_TEST_MERCHANT_duplicate-test-1234567890
# [2025-01-28 10:30:20] ✅ DUPLICATE PREVENTED: Transaction merchant_TEST_MERCHANT_duplicate-test-1234567890 already exists (tx_id: 123)
```

### Step 8: Update Webhook Configuration

Update your merchant/broker webhook URLs to point to new endpoint:

**Before:**
```
https://yourdomain.com/api/some-old-endpoint.php
```

**After:**
```
https://yourdomain.com/webhooks/stockloyal-receiver.php
```

**In webhook-config table or .env file:**
```bash
# Update environment variable
echo "WEBHOOK_URL=https://yourdomain.com/webhooks/stockloyal-receiver.php" >> /var/www/html/.env

# Or update in webhook_config table
mysql -u root -p stockloyal -e "UPDATE webhook_config SET webhook_url = 'https://yourdomain.com/webhooks/stockloyal-receiver.php' WHERE id = 1;"
```

### Step 9: Monitor Production

**Watch for Duplicates**
```bash
# Every 5 minutes, check for duplicates
watch -n 300 'mysql -u root -p"password" stockloyal -e "
SELECT 
    client_tx_id, 
    COUNT(*) as dup_count,
    tx_type,
    created_at
FROM transactions_ledger
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY client_tx_id, tx_type
HAVING dup_count > 1
ORDER BY created_at DESC
LIMIT 10
"'
```

**Watch Webhook Logs**
```bash
tail -f /var/www/html/logs/webhook-inbound.log | grep -E "(DUPLICATE|ERROR|✅)"
```

**Monitor Apache Error Log**
```bash
tail -f /var/log/apache2/error.log | grep -i webhook
```

## Rollback Instructions

If something goes wrong:

```bash
# Stop Apache (optional, for safety)
sudo systemctl stop apache2

# Restore original files
sudo cp /var/www/html/api/log-ledger.php.backup.YYYYMMDD /var/www/html/api/log-ledger.php
sudo cp /var/www/html/.htaccess.backup.YYYYMMDD /var/www/html/.htaccess

# Remove new webhook receiver (optional)
sudo rm /var/www/html/webhooks/stockloyal-receiver.php

# Restart Apache
sudo systemctl start apache2

# Verify services
curl -I https://yourdomain.com/api/log-ledger.php
```

## Clean Up Existing Duplicates

After deployment, clean up any existing duplicates:

```bash
# Download cleanup script to server
scp -i your-key.pem cleanup-duplicate-ledger-entries.sql ec2-user@your-server:/tmp/

# Run cleanup
mysql -u root -p stockloyal < /tmp/cleanup-duplicate-ledger-entries.sql
```

**Important:** Review the output carefully before uncommenting the DELETE statements!

## Environment Variables

Ensure these are set in `/var/www/html/.env`:

```bash
# Webhook configuration
WEBHOOK_URL=https://yourdomain.com/webhooks/stockloyal-receiver.php
STOCKLOYAL_WEBHOOK_SECRET=your-secret-key-here-min-32-chars

# Database configuration (existing)
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_NAME=stockloyal
DB_USER=stockloyal_user
DB_PASS=your-db-password

# Environment
ENVIRONMENT=production
```

## Integration with Existing Order Flow

Your existing Order.jsx already calls `api/log-ledger.php` (line 195):

```javascript
const ledgerRes = await apiPost("log-ledger.php", ledgerPayload);
```

✅ **No changes needed!** The updated log-ledger.php is backward compatible.

The duplicate prevention will now work automatically for:
- ✅ Points redemption (outbound) - via Order.jsx → log-ledger.php
- ✅ Points received (inbound) - via webhook → stockloyal-receiver.php → log-ledger.php

## Testing Checklist

Before marking as complete:

- [ ] Can access webhook endpoint (not 404)
- [ ] Test webhook returns success
- [ ] Duplicate webhook returns success with `duplicate: true`
- [ ] Only ONE ledger entry created per transaction
- [ ] Webhook logs show "DUPLICATE PREVENTED" message
- [ ] Apache error log has no errors
- [ ] Existing Order.jsx flow still works
- [ ] Member wallet balances are correct

## Support & Troubleshooting

See `WEBHOOK_DEBUGGING_GUIDE.md` for:
- Common error messages and solutions
- Diagnostic SQL queries
- Log file locations
- Real-time monitoring commands

## Summary

✅ **Fixed:** Duplicate ledger entries prevented by checking BEFORE insert  
✅ **Fixed:** 404 errors resolved by explicit .htaccess rules  
✅ **Backward Compatible:** Existing API calls still work  
✅ **Production Ready:** Comprehensive logging and error handling  
✅ **Idempotent:** Webhooks can be retried safely  

Your StockLoyal webhook infrastructure is now production-grade!
