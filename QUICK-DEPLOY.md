# 🚀 Quick Deployment - StockLoyal Webhook API Files

## 📦 New API Files (Matching Your Structure)

I've created **4 separate API files** following your `get-brokers.php` template:

```
api/
├── webhook-config.php  ← GET/POST webhook configuration
├── webhook-stats.php   ← GET webhook statistics
├── webhook-logs.php    ← GET webhook logs with filters
└── webhook-test.php    ← POST test webhook
```

Each file:
- ✅ Uses `cors.php`, `_loadenv.php`, `config.php`
- ✅ Uses `$conn` (not `$pdo`)
- ✅ Handles OPTIONS preflight
- ✅ Returns `JSON_NUMERIC_CHECK`
- ✅ Has error logging
- ✅ Gracefully handles missing tables

---

## 🎯 Deploy in 3 Minutes

### Step 1: Upload Files

```bash
# Upload to your API directory (same as get-brokers.php)
scp webhook-config.php user@server:/path/to/api/
scp webhook-stats.php user@server:/path/to/api/
scp webhook-logs.php user@server:/path/to/api/
scp webhook-test.php user@server:/path/to/api/
```

Or via file manager:
```
/public_html/api/webhook-config.php
/public_html/api/webhook-stats.php
/public_html/api/webhook-logs.php
/public_html/api/webhook-test.php
```

### Step 2: Test Endpoints

```bash
# Test config endpoint
curl https://api.stockloyal.com/api/webhook-config.php

# Should return JSON:
# {"success":true,"config":{...}}
```

### Step 3: That's It!

Your frontend will automatically work because the endpoints are now at:
- `https://api.stockloyal.com/api/webhook-config.php`
- `https://api.stockloyal.com/api/webhook-stats.php`
- `https://api.stockloyal.com/api/webhook-logs.php`
- `https://api.stockloyal.com/api/webhook-test.php`

---

## 🔧 Update Frontend API Calls

Update `WebhookAdmin.jsx` to use the correct endpoints:

```javascript
// Change from:
fetch('/api/webhook/config')

// To:
fetch('/api/webhook-config.php')
```

Or better yet, update just once at the top:

```javascript
const API = {
  config: '/api/webhook-config.php',
  stats: '/api/webhook-stats.php',
  logs: '/api/webhook-logs.php',
  test: '/api/webhook-test.php'
};

// Then use:
const response = await fetch(API.config);
```

---

## 📋 What Each File Does

### webhook-config.php
```bash
# GET - Load configuration
curl https://api.stockloyal.com/api/webhook-config.php

# POST - Save configuration
curl -X POST https://api.stockloyal.com/api/webhook-config.php \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://...","apiKey":"sk_...","environment":"production","requireSignature":true,"rateLimit":60}'
```

### webhook-stats.php
```bash
# GET - Load 24h statistics
curl https://api.stockloyal.com/api/webhook-stats.php

# Returns: total webhooks, unique events, verification rate, etc.
```

### webhook-logs.php
```bash
# GET - Load logs with filters
curl "https://api.stockloyal.com/api/webhook-logs.php?page=1&perPage=50&eventType=points.redeemed"

# Filters: page, perPage, eventType, sourceIp, date, verified
```

### webhook-test.php
```bash
# POST - Send test webhook
curl -X POST https://api.stockloyal.com/api/webhook-test.php

# Sends a test webhook to your configured receiver
```

---

## ✅ Verification Checklist

- [ ] Files uploaded to `/api/` directory
- [ ] Can access `https://api.stockloyal.com/api/webhook-config.php` (not 404)
- [ ] Response is valid JSON (not HTML error page)
- [ ] CORS headers working (check browser console)
- [ ] Database tables created (run SQL files)
- [ ] Frontend updated to use `.php` extensions

---

## 🐛 Quick Troubleshooting

### Issue: 404 Not Found

**Cause:** Files not in correct location

**Fix:**
```bash
# Check files exist
ls -la /path/to/api/webhook-*.php

# Should see 4 files
```

### Issue: CORS Error

**Cause:** `cors.php` not setting headers

**Fix:** Check that `cors.php` includes localhost:
```php
// In cors.php, make sure it allows:
$allowedOrigins = [
    'http://localhost:5173',
    'https://app.stockloyal.com'
];
```

### Issue: "Database error"

**Cause:** Tables don't exist yet

**Fix:** Run SQL files:
```bash
mysql -u user -p stockloyal < webhook_logs_schema.sql
mysql -u user -p stockloyal < webhook_config_schema.sql
```

**Note:** The endpoints work even without tables! They return empty data gracefully.

---

## 🔄 Update Frontend Component

Create this helper at the top of `WebhookAdmin.jsx`:

```javascript
// API endpoint configuration
const WEBHOOK_API = {
  config: '/api/webhook-config.php',
  stats: '/api/webhook-stats.php',
  logs: '/api/webhook-logs.php',
  test: '/api/webhook-test.php'
};

// Then update all fetch calls:
const loadConfiguration = async () => {
  try {
    const response = await fetch(WEBHOOK_API.config);  // ← Changed
    const data = await response.json();
    // ...
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
};

const loadStats = async () => {
  const response = await fetch(WEBHOOK_API.stats);  // ← Changed
  // ...
};

const loadLogs = async () => {
  const params = new URLSearchParams({...});
  const response = await fetch(`${WEBHOOK_API.logs}?${params}`);  // ← Changed
  // ...
};

const testWebhook = async () => {
  const response = await fetch(WEBHOOK_API.test, {  // ← Changed
    method: 'POST',
    // ...
  });
};

const saveConfiguration = async () => {
  const response = await fetch(WEBHOOK_API.config, {  // ← Changed
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
};
```

---

## 📊 File Comparison

| Old Approach | New Approach |
|--------------|--------------|
| Single `webhook-api.php` with routing | 4 separate files |
| Uses `$pdo` | Uses `$conn` |
| Custom CORS | Uses your `cors.php` |
| Doesn't match your style | Matches `get-brokers.php` exactly |

---

## ✨ Why This Is Better

1. **Matches Your Architecture** - Uses `$conn`, `cors.php`, same error handling
2. **No Routing Needed** - Direct file access like `get-brokers.php`
3. **Easy to Deploy** - Just upload 4 files
4. **Easy to Debug** - Each endpoint is its own file
5. **Works Immediately** - No .htaccess or routing config needed

---

## 🎉 Success Test

Once deployed, test all endpoints:

```bash
# 1. Config
curl https://api.stockloyal.com/api/webhook-config.php
# Expect: {"success":true,"config":{...}}

# 2. Stats  
curl https://api.stockloyal.com/api/webhook-stats.php
# Expect: {"success":true,"stats":{...}}

# 3. Logs
curl https://api.stockloyal.com/api/webhook-logs.php
# Expect: {"success":true,"logs":[...]}

# 4. Test
curl -X POST https://api.stockloyal.com/api/webhook-test.php
# Expect: {"success":true,"request_id":"test_..."}
```

If all 4 return JSON (not 404), you're ready! 🚀

---

**Deployment Time:** ~3 minutes  
**Frontend Update Time:** ~5 minutes  
**Total:** Under 10 minutes to full working system!
