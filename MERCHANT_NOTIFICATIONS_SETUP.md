# Merchant Notifications Admin Page Setup

## Overview
Complete admin interface for managing merchant webhook notifications with filtering, editing, retry functionality, and detailed status tracking.

## Files Created

### Frontend
- **MerchantNotifications.jsx** - Admin page component

### Backend
- **get-merchant-notifications.php** - Fetch notifications with filters
- **save-merchant-notification.php** - Update notification records
- **delete-merchant-notification.php** - Delete notifications
- **retry-merchant-notification.php** - Resend failed notifications

## Features

### 1. Filtering
- ✅ Filter by Merchant ID
- ✅ Filter by Member ID
- ✅ Filter by Event Type (points_received, points_redeemed, points_adjusted)
- ✅ Filter by Status (pending, sent, failed)
- ✅ Filter by Basket ID
- ✅ Filter by Date (single day)

### 2. Edit Panel
- ✅ View/edit all notification fields
- ✅ JSON payload viewer/editor
- ✅ Response body viewer
- ✅ Error message display
- ✅ Timestamps (created_at, sent_at)

### 3. Actions
- ✅ **Save Changes** - Update notification fields
- ✅ **Retry Send** - Resend failed notifications (disabled if already sent)
- ✅ **Delete** - Remove notification from database
- ✅ **Cancel** - Close edit panel

### 4. Status Pills
- 🟢 **sent** - Green (successfully delivered)
- 🔴 **failed** - Red (delivery failed)
- 🟡 **pending** - Amber (awaiting delivery)

### 5. Table Display
- ID, Merchant ID, Member ID
- Event Type, Points, Cash Amount
- Basket ID, Status, Response Code
- Created At, Sent At (local timezone)
- Click row to edit

## Installation

### Step 1: Deploy Frontend
```bash
# Copy to your React app
cp MerchantNotifications.jsx src/pages/
```

### Step 2: Add Route
In your `App.jsx`:
```javascript
import MerchantNotifications from './pages/MerchantNotifications';

// Add route
<Route path="/merchant-notifications" element={<MerchantNotifications />} />
```

### Step 3: Add Navigation Link
In your admin menu or sidebar:
```javascript
<Link to="/merchant-notifications">Merchant Notifications</Link>
```

### Step 4: Deploy Backend
```bash
# Copy PHP files to API directory
cp get-merchant-notifications.php /api/
cp save-merchant-notification.php /api/
cp delete-merchant-notification.php /api/
cp retry-merchant-notification.php /api/
```

## Usage Examples

### View All Notifications
1. Navigate to `/merchant-notifications`
2. See all notifications sorted by created_at DESC
3. Click any row to view details

### Filter by Status
1. Select "Status" from filter dropdown
2. Enter: `failed`
3. Click "Filter"
4. Shows only failed notifications

### Retry Failed Notification
1. Click a row with status "failed"
2. Click "🔄 Retry Send" button
3. System resends webhook
4. Status updates to "sent" or "failed"
5. Response code and error message updated

### Edit Notification
1. Click a notification row
2. Edit fields in the panel
3. Click "Save Changes"
4. Notification updated in database

### Monitor Delivery
Monitor webhook delivery status:
```sql
-- Check failed notifications
SELECT merchant_id, COUNT(*) as failed_count
FROM merchant_notifications
WHERE status = 'failed'
GROUP BY merchant_id;

-- Check recent activity
SELECT * FROM merchant_notifications
ORDER BY created_at DESC LIMIT 10;
```

## API Endpoints

### get-merchant-notifications.php
```javascript
POST /api/get-merchant-notifications.php
{
  "merchant_id": "merchant001",  // optional
  "member_id": "member123",      // optional
  "event_type": "points_redeemed", // optional
  "status": "failed",             // optional
  "basket_id": "basket-123",      // optional
  "start_date": "2026-01-01 00:00:00", // optional
  "end_date": "2026-01-02 00:00:00",   // optional
  "sort_by": "created_at",        // default: created_at
  "sort_dir": "DESC",             // default: DESC
  "limit": 200                    // default: 200, max: 500
}
```

### save-merchant-notification.php
```javascript
POST /api/save-merchant-notification.php
{
  "id": 123,
  "status": "sent",
  "error_message": null,
  // ... any other fields to update
}
```

### retry-merchant-notification.php
```javascript
POST /api/retry-merchant-notification.php
{
  "id": 123
}
```

Returns:
```javascript
{
  "success": true,
  "webhook_sent": true,
  "http_code": 200,
  "notification_id": 123
}
```

### delete-merchant-notification.php
```javascript
POST /api/delete-merchant-notification.php
{
  "id": 123
}
```

## Common Tasks

### Find Failed Notifications for a Merchant
1. Filter by: Merchant ID
2. Enter: `merchant001`
3. Click Filter
4. Change filter to: Status
5. Enter: `failed`
6. Click Filter

### Bulk Retry Failed Notifications
Use the retry button on each failed notification, or run SQL:
```sql
-- Find all failed for a merchant
SELECT id, error_message 
FROM merchant_notifications
WHERE merchant_id = 'merchant001' 
AND status = 'failed'
ORDER BY created_at DESC;
```

Then retry each via the admin interface.

### Check Webhook Response
1. Click notification row
2. Scroll to "Response Body" field
3. View raw webhook response
4. Check "Response Code" (200 = success)

## Troubleshooting

### No Notifications Showing
- Check database table has data: `SELECT COUNT(*) FROM merchant_notifications;`
- Check API endpoint is accessible
- Check browser console for errors

### Retry Not Working
- Verify merchant has `webhook_url` configured
- Check merchant table: `SELECT webhook_url FROM merchant WHERE merchant_id = 'merchant001';`
- Check error_message field for details

### Status Not Updating
- Check `notify_merchant.php` is properly configured
- Verify webhook URL is reachable
- Check merchant's webhook endpoint logs

## Database Reference

```sql
-- View notification details
SELECT 
    id,
    merchant_id,
    member_id,
    event_type,
    points_amount,
    status,
    error_message,
    created_at,
    sent_at
FROM merchant_notifications
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Retry statistics
SELECT 
    status,
    COUNT(*) as count,
    AVG(TIMESTAMPDIFF(SECOND, created_at, sent_at)) as avg_delivery_time_sec
FROM merchant_notifications
WHERE sent_at IS NOT NULL
GROUP BY status;
```

## Next Steps

1. ✅ Deploy all files
2. ✅ Add route to App.jsx
3. ✅ Add navigation link
4. ✅ Test filtering
5. ✅ Test retry functionality
6. ✅ Monitor webhook delivery
7. ✅ Set up alerts for failed notifications
