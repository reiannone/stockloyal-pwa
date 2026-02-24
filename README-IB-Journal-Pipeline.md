# StockLoyal IB Pipeline — Journal Funds Flow

## New 5-Stage Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. Prepare  │───▶│ 2. Settlement│───▶│  3. Journal  │───▶│ 4. Order     │───▶│ 5. Broker    │
│  Orders      │    │ Merchant→SL  │    │ SL→Members   │    │ Sweep        │    │ Execution    │
│              │    │              │    │              │    │              │    │              │
│ Stage baskets│    │ ACH from     │    │ JNLC from    │    │ Place stock  │    │ Confirm      │
│ from cash    │    │ merchant to  │    │ firm sweep   │    │ orders thru  │    │ fills from   │
│ balances     │    │ SL sweep acct│    │ to member    │    │ member accts │    │ Alpaca       │
│              │    │              │    │ Alpaca accts │    │              │    │              │
│ /prepare-    │    │ /payments-   │    │ /journal-    │    │ /sweep-      │    │ /admin-      │
│  orders      │    │  processing  │    │  admin       │    │  admin       │    │  broker-exec │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

## Order Status Flow

```
pending → confirmed → settled → [journaled] → pending → placed → confirmed/executed
  │           │          │           │             │         │
  │       (broker    (merchant   (SL sweep →   (ready    (broker
  │        confirms)  pays SL)   member acct)  to trade)  fills)
```

## Files Created

| File | Type | Deploy To | Purpose |
|------|------|-----------|---------|
| `OrderPipeline.jsx` | React | `src/components/` | Updated 5-stage subway pipeline |
| `JournalAdmin.jsx` | React | `src/pages/` | New Journal Admin page |
| `journal-sweep.php` | PHP | `/var/www/html/api/` | Journal engine — Alpaca JNLC transfers |
| `get-journal-status.php` | PHP | `/var/www/html/api/` | Data API for Journal Admin |
| `admin-queue-counts.php` | PHP | `/var/www/html/api/` | Updated with 5-stage counts |
| `migration-journal-columns.sql` | SQL | Run on RDS | Adds journal_status, alpaca_journal_id, journaled_at |

## Deployment Steps

### 1. Run SQL Migration (FIRST)
```sql
-- Run migration-journal-columns.sql on your RDS instance
mysql -h stockloyal-db.ctms60ci403w.us-east-2.rds.amazonaws.com -u admin -p stockloyal < migration-journal-columns.sql
```

### 2. Deploy PHP files
```bash
scp journal-sweep.php get-journal-status.php admin-queue-counts.php ec2-user@your-ec2:/var/www/html/api/
```

### 3. Add React route in App.jsx
```jsx
import JournalAdmin from "./pages/JournalAdmin";

// Inside <Routes>:
<Route
  path="/journal-admin"
  element={
    <PageWrapper>
      <JournalAdmin />
    </PageWrapper>
  }
/>
```

### 4. Replace OrderPipeline.jsx
```bash
cp OrderPipeline.jsx src/components/OrderPipeline.jsx
```

### 5. Update existing pages
Each admin page that uses `<OrderPipeline>` needs its `currentStep` updated:
- PrepareOrders: `currentStep={1}` (unchanged)
- PaymentsProcessing: `currentStep={2}` (was 4)
- JournalAdmin: `currentStep={3}` (NEW)
- SweepAdmin: `currentStep={4}` (was 2)
- AdminBrokerExec: `currentStep={5}` (was 3)

## Journal Process — How It Works

1. **Settlement** marks orders as `status='settled'` (merchant paid)
2. **Journal Admin** finds settled orders where `journal_status IS NULL`
3. Groups by member, shows totals and Alpaca account status
4. "Journal All" or "Journal Selected":
   - Calls Alpaca `POST /v1/journals` with `JNLC` entry type
   - `from_account` = SL firm sweep (69a54fa7-cbee-37a0-bea2-1af5a4bcada6)
   - `to_account` = member's alpaca_account_id
   - Updates `journal_status='completed'`, `journaled_at=NOW()`
5. Orders are now funded and ready for the Order Sweep (stage 4)

## Alpaca Journal API Reference

```bash
# Journal cash from firm → member
curl -X POST \
  -u "KEY:SECRET" \
  "https://broker-api.sandbox.alpaca.markets/v1/journals" \
  -d '{
    "from_account": "69a54fa7-cbee-37a0-bea2-1af5a4bcada6",
    "entry_type": "JNLC",
    "to_account": "MEMBER_ALPACA_ACCOUNT_ID",
    "amount": "500.00",
    "description": "StockLoyal points conversion"
  }'
```
