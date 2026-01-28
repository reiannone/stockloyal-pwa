# Webhook Debugging Quick Reference

## Quick Diagnostic Commands

### Check if webhook endpoint is accessible
```bash
curl -I http://localhost/stockloyal/webhook-receiver.php
# Expected: 200 OK or 405 Method Not Allowed (GET not supported)
```

### Send test webhook
```bash
curl -X POST http://localhost/stockloyal/webhook-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key" \
  -d '{"event_type":"test.connection","timestamp":"2025-01-28T10:00:00Z"}'
```

### Check for duplicate transactions
```sql
SELECT 
    client_tx_id, 
    COUNT(*) as count,
    GROUP_CONCAT(tx_id) as tx_ids
FROM transactions_ledger 
WHERE tx_type = 'points_received'
    AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY client_tx_id 
HAVING count > 1;
```

### View recent webhook logs
```bash
tail -50 /var/www/html/logs/webhook-receiver.log
```

### Search for specific transaction
```bash
grep "client_tx_id=merchant_MERCH001_tx123" /var/www/html/logs/webhook-receiver.log
```

## Common Issues & Solutions

### Issue: 404 Not Found on webhook URL

**Symptoms:**
- Webhook POST returns 404
- Apache error log shows "File not found"
- React app catches the request instead

**Diagnosis:**
```bash
# Check if PHP file exists
ls -la /var/www/html/webhook-receiver.php

# Check .htaccess exists and is readable
ls -la /var/www/html/.htaccess

# Check Apache config allows .htaccess
grep -r "AllowOverride" /etc/apache2/sites-enabled/
```

**Solutions:**

1. **Enable .htaccess processing:**
```apache
# In /etc/apache2/sites-available/000-default.conf
<Directory /var/www/html>
    AllowOverride All
</Directory>
```

2. **Restart Apache:**
```bash
sudo systemctl restart apache2
```

3. **Verify mod_rewrite is enabled:**
```bash
sudo a2enmod rewrite
sudo systemctl restart apache2
```

### Issue: Duplicate ledger entries

**Symptoms:**
- Multiple transactions with same client_tx_id
- Member point balances incorrect
- Webhook logs show same request processed twice

**Diagnosis:**
```sql
-- Find duplicates
SELECT 
    client_tx_id,
    COUNT(*) as dup_count,
    GROUP_CONCAT(tx_id) as all_tx_ids,
    GROUP_CONCAT(created_at) as all_timestamps
FROM transactions_ledger
WHERE tx_type = 'points_received'
GROUP BY client_tx_id
HAVING dup_count > 1
ORDER BY MAX(created_at) DESC
LIMIT 20;
```

**Solutions:**

1. **Check if new webhook-receiver.php is deployed:**
```bash
grep "DUPLICATE PREVENTED" /var/www/html/webhook-receiver.php
# Should find the duplicate check code
```

2. **Check webhook logs for duplicate prevention:**
```bash
grep "DUPLICATE PREVENTED" /var/www/html/logs/webhook-receiver.log
```

3. **Clean up existing duplicates:**
```bash
mysql -u root -p stockloyal < cleanup-duplicate-ledger-entries.sql
```

### Issue: Webhook not logging

**Symptoms:**
- No entries in logs/webhook-receiver.log
- No database entries in webhook_logs table
- Webhooks seem to disappear

**Diagnosis:**
```bash
# Check log file exists and is writable
ls -la /var/www/html/logs/webhook-receiver.log

# Check directory permissions
ls -ld /var/www/html/logs/

# Check PHP error log
tail -50 /var/log/apache2/error.log | grep webhook
```

**Solutions:**

1. **Create logs directory:**
```bash
mkdir -p /var/www/html/logs
chmod 755 /var/www/html/logs
chown apache:apache /var/www/html/logs  # or www-data:www-data
```

2. **Enable PHP error logging:**
```php
// Add to top of webhook-receiver.php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
```

### Issue: Database connection errors

**Symptoms:**
- "Connection failed" in webhook logs
- "PDO connection error" in PHP error log
- Webhooks fail silently

**Diagnosis:**
```bash
# Check database credentials in db.php
cat /var/www/html/db.php | grep -A5 "new PDO"

# Test database connection
mysql -h localhost -u stockloyal_user -p stockloyal
```

**Solutions:**

1. **Verify database credentials:**
```php
// In db.php
$host = 'localhost';
$db = 'stockloyal';
$user = 'stockloyal_user';
$pass = 'your_password';
```

2. **Grant proper permissions:**
```sql
GRANT ALL PRIVILEGES ON stockloyal.* TO 'stockloyal_user'@'localhost';
FLUSH PRIVILEGES;
```

### Issue: Missing webhook_logs table

**Symptoms:**
- "Table doesn't exist" error in webhook logs
- SQL error: "Table 'stockloyal.webhook_logs' doesn't exist"

**Solution:**
```sql
CREATE TABLE IF NOT EXISTS webhook_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    source_ip VARCHAR(45),
    payload TEXT,
    signature_verified TINYINT(1) DEFAULT 0,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    INDEX idx_event_type (event_type),
    INDEX idx_received_at (received_at),
    INDEX idx_request_id (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Monitoring Queries

### Check webhook activity (last 24 hours)
```sql
SELECT 
    event_type,
    COUNT(*) as total_requests,
    SUM(signature_verified) as verified_requests,
    MIN(received_at) as first_request,
    MAX(received_at) as last_request
FROM webhook_logs
WHERE received_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY event_type
ORDER BY total_requests DESC;
```

### Check ledger transaction rate
```sql
SELECT 
    DATE(created_at) as date,
    tx_type,
    COUNT(*) as transaction_count,
    SUM(points) as total_points
FROM transactions_ledger
WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(created_at), tx_type
ORDER BY date DESC, tx_type;
```

### Find recent webhook errors
```sql
SELECT 
    id,
    request_id,
    event_type,
    source_ip,
    payload,
    received_at
FROM webhook_logs
WHERE signature_verified = 0
    OR payload LIKE '%error%'
ORDER BY received_at DESC
LIMIT 20;
```

### Member point balance reconciliation
```sql
SELECT 
    m.member_id,
    m.points as wallet_points,
    COALESCE(ledger_calc.calculated_points, 0) as ledger_points,
    (m.points - COALESCE(ledger_calc.calculated_points, 0)) as difference
FROM members_wallet m
LEFT JOIN (
    SELECT 
        member_id,
        SUM(CASE 
            WHEN tx_type = 'points_received' THEN points
            WHEN tx_type = 'redeem_points' THEN -points
            ELSE 0
        END) as calculated_points
    FROM transactions_ledger
    GROUP BY member_id
) ledger_calc ON m.member_id = ledger_calc.member_id
WHERE ABS(m.points - COALESCE(ledger_calc.calculated_points, 0)) > 0.01
ORDER BY ABS(difference) DESC;
```

## Real-time Monitoring

### Watch webhook logs live
```bash
tail -f /var/www/html/logs/webhook-receiver.log
```

### Watch Apache access log
```bash
tail -f /var/log/apache2/access.log | grep webhook
```

### Watch Apache error log
```bash
tail -f /var/log/apache2/error.log | grep -i webhook
```

### Watch database for new transactions
```bash
watch -n 5 'mysql -u root -p"password" stockloyal -e "SELECT COUNT(*) as total FROM transactions_ledger WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)"'
```

## Testing Checklist

Before deploying to production:

- [ ] Run test-webhook-fixes.sh script
- [ ] Verify .htaccess is in place
- [ ] Check webhook-receiver.php has duplicate prevention code
- [ ] Ensure logs directory exists and is writable
- [ ] Verify database has webhook_logs table
- [ ] Check that client_tx_id has an index
- [ ] Send test webhook and verify logging
- [ ] Send duplicate webhook and verify prevention
- [ ] Check Apache error logs for any issues
- [ ] Verify point balances match ledger calculations

## Emergency Rollback

If webhooks are causing issues:

1. **Disable webhook processing temporarily:**
```bash
# Rename webhook receiver
mv /var/www/html/webhook-receiver.php /var/www/html/webhook-receiver.php.disabled
```

2. **Queue webhooks for later processing:**
```php
// Add to top of webhook-receiver.php
file_put_contents(
    '/var/www/html/logs/webhook-queue.json',
    json_encode([
        'timestamp' => time(),
        'payload' => file_get_contents('php://input')
    ]) . "\n",
    FILE_APPEND
);
http_response_code(200);
echo json_encode(['success' => true, 'queued' => true]);
exit;
```

3. **Restore from backup if needed:**
```sql
-- Use cleanup-duplicate-ledger-entries.sql rollback section
```

## Performance Optimization

### Add missing indexes
```sql
-- Speed up duplicate checks
ALTER TABLE transactions_ledger 
ADD INDEX idx_client_tx_id (client_tx_id);

-- Speed up member lookups
ALTER TABLE transactions_ledger
ADD INDEX idx_member_id (member_id);

-- Speed up date range queries
ALTER TABLE webhook_logs
ADD INDEX idx_received_at (received_at);
```

### Archive old webhook logs
```sql
-- Move logs older than 30 days to archive table
CREATE TABLE webhook_logs_archive LIKE webhook_logs;

INSERT INTO webhook_logs_archive
SELECT * FROM webhook_logs
WHERE received_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

DELETE FROM webhook_logs
WHERE received_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

## Contact Information

**Developer:** Robert (StockLoyal)
**Server:** AWS EC2 / Local XAMPP
**Database:** MySQL/RDS
**Frontend:** React + Vite
**Backend:** PHP + Apache

**Support Files:**
- webhook-receiver.php - Main webhook handler
- .htaccess - Apache routing rules
- cleanup-duplicate-ledger-entries.sql - Cleanup script
- test-webhook-fixes.sh - Testing script
- WEBHOOK_FIXES_README.md - Detailed documentation
