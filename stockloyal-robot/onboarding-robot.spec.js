// onboarding-robot.spec.js
// ═══════════════════════════════════════════════════════════════════════════════
// StockLoyal Onboarding Robot — high-volume frontend automation
//
// Replicates the real DemoLaunch flow for each generated member:
//   0. Call demo-inbound.php (same webhook DemoLaunch.jsx calls)
//   1. Navigate to splash URL → SplashScreen → Promotions
//   2. Promotions → "Get Started" → Login
//   3. Login → create account
//   4. MemberOnboard (personal info form)
//   5. SelectBroker (broker credentials + validation)
//   6. Terms (acceptance)
//   7. StockPicker → Order → OrderConfirmation
//
// Usage:
//   npm run robot:single    # 1 member, headed, watch it work
//   npm run robot:small     # 10 members, 2 workers
//   npm run robot:medium    # 100 members, 5 workers
//   npm run robot:stress    # 1000 members, 10 workers
// ═══════════════════════════════════════════════════════════════════════════════

import { test, expect } from "@playwright/test";
import { generateBatch } from "./test-data-generator.js";

// ── Configuration ──────────────────────────────────────────────────────────────
const MEMBER_COUNT = parseInt(process.env.ROBOT_COUNT || "10", 10);
const BASE_URL     = process.env.ROBOT_URL || "http://localhost:5173";
const API_BASE     = process.env.ROBOT_API || "https://api.stockloyal.com/api";
const MERCHANT_ID  = process.env.ROBOT_MERCHANT || "merchant001";
const SLOW_MO      = parseInt(process.env.ROBOT_SLOW || "0", 10);

const NAV_TIMEOUT = 30_000;

// ── Deterministic member generation ────────────────────────────────────────────
const MEMBERS = generateBatch(MEMBER_COUNT);

const FIRST_POOL = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen","Christopher","Lisa","Daniel","Nancy","Matthew","Betty","Anthony","Margaret"];
const LAST_POOL = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White"];

for (let i = 0; i < MEMBERS.length; i++) {
  MEMBERS[i].firstName = FIRST_POOL[i % FIRST_POOL.length];
  MEMBERS[i].lastName = LAST_POOL[i % LAST_POOL.length];
  MEMBERS[i].email = `${MEMBERS[i].firstName.toLowerCase()}.${MEMBERS[i].lastName.toLowerCase()}.${i + 1}@testrobot.com`;
}

console.log(`\n🤖 StockLoyal Robot: ${MEMBERS.length} members | ${BASE_URL} | API: ${API_BASE}\n`);

// ── Helper: safe screenshot ────────────────────────────────────────────────────
async function snap(page, name) {
  await page.screenshot({
    path: `reports/screenshots/${name}.png`,
    fullPage: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 0: Call demo-inbound.php — same webhook DemoLaunch.jsx fires
 * Sets up wallet (existing member) or queues pending_inbound (new member)
 */
async function stepDemoInbound(page, member) {
  const response = await page.request.post(`${API_BASE}/demo-inbound.php`, {
    data: {
      merchant_id: MERCHANT_ID,
      member_id: member.memberId,
      points: member.points,
      tier: "",
      action: "earn",
    },
    headers: { "Content-Type": "application/json" },
  });

  const body = await response.json().catch(() => null);
  console.log(`  [demo-inbound] ${member.memberId}: ${response.status()} — ${body?.member_exists ? "existing" : "new"} member, ${member.points} pts`);

  if (!response.ok()) {
    throw new Error(`demo-inbound.php returned ${response.status()}: ${JSON.stringify(body)}`);
  }

  return body;
}

/**
 * Step 1: Navigate to Splash URL → waits for SplashScreen animation → auto-routes
 */
async function stepSplash(page, member) {
  const splashUrl = `${BASE_URL}/?member_id=${encodeURIComponent(member.memberId)}&merchant_id=${encodeURIComponent(MERCHANT_ID)}`;

  // Clear prior session first
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());

  // Navigate to splash with params (like DemoLaunch opening a new tab)
  await page.goto(splashUrl, { waitUntil: "networkidle" });

  // SplashScreen has ~3s animation then auto-routes to /promotions or /login
  await page.waitForTimeout(4000);
}

/**
 * Step 2: Promotions → click "Get Started"
 */
async function stepPromotions(page, member) {
  const url = page.url();

  // If splash routed us directly to /login, skip
  if (url.includes("/login")) {
    console.log(`  [promotions] Skipped — routed directly to login`);
    return;
  }

  // We should be on /promotions
  if (!url.includes("/promotions")) {
    await page.waitForTimeout(2000);
  }

  // Click "Get Started" or similar CTA
  const getStarted = page.locator('button:has-text("Get Started"), button:has-text("Start"), button:has-text("Continue"), a:has-text("Get Started")').first();
  if (await getStarted.isVisible({ timeout: 5000 }).catch(() => false)) {
    await getStarted.click();
    await page.waitForTimeout(2000);
  }
}

/**
 * Step 3: Login — for new members, Login auto-detects no wallet and shows
 * the "Create Account" form with fields: username, email, password, confirmPassword.
 * Username is pre-filled from localStorage memberId (set by SplashScreen).
 */
async function stepLogin(page, member) {
  // Wait for Login to finish its "checking" phase and render a form
  await page.waitForTimeout(3000);
  const url = page.url();

  if (!url.includes("/login")) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
  }

  // ── Detect which mode we're in ──
  // For new members (no wallet), Login auto-switches to "create" mode
  // The create form has: username, email, password, confirmPassword
  // The login form has: identifier (username/email), password

  // Check if we're on the create form (has a placeholder "e.g., robert")
  const usernameField = page.locator('input[placeholder="e.g., robert"]').first();
  const emailField = page.locator('input[placeholder="e.g., robert@email.com"]').first();
  const isCreateMode = await usernameField.isVisible({ timeout: 5000 }).catch(() => false);

  if (isCreateMode) {
    console.log(`  [login] Create mode — filling registration form`);

    // Username should be pre-filled with memberId, but verify
    const currentUsername = await usernameField.inputValue().catch(() => "");
    if (!currentUsername || currentUsername !== member.memberId) {
      await usernameField.fill(member.memberId);
    }

    // Email
    if (await emailField.isVisible().catch(() => false)) {
      await emailField.fill(member.email);
    }

    // Password fields — the create form has two password fields
    const pwFields = page.locator('input[type="password"]');
    const pwCount = await pwFields.count();
    if (pwCount >= 1) await pwFields.nth(0).fill("Robot123!");
    if (pwCount >= 2) await pwFields.nth(1).fill("Robot123!");

    // Submit — button says "Create Account" or similar
    const createBtn = page.locator('button[type="submit"]').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
    }
  } else {
    console.log(`  [login] Login mode — filling login form`);

    // Login form: identifier + password
    const identifierField = page.locator('input[placeholder*="robert"]').first();
    if (await identifierField.isVisible().catch(() => false)) {
      await identifierField.fill(member.memberId);
    }

    const pwField = page.locator('input[type="password"]').first();
    if (await pwField.isVisible().catch(() => false)) {
      await pwField.fill("Robot123!");
    }

    const loginBtn = page.locator('button[type="submit"]').first();
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
    }
  }

  // Wait for navigation after login/create
  await page.waitForTimeout(3000);
}

/**
 * Step 4: MemberOnboard — fill personal info form
 */
async function stepMemberOnboard(page, member) {
  const url = page.url();
  if (!url.includes("member-onboard")) {
    await page.goto(`${BASE_URL}/member-onboard`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(1000);

  // ── Fill name fields ──
  const nameFields = {
    first_name: member.firstName,
    middle_name: member.middleName,
    last_name: member.lastName,
  };
  for (const [name, value] of Object.entries(nameFields)) {
    if (!value) continue;
    const input = page.locator(`input[name="${name}"]`).first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value);
    }
  }

  // ── Email (may be pre-filled) ──
  const emailInput = page.locator('input[name="member_email"]').first();
  if (await emailInput.isVisible().catch(() => false)) {
    const val = await emailInput.inputValue().catch(() => "");
    if (!val) await emailInput.fill(member.email);
  }

  // ── Address fields (text inputs) ──
  const addressFields = {
    member_address_line1: member.addressLine1,
    member_address_line2: member.addressLine2,
    member_town_city:     member.city,
    member_zip:           member.zip,
  };
  for (const [name, value] of Object.entries(addressFields)) {
    if (!value) continue;
    const input = page.locator(`input[name="${name}"]`).first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value);
    }
  }

  // ── State dropdown (select by code e.g. "NY") ──
  const stateSelect = page.locator('select[name="member_state"]').first();
  if (await stateSelect.isVisible().catch(() => false)) {
    await stateSelect.selectOption(member.state);
  }

  // ── Country dropdown (select by code e.g. "US") ──
  const countrySelect = page.locator('select[name="member_country"]').first();
  if (await countrySelect.isVisible().catch(() => false)) {
    await countrySelect.selectOption(member.country);
  }

  // ── Timezone select ──
  const tzSelect = page.locator('select[name="member_timezone"]').first();
  if (await tzSelect.isVisible().catch(() => false)) {
    await tzSelect.selectOption(member.timezone).catch(() => {});
  }

  await page.waitForTimeout(300);
  if (SLOW_MO) await page.waitForTimeout(SLOW_MO);

  // ── Submit ──
  const saveBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Continue"), button:has-text("Next")').first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
  }

  await page.waitForTimeout(2000);
}

/**
 * Step 5: SelectBroker — pick broker, enter credentials, handle validation modal
 */
async function stepSelectBroker(page, member) {
  const url = page.url();
  if (!url.includes("select-broker")) {
    await page.goto(`${BASE_URL}/select-broker`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(1000);

  // ── Select broker card ──
  const brokerCard = page.getByRole('button', { name: member.broker }).first();
  if (await brokerCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await brokerCard.click();
    await page.waitForTimeout(500);
  } else {
    // Fallback: click first available broker
    console.log(`  [broker] "${member.broker}" not found, clicking first available`);
    const firstCard = page.locator('button:has-text("Fidelity"), button:has-text("Robinhood"), button:has-text("Public")').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await page.waitForTimeout(500);
    }
  }

  // ── Fill credentials ──
  // Labels aren't linked to inputs (no htmlFor). Locate by sibling text.
  // Each field is: <div> <label>Username at X</label> <input .form-input /> </div>
  
  // Username
  const userDiv = page.locator('div:has(> label:text-matches("Username", "i"))').first();
  const userField = userDiv.locator('input').first();
  if (await userField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await userField.fill(member.brokerUsername);
    console.log(`  [broker] Username filled: ${member.brokerUsername}`);
  }

  // Password (label starts with "Password for")
  const pwDiv = page.locator('div:has(> label:text-matches("^Password", "i"))').first();
  const pwField = pwDiv.locator('input').first();
  if (await pwField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pwField.fill(member.brokerPassword);
  }

  // Confirm password
  const confirmDiv = page.locator('div:has(> label:text-matches("Confirm", "i"))').first();
  const confirmPw = confirmDiv.locator('input').first();
  if (await confirmPw.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmPw.fill(member.brokerPassword);
  }

  if (SLOW_MO) await page.waitForTimeout(SLOW_MO);

  // ── Submit — wait for button to become enabled (form validation) ──
  const saveBtn = page.getByRole('button', { name: 'Save and Continue' });
  await saveBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  // Wait until enabled (fields validation passes)
  await page.waitForTimeout(500);
  await saveBtn.click({ timeout: 10_000 });

  await page.waitForTimeout(3000);

  // ── Handle validation modal (ConfirmModal - inline styles, no classes/roles) ──
  // Modal is a fixed overlay with z-index 9999. Button text: "Continue" (success) or "Try Again" (fail)
  // cancelLabel={null} means only one button visible in the modal
  
  // Wait for the "Continue" or "Try Again" button to appear
  const continueBtn = page.locator('button:has-text("Continue")');
  const tryAgainBtn = page.locator('button:has-text("Try Again")');
  
  // The validation webhook takes a few seconds — wait for either button
  const foundContinue = await continueBtn.first().isVisible({ timeout: 15_000 }).catch(() => false);
  
  if (foundContinue) {
    // There might be multiple "Continue" buttons — click the last one (modal is on top)
    const count = await continueBtn.count();
    console.log(`  [broker] ✅ Credentials verified — clicking Continue (${count} found)`);
    await continueBtn.nth(count - 1).click();
    await page.waitForTimeout(1500);
  } else if (await tryAgainBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    const count = await tryAgainBtn.count();
    console.log(`  ⚠️ Broker validation failed for ${member.memberId} — clicking Try Again`);
    await tryAgainBtn.nth(count - 1).click();
    await page.waitForTimeout(1000);
  } else {
    console.log(`  [broker] No validation modal appeared`);
  }
}

/**
 * Step 6: Terms — accept and continue
 */
async function stepTerms(page, member) {
  const url = page.url();
  if (!url.includes("terms")) {
    await page.goto(`${BASE_URL}/terms`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(500);

  // Click "I Agree & Continue"
  const acceptBtn = page.getByRole('button', { name: /agree/i }).first();
  if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await acceptBtn.click();
  }

  await page.waitForTimeout(1500);
}

/**
 * Step 7: Election — choose investment type and sweep percentage
 * Defaults: "monthly" + random percentage (25/50/100)
 */
async function stepElection(page, member) {
  const url = page.url();
  if (!url.includes("election")) {
    await page.goto(`${BASE_URL}/election`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(1000);

  // Select "Monthly Subscription" — click the label that contains the radio
  const monthlyLabel = page.locator('label:has-text("Monthly Subscription")').first();
  if (await monthlyLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
    await monthlyLabel.click();
    await page.waitForTimeout(500);
  } else {
    // Fallback: try clicking the radio directly
    const monthlyRadio = page.locator('input[value="monthly"]');
    if (await monthlyRadio.isVisible().catch(() => false)) {
      await monthlyRadio.check({ force: true });
      await page.waitForTimeout(500);
    }
  }

  // Pick sweep percentage — cycle 25/50/100 by member index
  const pctOptions = [25, 50, 100];
  const pct = pctOptions[member.index % pctOptions.length];
  const pctBtn = page.locator(`button:has-text("${pct}%")`).first();
  if (await pctBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pctBtn.click();
    await page.waitForTimeout(300);
    console.log(`  [election] Monthly @ ${pct}%`);
  }

  // Click "Save & Continue"
  const saveBtn = page.locator('button:has-text("Save")').first();
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
  }

  // Election navigates to /wallet — wait for it and handle any warning modals
  await page.waitForTimeout(2000);

  // Wallet may show warning modals (Broker Required, Election Required, etc.)
  // ConfirmModal has no classes — detect by looking for CTA button text
  const walletModalBtn = page.locator('button:has-text("Go to"), button:has-text("OK"), button:has-text("Confirm")').first();
  if (await walletModalBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`  [election] Wallet showed a warning modal — dismissing`);
    await walletModalBtn.click();
    await page.waitForTimeout(1000);
  }
}

/**
 * Step 7: StockPicker — search and select a stock
 */
async function stepStockPicker(page, member) {
  // Election navigates to /wallet which may redirect — force navigate to stock-picker
  await page.goto(`${BASE_URL}/stock-picker`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const ticker = member.stockPicks[0] || "AAPL";

  const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"], input[name="search"]').first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill(ticker);
    await page.waitForTimeout(2000);

    const result = page.locator(`text=${ticker}`).first();
    if (await result.isVisible({ timeout: 5000 }).catch(() => false)) {
      await result.click();
      await page.waitForTimeout(500);
    }
  }

  const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Confirm"), button:has-text("Select")').first();
  if (await nextBtn.isVisible().catch(() => false)) {
    await nextBtn.click();
  }

  await page.waitForTimeout(1500);
}

/**
 * Step 8: Order — review and place
 */
async function stepOrder(page, member) {
  await page.waitForTimeout(1000);

  const placeBtn = page.locator('button:has-text("Place Order"), button:has-text("Confirm Order"), button:has-text("Submit"), button:has-text("Continue")').first();
  if (await placeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await placeBtn.click();
    await page.waitForTimeout(2000);
  }

  // Confirmation modal
  const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")').first();
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1500);
  }
}

/**
 * Step 9: Order Confirmation — verify success
 */
async function stepOrderConfirmation(page, member) {
  await page.waitForTimeout(1000);

  const successText = page.locator('text=order, text=confirmation, text=success, text=Thank you, text=Confirmed').first();
  const onConfirmation = await successText.isVisible({ timeout: 5000 }).catch(() => false);

  if (onConfirmation) {
    console.log(`  ✅ ${member.memberId}: Order confirmed`);
  } else {
    console.log(`  ℹ️  ${member.memberId}: Flow completed (final page: ${page.url()})`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEST GENERATION — one test per member, parallel execution
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("🤖 StockLoyal Onboarding Robot", () => {
  for (const member of MEMBERS) {
    test(`Onboard member ${member.memberId} (${member.firstName} ${member.lastName})`, async ({ page }) => {
      const startTime = Date.now();

      try {
        await test.step("Demo Inbound (webhook)", async () => {
          await stepDemoInbound(page, member);
        });

        await test.step("Splash Screen", async () => {
          await stepSplash(page, member);
        });

        await test.step("Promotions", async () => {
          await stepPromotions(page, member);
        });

        await test.step("Login / Register", async () => {
          await stepLogin(page, member);
        });

        await test.step("Member Onboard", async () => {
          await stepMemberOnboard(page, member);
        });

        await test.step("Select Broker", async () => {
          await stepSelectBroker(page, member);
        });

        await test.step("Terms Acceptance", async () => {
          await stepTerms(page, member);
        });

        await test.step("Election", async () => {
          await stepElection(page, member);
        });

        await test.step("Stock Picker", async () => {
          await stepStockPicker(page, member);
        });

        await test.step("Place Order", async () => {
          await stepOrder(page, member);
        });

        await test.step("Order Confirmation", async () => {
          await stepOrderConfirmation(page, member);
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ ${member.memberId} completed in ${elapsed}s`);

      } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ ${member.memberId} failed after ${elapsed}s: ${err.message}`);
        await snap(page, `FAIL-${member.memberId}`);
        throw err;
      }
    });
  }
});
