# 🤖 StockLoyal Onboarding Robot

High-volume frontend automation that walks test members through the full onboarding flow using a real browser.

## Flow

Each robot member walks through:
```
Login → MemberOnboard → SelectBroker → Terms → StockPicker → Order → Confirmation
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Chromium browser
npm run install:browsers

# 3. Run 1 member in headed mode (watch it work)
npm run robot:single

# 4. Scale up
npm run robot:small     # 10 members, 2 parallel workers
npm run robot:medium    # 100 members, 5 workers
npm run robot:large     # 500 members, 8 workers
npm run robot:stress    # 1000 members, 10 workers
```

## Commands

| Command | Members | Workers | Mode |
|---------|---------|---------|------|
| `npm run robot:single` | 1 | 1 | Headed (visible browser) |
| `npm run robot:small` | 10 | 2 | Headless |
| `npm run robot:medium` | 100 | 5 | Headless |
| `npm run robot:large` | 500 | 8 | Headless |
| `npm run robot:stress` | 1000 | 10 | Headless |
| `npm run robot:headed` | 10 | default | Headed |
| `npm run robot:debug` | 10 | 1 | Headed + debug |

## Custom Configuration

Override via environment variables:

```bash
# Custom member count
ROBOT_COUNT=250 npx playwright test onboarding-robot.spec.js

# Custom URL (e.g., staging)
ROBOT_URL=https://staging.stockloyal.com npx playwright test

# Slow motion (ms between actions — great for demos)
ROBOT_SLOW=500 npx playwright test --headed --workers=1

# Record video for ALL runs (not just failures)
ROBOT_VIDEO=always npx playwright test

# Combine
ROBOT_COUNT=50 ROBOT_URL=http://localhost:5173 ROBOT_SLOW=200 npx playwright test --headed --workers=2
```

## Recording & Reports

### Auto-generated
- **HTML Report**: `reports/html/index.html` — run `npm run report` to open
- **JSON Results**: `reports/results.json` — machine-readable
- **Videos**: `reports/test-artifacts/` — recorded on failure (or always with `ROBOT_VIDEO=always`)
- **Screenshots**: `reports/screenshots/` — taken on failure
- **Traces**: `reports/test-artifacts/` — Playwright trace viewer for step-by-step debugging

### Viewing a trace
```bash
npx playwright show-trace reports/test-artifacts/<trace-file>.zip
```

## Test Data

The robot generates realistic randomized members with:
- Full names (from 300+ first/last name pools)
- Unique email addresses
- US addresses (40 cities with real zip codes)
- Timezone assignments
- Broker credentials (unique usernames, strong passwords)
- Stock picks (from 30+ popular tickers)

Each member gets a sequential ID: `robot-00001`, `robot-00002`, etc.

### Rejection Test Case
To test broker validation failure, the generator can create members where `username === password`, which triggers the rejection path in `broker-receiver.php`. Use `generateFailMember()` in the data generator.

## Customizing the Flow

### Adjusting form selectors
If your form fields use different `name` attributes or selectors, edit the step functions in `onboarding-robot.spec.js`:

```js
// Example: your login uses a different field name
const memberIdInput = page.locator('input[name="your_field_name"]').first();
```

### Skipping steps
Comment out steps in the test body:

```js
// await test.step("Stock Picker", async () => {
//   await stepStockPicker(page, member);
// });
```

### Adding a new step
Create a new `async function stepXxx(page, member)` and add it to the test body.

## Folder Structure

```
stockloyal-robot/
├── package.json               # Dependencies & run scripts
├── playwright.config.js       # Playwright settings
├── test-data-generator.js     # Member data factory
├── onboarding-robot.spec.js   # Main automation test
├── README.md                  # This file
└── reports/                   # Generated on run
    ├── html/                  # HTML report
    ├── screenshots/           # Failure screenshots
    ├── test-artifacts/        # Videos, traces
    └── results.json           # JSON results
```

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Your local dev server running** at `http://localhost:5173` (or set `ROBOT_URL`)
- **Database seeded** with at least one merchant and broker in `broker_master`

## Tips

- Start with `robot:single` to verify the flow works with your current pages
- Adjust selectors if elements aren't found (check failure screenshots)
- Use `robot:debug` to pause on failures and inspect the browser
- The HTML report shows timing per step — great for finding slow pages
- Videos are invaluable for debugging headless failures
