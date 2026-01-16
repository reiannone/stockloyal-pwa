# StockLoyal Webhook Receiver - Production Edition

Production-ready webhook receiver with enterprise-grade security, logging, and reliability features.

## 🚀 Features

### Security
- ✅ Dual authentication (API key or Bearer token)
- ✅ HMAC SHA-256 signature verification
- ✅ CORS preflight handling
- ✅ Rate limiting per IP
- ✅ Timing-safe comparisons

### Reliability
- ✅ Idempotency/deduplication by request ID
- ✅ Database + file logging with rotation
- ✅ Automatic cleanup of old logs
- ✅ Round-trip acknowledgment support
- ✅ Graceful error handling

### Operations
- ✅ Date-based log rotation
- ✅ Environment-specific configuration
- ✅ Comprehensive audit trail
- ✅ Analytics-ready data structure

---

## 📋 Requirements

- PHP 7.4+ (8.0+ recommended)
- MySQL 5.7+ / MariaDB 10.3+
- cURL extension enabled
- Write permissions on `logs/` directory

---

## 🔧 Installation

### 1. Deploy Files

```bash
# Upload to your webhooks directory
/app.stockloyal.com/webhooks/
├── stockloyal-receiver.php
├── cors.php
├── _loadenv.php
├── config.php
└── logs/
    ├── receive/
    ├── ack/
    └── dedupe/
```

### 2. Create Database Table

Run the SQL schema:

```bash
mysql -u your_user -p your_database < webhook_logs_schema.sql
```

Or manually create the table:

```sql
CREATE TABLE webhook_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  signature_verified TINYINT(1) DEFAULT 0,
  source_ip VARCHAR(45) NOT NULL,
  origin VARCHAR(255) DEFAULT NULL,
  received_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_request_id (request_id),
  INDEX idx_event_type (event_type),
  INDEX idx_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3. Set Environment Variables

Create `.env` file or set in your hosting environment:

```bash
# Required
STOCKLOYAL_WEBHOOK_SECRET=your_secure_random_key_here_min_32_chars

# Optional
ENVIRONMENT=production  # or 'development', 'staging'
WEBHOOK_RATE_LIMIT=60   # requests per minute per IP
```

**Generate a secure secret:**
```bash
php -r "echo bin2hex(random_bytes(32));"
```

### 4. Set Directory Permissions

```bash
chmod 755 /path/to/webhooks/
chmod 775 /path/to/webhooks/logs/
chmod 775 /path/to/webhooks/logs/receive/
chmod 775 /path/to/webhooks/logs/ack/
chmod 775 /path/to/webhooks/logs/dedupe/

# Ensure web server user can write
chown -R www-data:www-data /path/to/webhooks/logs/
```

### 5. Update config.php

Ensure your `config.php` has a valid PDO connection:

```php
<?php
// config.php
try {
    $pdo = new PDO(
        'mysql:host=localhost;dbname=stockloyal;charset=utf8mb4',
        'your_db_user',
        'your_db_password',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (PDOException $e) {
    error_log("Database connection failed: " . $e->getMessage());
    die("Database connection error");
}
```

---

## 🧪 Testing

### Test 1: Basic Authentication

```bash
curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_webhook_secret" \
  -H "X-Event-Type: test.ping" \
  -H "X-Request-Id: test-$(date +%s)" \
  -d '{
    "event_type": "test.ping",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "request_id": "test-1234567890",
  "event_type": "test.ping",
  "received_at": "2026-01-16T10:30:00+00:00",
  "environment": "production",
  "signature": {
    "present": false,
    "verified": false,
    "reason": "absent",
    "required": true
  },
  "database_logged": true,
  "ack": {
    "attempted": false,
    "ack_url": null
  }
}
```

### Test 2: With HMAC Signature

```bash
# Generate signature
SECRET="your_webhook_secret"
PAYLOAD='{"event_type":"test.signature","amount":100}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SECRET" \
  -H "X-Event-Type: test.signature" \
  -H "X-Request-Id: sig-test-$(date +%s)" \
  -H "X-Signature: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

### Test 3: Bearer Token Auth

```bash
curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_webhook_secret" \
  -H "X-Event-Type: test.bearer" \
  -H "X-Request-Id: bearer-$(date +%s)" \
  -d '{"event_type":"test.bearer"}'
```

### Test 4: Idempotency (Duplicate Request)

```bash
REQUEST_ID="idempotent-test-123"

# First request
curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_webhook_secret" \
  -H "X-Request-Id: $REQUEST_ID" \
  -d '{"event":"first"}'

# Duplicate request (should return duplicate:true)
curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_webhook_secret" \
  -H "X-Request-Id: $REQUEST_ID" \
  -d '{"event":"second"}'
```

### Test 5: Rate Limiting

```bash
# Send 65 requests rapidly (default limit is 60/min)
for i in {1..65}; do
  curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
    -H "X-API-Key: your_webhook_secret" \
    -H "X-Request-Id: rate-$i" \
    -d '{"test":'$i'}' &
done
wait

# Last few should return 429 Too Many Requests
```

### Test 6: Round-Trip ACK

```bash
curl -X POST https://app.stockloyal.com/webhooks/stockloyal-receiver.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_webhook_secret" \
  -H "X-Request-Id: ack-test-$(date +%s)" \
  -d '{
    "event_type": "test.ack",
    "ack_url": "https://your-test-server.com/ack-receiver"
  }'
```

---

## 📊 Monitoring

### Check Logs

```bash
# Recent received webhooks
tail -f logs/receive/receiver_$(date +%Y-%m-%d).log

# Recent ACK attempts
tail -f logs/ack/ack_$(date +%Y-%m-%d).log

# Watch for errors
grep -i error logs/receive/*.log

# Count by event type
grep RECEIVED logs/receive/*.log | awk '{print $5}' | sort | uniq -c
```

### Database Queries

```sql
-- Recent webhooks (last hour)
SELECT 
  request_id,
  event_type,
  source_ip,
  signature_verified,
  received_at
FROM webhook_logs
WHERE received_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
ORDER BY received_at DESC;

-- Event type statistics
SELECT 
  event_type,
  COUNT(*) as total,
  SUM(signature_verified) as verified,
  COUNT(DISTINCT source_ip) as unique_ips
FROM webhook_logs
WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY event_type;

-- Failed signatures
SELECT 
  request_id,
  event_type,
  source_ip,
  received_at
FROM webhook_logs
WHERE signature_verified = 0
  AND received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY received_at DESC;
```

### Use the Recent View

```sql
SELECT * FROM webhook_logs_recent LIMIT 50;
```

---

## 🔐 Security Best Practices

### 1. Strong Secrets
```bash
# Generate cryptographically secure secret (32+ bytes)
php -r "echo bin2hex(random_bytes(32));"

# Rotate secrets periodically (quarterly recommended)
```

### 2. IP Whitelisting (Optional)
Add to top of `stockloyal-receiver.php`:

```php
$ALLOWED_IPS = ['203.0.113.10', '203.0.113.11'];
if (!in_array($_SERVER['REMOTE_ADDR'], $ALLOWED_IPS, true)) {
    jsonOut(403, ['error' => 'IP not whitelisted']);
}
```

### 3. HTTPS Only
Ensure your webhook URL uses HTTPS. Add to `.htaccess`:

```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^webhooks/ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
```

### 4. Monitor Unauthorized Attempts

```bash
# Alert on multiple auth failures
grep UNAUTHORIZED logs/receive/*.log | wc -l

# Check for suspicious IPs
grep UNAUTHORIZED logs/receive/*.log | awk '{print $3}' | sort | uniq -c | sort -rn
```

---

## 🧹 Maintenance

### Automated Cleanup (Cron Jobs)

Add to your crontab:

```cron
# Clean old database logs every week (keep 90 days)
0 2 * * 0 mysql -u user -p'pass' stockloyal -e "CALL cleanup_old_webhook_logs(90);"

# Clean old dedupe files daily
0 3 * * * find /path/to/webhooks/logs/dedupe -name "*.seen" -mtime +7 -delete

# Clean old log files monthly
0 4 1 * * find /path/to/webhooks/logs/receive -name "*.log" -mtime +30 -delete
0 4 1 * * find /path/to/webhooks/logs/ack -name "*.log" -mtime +30 -delete
```

### Manual Cleanup

```bash
# Database (keep last 60 days)
mysql -u user -p'pass' stockloyal -e "CALL cleanup_old_webhook_logs(60);"

# Files
find logs/dedupe -name "*.seen" -mtime +7 -delete
find logs/receive -name "*.log" -mtime +30 -delete
find logs/ack -name "*.log" -mtime +30 -delete
```

---

## 🐛 Troubleshooting

### Issue: 401 Unauthorized

**Check:**
1. `X-API-Key` header matches `STOCKLOYAL_WEBHOOK_SECRET`
2. Or `Authorization: Bearer` token matches secret
3. No extra whitespace in secret

```bash
# Verify secret
echo -n "your_secret" | md5sum

# Test with curl
curl -v -X POST https://your-url.com/webhooks/stockloyal-receiver.php \
  -H "X-API-Key: your_secret"
```

### Issue: 401 Invalid Signature

**Check:**
1. Signature calculated on exact raw JSON bytes
2. No whitespace added/removed
3. Using SHA-256 HMAC
4. Format: `X-Signature: sha256=<hex>`

```php
// Correct signature generation
$payload = json_encode($data, JSON_UNESCAPED_SLASHES);
$signature = hash_hmac('sha256', $payload, $secret);
// Send: X-Signature: sha256=$signature
```

### Issue: 429 Rate Limit Exceeded

**Solutions:**
1. Increase `WEBHOOK_RATE_LIMIT` env var
2. Distribute requests over time
3. Use multiple source IPs
4. Implement retry with exponential backoff

### Issue: Database Not Logging

**Check:**
1. Table `webhook_logs` exists
2. `$pdo` is defined in `config.php`
3. Database credentials correct
4. PHP user has INSERT permission

```bash
# Test database connection
php -r "require 'config.php'; var_dump($pdo);"
```

### Issue: Files Not Being Created

**Check:**
```bash
# Permissions
ls -la logs/
ls -la logs/receive/
ls -la logs/dedupe/

# Ownership
stat logs/

# Test write permission
sudo -u www-data touch logs/receive/test.log
```

---

## 📈 Performance Optimization

### For High Volume (1000+ req/min)

1. **Use Redis for Rate Limiting:**
```php
// Replace file-based rate limit with Redis
$redis = new Redis();
$redis->connect('127.0.0.1');
$key = "webhook_rate:{$ip}:" . date('YmdHi');
$count = $redis->incr($key);
$redis->expire($key, 60);
if ($count > $RATE_LIMIT_MAX) { /* rate limited */ }
```

2. **Use Redis for Dedupe:**
```php
// Replace file-based dedupe with Redis
$key = "webhook_dedupe:{$requestId}";
if ($redis->exists($key)) { /* duplicate */ }
$redis->setex($key, 3600, 1); // 1 hour TTL
```

3. **Async Database Logging:**
```php
// Queue for background processing
$redis->rPush('webhook_queue', json_encode([
    'request_id' => $requestId,
    'payload' => $raw,
    // ...
]));
```

4. **Database Optimization:**
```sql
-- Partition by month
ALTER TABLE webhook_logs 
PARTITION BY RANGE (YEAR(received_at) * 100 + MONTH(received_at)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  PARTITION p202602 VALUES LESS THAN (202603),
  -- ...
);
```

---

## 🔄 Migration from Old Version

### Differences

| Feature | Old | New |
|---------|-----|-----|
| Logging | Single file | Date-based rotation |
| Dedupe | File-based | File + auto-cleanup |
| Rate Limit | None | Per-IP limiting |
| Database | Optional | Built-in + view |
| Env Config | Hardcoded | Environment vars |
| Signature | Optional | Env-based requirement |

### Migration Steps

1. **Backup existing logs:**
```bash
tar -czf webhook_logs_backup_$(date +%Y%m%d).tar.gz logs/
```

2. **Update environment:**
```bash
echo "STOCKLOYAL_WEBHOOK_SECRET=your_secret" >> .env
echo "ENVIRONMENT=production" >> .env
```

3. **Create database table:**
```bash
mysql -u user -p database < webhook_logs_schema.sql
```

4. **Deploy new file:**
```bash
cp stockloyal-receiver.php /path/to/webhooks/
```

5. **Test:**
```bash
curl -X POST https://your-url.com/webhooks/stockloyal-receiver.php \
  -H "X-API-Key: your_secret" \
  -d '{"test":true}'
```

---

## 📞 Support

- **Logs Location:** `/webhooks/logs/receive/receiver_YYYY-MM-DD.log`
- **Database Table:** `webhook_logs`
- **Test Endpoint:** `POST /webhooks/stockloyal-receiver.php`

---

## 📄 License

Proprietary - StockLoyal Internal Use Only

---

## ✅ Deployment Checklist

- [ ] Files uploaded to `/webhooks/` directory
- [ ] Database table created (`webhook_logs`)
- [ ] Environment variables set (`STOCKLOYAL_WEBHOOK_SECRET`)
- [ ] Directory permissions set (755/775)
- [ ] Web server user can write to `logs/`
- [ ] Database connection tested (`config.php`)
- [ ] HTTPS enabled on webhook URL
- [ ] Test webhook sent successfully
- [ ] Signature verification tested
- [ ] Rate limiting tested
- [ ] Idempotency tested
- [ ] Logs rotating correctly
- [ ] Database logging working
- [ ] Cron jobs configured for cleanup
- [ ] Monitoring alerts configured
- [ ] Documentation shared with team

---

**Version:** 2.0.0  
**Last Updated:** January 16, 2026  
**Maintainer:** StockLoyal Engineering Team
