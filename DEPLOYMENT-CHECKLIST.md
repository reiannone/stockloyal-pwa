# StockLoyal Webhook Receiver - Deployment Checklist

## 📦 Files to Deploy

```
/app.stockloyal.com/webhooks/
├── stockloyal-receiver.php      ← Main webhook receiver (REQUIRED)
├── webhook-admin.php             ← Admin dashboard (optional)
├── cors.php                      ← CORS handler (REQUIRED - if not exists)
├── config.php                    ← Database connection (REQUIRED)
├── _loadenv.php                  ← Environment loader (optional)
├── logs/                         ← Log directory (REQUIRED)
│   ├── receive/                  ← Receive logs
│   ├── ack/                      ← ACK logs
│   └── dedupe/                   ← Deduplication markers
└── .env                          ← Environment variables (REQUIRED)
```

## ✅ Pre-Deployment Checklist

### 1. Environment Setup
- [ ] Generate secure webhook secret (32+ bytes)
  ```bash
  php -r "echo bin2hex(random_bytes(32));"
  ```
- [ ] Create `.env` file with:
  ```bash
  STOCKLOYAL_WEBHOOK_SECRET=your_generated_secret_here
  ENVIRONMENT=production
  WEBHOOK_RATE_LIMIT=60
  ```
- [ ] Set environment variables in hosting panel (or use `.env`)

### 2. Database Setup
- [ ] Create `webhook_logs` table
  ```bash
  mysql -u your_user -p your_database < webhook_logs_schema.sql
  ```
- [ ] Verify table exists:
  ```sql
  SHOW TABLES LIKE 'webhook_logs';
  DESCRIBE webhook_logs;
  ```
- [ ] Test database connection in `config.php`
  ```bash
  php -r "require 'config.php'; var_dump($pdo);"
  ```

### 3. File Upload
- [ ] Upload all files to `/webhooks/` directory
- [ ] Verify file permissions:
  ```bash
  chmod 755 stockloyal-receiver.php
  chmod 755 webhook-admin.php
  chmod 775 logs/
  chmod 775 logs/receive/
  chmod 775 logs/ack/
  chmod 775 logs/dedupe/
  ```
- [ ] Set ownership to web server user:
  ```bash
  chown -R www-data:www-data logs/
  ```

### 4. Security Configuration
- [ ] Verify HTTPS is enabled
  ```bash
  curl -I https://app.stockloyal.com/webhooks/stockloyal-receiver.php
  ```
- [ ] Test CORS preflight works:
  ```bash
  curl -X OPTIONS https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
    -H "Origin: https://example.com"
  ```
- [ ] Add authentication to `webhook-admin.php` (CRITICAL!)
  ```php
  // At top of webhook-admin.php
  session_start();
  if (!isset($_SESSION['admin']) || $_SESSION['admin'] !== true) {
      http_response_code(403);
      die('Access denied');
  }
  ```

### 5. Testing
- [ ] Test basic authentication:
  ```bash
  curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your_secret" \
    -d '{"test":true}'
  ```
- [ ] Test signature verification:
  ```bash
  ./test-webhook.sh
  ```
- [ ] Test idempotency (send same request_id twice)
- [ ] Test rate limiting (send 65+ requests rapidly)
- [ ] Test admin dashboard access

### 6. Monitoring Setup
- [ ] Set up log monitoring:
  ```bash
  tail -f logs/receive/receiver_$(date +%Y-%m-%d).log
  ```
- [ ] Configure cron jobs for cleanup:
  ```cron
  # Daily dedupe cleanup (3 AM)
  0 3 * * * find /path/to/webhooks/logs/dedupe -name "*.seen" -mtime +7 -delete
  
  # Weekly database cleanup (Sunday 2 AM)
  0 2 * * 0 mysql -u user -p'pass' stockloyal -e "CALL cleanup_old_webhook_logs(90);"
  
  # Monthly log file cleanup (1st of month, 4 AM)
  0 4 1 * * find /path/to/webhooks/logs/receive -name "*.log" -mtime +30 -delete
  0 4 1 * * find /path/to/webhooks/logs/ack -name "*.log" -mtime +30 -delete
  ```
- [ ] Set up alerts for errors:
  ```bash
  # Check for auth failures
  grep UNAUTHORIZED logs/receive/*.log | mail -s "Webhook Auth Failures" admin@stockloyal.com
  ```

### 7. Documentation
- [ ] Share webhook URL with team:
  ```
  https://app.stockloyal.com/webhooks/stockloyal-receiver.php
  ```
- [ ] Share API key securely (use password manager)
- [ ] Document event types your system will send
- [ ] Create integration guide for merchants

## 🚀 Quick Start (5 Minutes)

### For First-Time Setup:

```bash
# 1. Generate secret
SECRET=$(php -r "echo bin2hex(random_bytes(32));")
echo "Your webhook secret: $SECRET"

# 2. Create .env file
cat > .env << EOF
STOCKLOYAL_WEBHOOK_SECRET=$SECRET
ENVIRONMENT=production
WEBHOOK_RATE_LIMIT=60
EOF

# 3. Create database table
mysql -u your_user -p your_database < webhook_logs_schema.sql

# 4. Create directories
mkdir -p logs/{receive,ack,dedupe}
chmod -R 775 logs/
chown -R www-data:www-data logs/

# 5. Test
curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SECRET" \
  -d '{"event_type":"test.deployment","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'

# Expected: {"success":true, ...}
```

## 🔍 Post-Deployment Verification

### Check 1: Endpoint is Accessible
```bash
curl -I https://app.stockloyal.com/webhooks/stockloyal-receiver.php
# Expected: HTTP/2 200 or 401 (not 404 or 500)
```

### Check 2: Authentication Works
```bash
curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "X-API-Key: $STOCKLOYAL_WEBHOOK_SECRET" \
  -d '{"test":true}'
# Expected: {"success":true}
```

### Check 3: Logs are Being Written
```bash
ls -lh logs/receive/
# Expected: receiver_YYYY-MM-DD.log file exists

tail -1 logs/receive/receiver_$(date +%Y-%m-%d).log
# Expected: Recent log entry
```

### Check 4: Database is Logging
```bash
mysql -u user -p database -e "SELECT COUNT(*) FROM webhook_logs;"
# Expected: Count > 0 after sending test webhooks
```

### Check 5: Admin Dashboard Works
```bash
curl -I https://app.stockloyal.com/webhooks/admin.php
# Expected: HTTP/2 200 (after adding authentication)
```

## 📊 Monitoring Commands

### View Recent Webhooks
```bash
tail -20 logs/receive/receiver_$(date +%Y-%m-%d).log
```

### Count Today's Webhooks
```bash
grep RECEIVED logs/receive/receiver_$(date +%Y-%m-%d).log | wc -l
```

### View Failed Signatures
```bash
grep BAD_SIGNATURE logs/receive/*.log
```

### View Unauthorized Attempts
```bash
grep UNAUTHORIZED logs/receive/*.log
```

### Check Database Statistics
```sql
-- Today's webhooks
SELECT COUNT(*) FROM webhook_logs 
WHERE DATE(received_at) = CURDATE();

-- By event type
SELECT event_type, COUNT(*) as count 
FROM webhook_logs 
WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY event_type 
ORDER BY count DESC;

-- Verification rate
SELECT 
  COUNT(*) as total,
  SUM(signature_verified) as verified,
  ROUND(SUM(signature_verified) / COUNT(*) * 100, 2) as rate_percent
FROM webhook_logs
WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR);
```

## 🐛 Troubleshooting Guide

### Issue: 401 Unauthorized
**Cause:** Invalid API key
**Fix:**
```bash
# Verify secret matches
echo $STOCKLOYAL_WEBHOOK_SECRET
# Test with correct key
curl -X POST $WEBHOOK_URL -H "X-API-Key: $correct_key" -d '{}'
```

### Issue: 401 Invalid Signature
**Cause:** Signature mismatch
**Fix:**
```php
// Ensure signature is calculated on exact JSON
$payload = json_encode($data, JSON_UNESCAPED_SLASHES);
$signature = hash_hmac('sha256', $payload, $secret);
```

### Issue: Logs Not Writing
**Cause:** Permission issues
**Fix:**
```bash
chmod -R 775 logs/
chown -R www-data:www-data logs/
# Test write
sudo -u www-data touch logs/receive/test.log
```

### Issue: Database Not Logging
**Cause:** Missing table or connection error
**Fix:**
```bash
# Check table exists
mysql -u user -p -e "USE database; SHOW TABLES LIKE 'webhook_logs';"
# Test connection
php -r "require 'config.php'; echo 'OK';"
```

### Issue: Rate Limiting Too Strict
**Cause:** High traffic volume
**Fix:**
```bash
# Increase limit in .env
echo "WEBHOOK_RATE_LIMIT=120" >> .env
# Or edit stockloyal-receiver.php directly
```

## 📞 Support Contacts

- **Technical Issues:** engineering@stockloyal.com
- **Security Concerns:** security@stockloyal.com
- **Documentation:** docs.stockloyal.com/webhooks

## 🔄 Update Procedure

When updating the webhook receiver:

1. **Backup current version:**
   ```bash
   cp stockloyal-receiver.php stockloyal-receiver.php.backup-$(date +%Y%m%d)
   ```

2. **Upload new version**

3. **Test immediately:**
   ```bash
   ./test-webhook.sh
   ```

4. **Monitor logs for errors:**
   ```bash
   tail -f logs/receive/receiver_$(date +%Y-%m-%d).log
   ```

5. **Rollback if needed:**
   ```bash
   cp stockloyal-receiver.php.backup-YYYYMMDD stockloyal-receiver.php
   ```

## ✨ Success Indicators

Your webhook receiver is working correctly when:

- ✅ Test webhooks return `{"success":true}`
- ✅ Logs show `RECEIVED` entries
- ✅ Database has entries in `webhook_logs` table
- ✅ Admin dashboard shows recent webhooks
- ✅ Signature verification passes
- ✅ Idempotency prevents duplicates
- ✅ Rate limiting activates after threshold
- ✅ No unauthorized attempts in logs

---

**Deployment Date:** _________________

**Deployed By:** _________________

**Webhook URL:** https://app.stockloyal.com/webhooks/stockloyal-receiver.php

**Environment:** ☐ Development  ☐ Staging  ☑ Production

**Notes:**
_____________________________________________________________________________
_____________________________________________________________________________
_____________________________________________________________________________
