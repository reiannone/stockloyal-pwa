# Integrating WebhookAdmin into StockLoyal

This guide shows how to integrate the React-based WebhookAdmin component into your existing StockLoyal admin interface.

## 📁 File Structure

```
/stockloyal/
├── frontend/
│   └── src/
│       └── components/
│           └── admin/
│               └── WebhookAdmin.jsx          ← New component
├── backend/
│   └── api/
│       └── webhook-api.php                    ← New API endpoints
└── webhooks/
    └── stockloyal-receiver.php                ← Webhook receiver
```

## 🚀 Step-by-Step Integration

### 1. Install Dependencies

Your project likely already has these, but verify:

```bash
npm install lucide-react  # For icons
```

### 2. Add WebhookAdmin Component

Copy `WebhookAdmin.jsx` to your admin components directory:

```bash
cp WebhookAdmin.jsx /path/to/stockloyal/frontend/src/components/admin/
```

### 3. Add API Endpoints

Copy `webhook-api.php` to your backend API directory:

```bash
cp webhook-api.php /path/to/stockloyal/backend/api/
```

Update your API routing (e.g., in `index.php` or `.htaccess`):

```apache
# .htaccess
RewriteRule ^api/webhook/(.*)$ api/webhook-api.php [L]
```

Or in your PHP router:

```php
// routes.php
$router->get('/api/webhook/config', 'webhook-api.php');
$router->post('/api/webhook/config', 'webhook-api.php');
$router->get('/api/webhook/stats', 'webhook-api.php');
$router->get('/api/webhook/logs', 'webhook-api.php');
$router->post('/api/webhook/test', 'webhook-api.php');
```

### 4. Create Database Tables

Run the SQL schemas:

```bash
# Webhook logs table (if not already created)
mysql -u your_user -p stockloyal < webhook_logs_schema.sql

# Webhook config table
mysql -u your_user -p stockloyal < webhook_config_schema.sql
```

### 5. Add to Admin Navigation

Update your admin navigation to include the webhook admin:

**Option A: Using React Router**

```jsx
// App.jsx or AdminRoutes.jsx
import WebhookAdmin from './components/admin/WebhookAdmin';

// In your routes
<Route path="/admin/webhooks" element={<WebhookAdmin />} />
```

**Option B: Add to Admin Sidebar**

```jsx
// AdminSidebar.jsx
import { Webhook } from 'lucide-react';

const adminMenuItems = [
  { path: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
  { path: '/admin/members', icon: Users, label: 'Members' },
  { path: '/admin/webhooks', icon: Webhook, label: 'Webhooks' }, // ← New
  // ... other items
];
```

### 6. Add Authentication to API

**CRITICAL:** Protect the webhook API endpoints with authentication:

```php
// webhook-api.php (top of file)
session_start();
if (!isset($_SESSION['user_id']) || !$_SESSION['is_admin']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}
```

Or integrate with your existing auth middleware:

```php
// webhook-api.php
require_once __DIR__ . '/../auth/middleware.php';
requireAdmin(); // Your existing auth function
```

### 7. Configure Environment

Update your `.env` file:

```bash
# Webhook Configuration
WEBHOOK_URL=https://app.stockloyal.com/webhooks/stockloyal-receiver.php
STOCKLOYAL_WEBHOOK_SECRET=your_generated_secret_here
ENVIRONMENT=production
WEBHOOK_RATE_LIMIT=60
```

Generate a secure secret:

```bash
php -r "echo 'sk_' . bin2hex(random_bytes(32));"
```

## 🔗 Integration Patterns

### Pattern 1: Standalone Route (Recommended)

```jsx
// App.jsx
import WebhookAdmin from './components/admin/WebhookAdmin';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route path="orders" element={<OrdersAdmin />} />
        <Route path="webhooks" element={<WebhookAdmin />} />
      </Route>
    </Routes>
  );
}
```

### Pattern 2: Tab within Settings Page

```jsx
// AdminSettings.jsx
import WebhookAdmin from './components/admin/WebhookAdmin';

function AdminSettings() {
  const [activeTab, setActiveTab] = useState('general');
  
  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
        
        <TabsContent value="webhooks">
          <WebhookAdmin />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Pattern 3: Modal/Drawer

```jsx
// AdminDashboard.jsx
import WebhookAdmin from './components/admin/WebhookAdmin';

function AdminDashboard() {
  const [showWebhookAdmin, setShowWebhookAdmin] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowWebhookAdmin(true)}>
        Configure Webhooks
      </button>
      
      <Modal open={showWebhookAdmin} onClose={() => setShowWebhookAdmin(false)}>
        <WebhookAdmin />
      </Modal>
    </>
  );
}
```

## 🎨 Styling Integration

### Option 1: Use as-is (Tailwind CSS)

The component uses Tailwind CSS classes. If your project already uses Tailwind, it should work out of the box.

### Option 2: Adapt to your CSS framework

If you use a different CSS framework (e.g., Material-UI, Bootstrap), update the class names:

```jsx
// Example: Converting to Material-UI
import { Paper, Tabs, Tab, TextField, Button } from '@mui/material';

// Replace:
<div className="bg-white rounded-lg border border-gray-200 p-6">
// With:
<Paper sx={{ p: 3 }}>
```

### Option 3: Use CSS Modules

```jsx
// WebhookAdmin.module.css
.container { /* ... */ }
.card { /* ... */ }

// WebhookAdmin.jsx
import styles from './WebhookAdmin.module.css';

<div className={styles.container}>
```

## 🔒 Security Checklist

- [ ] API endpoints protected with authentication
- [ ] Admin role verification in place
- [ ] CSRF protection enabled
- [ ] API key stored securely (never in frontend)
- [ ] Rate limiting on API endpoints
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (using PDO prepared statements)
- [ ] HTTPS enforced

## 🧪 Testing

### Test the React Component

```bash
# In your frontend directory
npm run dev

# Navigate to /admin/webhooks
```

### Test API Endpoints

```bash
# Get config
curl -X GET http://localhost/api/webhook/config \
  -H "Cookie: PHPSESSID=your_session_id"

# Get stats
curl -X GET http://localhost/api/webhook/stats \
  -H "Cookie: PHPSESSID=your_session_id"

# Test webhook
curl -X POST http://localhost/api/webhook/test \
  -H "Cookie: PHPSESSID=your_session_id"
```

## 📱 Responsive Design

The component is mobile-responsive by default:

- Desktop: Full layout with sidebar
- Tablet: Stacked layout with tabs
- Mobile: Single column, collapsible sections

Test at different breakpoints:
- Desktop: 1920px
- Tablet: 768px
- Mobile: 375px

## 🔄 State Management Integration

### Option 1: Local State (Current Implementation)

Uses React's `useState` and `useEffect`. Good for isolated admin pages.

### Option 2: Redux/Context

If you want global state:

```jsx
// webhookStore.js
import { createSlice } from '@reduxjs/toolkit';

export const webhookSlice = createSlice({
  name: 'webhook',
  initialState: { config: null, stats: null },
  reducers: {
    setConfig: (state, action) => { state.config = action.payload },
    setStats: (state, action) => { state.stats = action.payload },
  },
});

// WebhookAdmin.jsx
import { useDispatch, useSelector } from 'react-redux';

const config = useSelector(state => state.webhook.config);
const dispatch = useDispatch();
```

### Option 3: React Query

For better caching and refetching:

```jsx
import { useQuery, useMutation } from '@tanstack/react-query';

function WebhookAdmin() {
  const { data: config } = useQuery({
    queryKey: ['webhook-config'],
    queryFn: () => fetch('/api/webhook/config').then(r => r.json())
  });
  
  const { mutate: saveConfig } = useMutation({
    mutationFn: (newConfig) => 
      fetch('/api/webhook/config', {
        method: 'POST',
        body: JSON.stringify(newConfig)
      })
  });
}
```

## 🚨 Common Issues

### Issue 1: API endpoints return 404

**Solution:** Check your routing configuration. Ensure `.htaccess` or PHP router is configured correctly.

### Issue 2: CORS errors

**Solution:** Add CORS headers to `webhook-api.php`:

```php
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
```

### Issue 3: Icons not showing

**Solution:** Install lucide-react:

```bash
npm install lucide-react
```

### Issue 4: API returns authentication error

**Solution:** Verify session handling:

```php
session_start();
var_dump($_SESSION); // Check session contents
```

## 📊 Monitoring

Add these to monitor webhook admin usage:

```php
// Log admin actions
function logAdminAction($action, $details) {
    global $pdo;
    $stmt = $pdo->prepare("
        INSERT INTO admin_audit_log (user_id, action, details, created_at)
        VALUES (?, ?, ?, NOW())
    ");
    $stmt->execute([$_SESSION['user_id'], $action, json_encode($details)]);
}

// In webhook-api.php
logAdminAction('webhook_config_updated', ['changes' => $input]);
```

## 🎯 Next Steps

1. **Deploy to staging** - Test in staging environment first
2. **Train admin users** - Document how to use the webhook admin
3. **Set up alerts** - Monitor webhook failures
4. **Create backup** - Before deploying to production
5. **Document event types** - Create guide for available webhook events

## 📞 Support

If you encounter issues:

1. Check browser console for errors
2. Check PHP error logs (`tail -f /var/log/apache2/error.log`)
3. Verify database connections
4. Test API endpoints with curl
5. Check webhook receiver logs

---

**Integration Complete! 🎉**

You now have a fully integrated webhook administration interface following StockLoyal's design patterns.
