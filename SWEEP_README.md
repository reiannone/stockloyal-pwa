# StockLoyal Sweep Process

Automated batch process for submitting trade orders to brokers based on merchant sweep schedules.

## Overview

The Sweep Process:
1. Runs daily (via cron) or manually (via admin page)
2. Identifies merchants whose `sweep_day` matches today
3. Collects all pending/queued orders for those merchants
4. Groups orders by broker and submits batch trade requests
5. Updates order status to `confirmed` with timestamp
6. Logs execution results for audit trail

## Files

| File | Purpose |
|------|---------|
| `sweep_process.php` | Core SweepProcess class |
| `run_sweep.php` | Cron-callable runner script |
| `get_sweep_status.php` | API for admin dashboard |
| `trigger_sweep.php` | Manual sweep trigger API |
| `sweep_migration.sql` | Database migration script |
| `SweepAdmin.jsx` | React admin page component |

## Installation

### 1. Run Database Migration

```bash
mysql -h stockloyal-db.xxxxx.rds.amazonaws.com -u admin -p stockloyal < sweep_migration.sql
```

This creates:
- `sweep_log` table for execution history
- `sweep_day` column on `merchant` table (if not exists)
- Indexes for efficient queries

### 2. Upload PHP Files

Copy to your EC2 `/var/www/html/api/` directory:

```bash
scp sweep_process.php run_sweep.php get_sweep_status.php trigger_sweep.php ec2-user@your-ec2:/var/www/html/api/
```

### 3. Set Up Cron Job

Add to crontab to run daily at 9 AM EST:

```bash
crontab -e
```

Add line:
```
0 9 * * * /usr/bin/php /var/www/html/api/run_sweep.php >> /var/log/stockloyal/sweep.log 2>&1
```

Create log directory:
```bash
sudo mkdir -p /var/log/stockloyal
sudo chown apache:apache /var/log/stockloyal
```

### 4. Add Admin Page to React App

Add route in your App.jsx or router:

```jsx
import SweepAdmin from "./pages/SweepAdmin";

// In your routes
<Route path="/admin/sweep" element={<SweepAdmin />} />
```

Add link in Admin navigation:
```jsx
<Link to="/admin/sweep">Sweep Manager</Link>
```

## Configuration

### Merchant Sweep Day

Set the `sweep_day` for each merchant (1-28, or -1 for last day of month):

```sql
-- Set merchant to sweep on the 15th of each month
UPDATE merchant SET sweep_day = 15 WHERE merchant_id = 'SKY001';

-- Set merchant to sweep on last day of month
UPDATE merchant SET sweep_day = -1 WHERE merchant_id = 'ACME001';

-- Disable sweep (process immediately)
UPDATE merchant SET sweep_day = NULL WHERE merchant_id = 'EXPRESS001';
```

### Broker Webhook

Ensure your `broker_master` table has webhook configuration:

```sql
UPDATE broker_master 
SET webhook_url = 'https://api.broker.com/trades/batch',
    api_key = 'your-api-key'
WHERE broker_id = 'robinhood';
```

## API Endpoints

### GET Sweep Status
```bash
curl -X POST https://api.stockloyal.com/api/get_sweep_status.php \
  -H "Content-Type: application/json" \
  -d '{"action": "overview"}'
```

Actions: `overview`, `history`, `pending`, `merchant_schedule`, `batch_details`

### Trigger Manual Sweep
```bash
# All eligible merchants
curl -X POST https://api.stockloyal.com/api/trigger_sweep.php \
  -H "Content-Type: application/json" \
  -d '{"action": "run"}'

# Specific merchant
curl -X POST https://api.stockloyal.com/api/trigger_sweep.php \
  -H "Content-Type: application/json" \
  -d '{"action": "run", "merchant_id": "SKY001"}'

# Preview (dry run)
curl -X POST https://api.stockloyal.com/api/trigger_sweep.php \
  -H "Content-Type: application/json" \
  -d '{"action": "preview"}'
```

### Run from CLI
```bash
# All eligible merchants
php run_sweep.php

# Specific merchant
php run_sweep.php --merchant=SKY001

# Help
php run_sweep.php --help
```

## Order Status Flow

```
User places order → status = "pending" or "queued"
        ↓
Sweep runs for merchant's sweep_day
        ↓
Orders submitted to broker webhook
        ↓
status = "confirmed", executed_at = NOW()
```

## Admin Dashboard Features

- **Overview**: Stats, today's schedule, pending orders by merchant
- **Pending Orders**: View all orders awaiting sweep
- **Schedules**: Merchant sweep day configuration
- **History**: Past sweep execution logs

## Troubleshooting

### Check Pending Orders
```sql
SELECT merchant_id, COUNT(*), SUM(amount) 
FROM orders 
WHERE status IN ('pending', 'queued') 
GROUP BY merchant_id;
```

### Check Sweep History
```sql
SELECT * FROM sweep_log ORDER BY started_at DESC LIMIT 10;
```

### View Sweep Logs
```bash
tail -f /var/log/stockloyal/sweep.log
```

### Manual Test Run
```bash
php run_sweep.php --merchant=SKY001 2>&1
```
