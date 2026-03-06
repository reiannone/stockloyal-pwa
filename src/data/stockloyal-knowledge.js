// src/data/stockloyal-knowledge.js
// ═══════════════════════════════════════════════════════════════════════════════
// StockLoyal Voice Assistant — Knowledge Base
//
// Edit this file to teach the AI assistant about your app.
// Everything here becomes context for the Claude API, so write in plain English.
// The assistant will use this to answer member questions naturally.
//
// TIP: You don't need to be formal — write like you're explaining to a
// smart new employee. Claude will understand nuance and context.
// ═══════════════════════════════════════════════════════════════════════════════

const STOCKLOYAL_KNOWLEDGE = {

  // ── What is StockLoyal? ──────────────────────────────────────────────────
  overview: `
    StockLoyal is a financial technology platform that converts merchant loyalty 
    points into fractional stock investments. Members earn points from partner 
    merchants (restaurants, retailers, etc.) and StockLoyal automatically invests 
    those points into real stocks and ETFs through a dedicated brokerage account.
    
    Think of it as: "Your loyalty points → real investments."
    
    IMPORTANT — HOW IT WORKS BEHIND THE SCENES:
    - StockLoyal operates as an Introducing Broker (IB)
    - Alpaca Securities LLC is the exclusive clearing/custodian broker
    - Each member gets their own individual brokerage account at Alpaca, opened 
      automatically during onboarding — no separate Alpaca account needed
    - Members do not log into Alpaca directly; StockLoyal manages it via the Broker API
    - Alpaca is a FINRA-registered broker-dealer (CRD #304483) and SIPC member
    - Member investments are held in custody at Alpaca Securities
    
    The app is a Progressive Web App (PWA) that works on mobile and desktop.
    Members access it via a link from their merchant's loyalty program.
  `,

  // ── The Onboarding Journey ───────────────────────────────────────────────
  onboarding: `
    New members go through these steps (tracked on the StockLoyal Landing page):

    1. LOGIN / CREATE ACCOUNT
       - Members arrive via a splash screen URL from their merchant
       - They create an account with username, email, and password
       - Username is typically their merchant member ID

    2. MEMBER PROFILE (Member Onboard) — 4-step wizard
       Step 1 - Profile:
       - Required: first name, last name, email, phone number, date of birth
       - Optional: middle name, avatar photo
       - Phone type selector: Mobile, Landline, or Business
       - Must be 18+ to open a brokerage account
       - Address autocomplete is available (powered by Geoapify)

       Step 2 - Address:
       - Required: street address, city, state, ZIP code
       - Optional: address line 2, country, timezone
       
       Step 3 - Financial / KYC:
       - Social Security Number (SSN) — encrypted, only last 4 digits shown
       - Primary funding source (employment, investments, inheritance, etc.)
       - Regulatory disclosures (control person, FINRA affiliated, PEP)
       
       Step 4 - Review & Submit:
       - Review all entered information
       - Submit creates both the StockLoyal profile AND the Alpaca brokerage account

    3. SELECT BROKER
       - StockLoyal currently uses Alpaca Securities as its exclusive broker
       - A brokerage account is created automatically during onboarding
       - Each member gets their own individual Alpaca account — no separate login needed
       - The account is managed entirely through StockLoyal via the Broker API

    4. INVESTMENT ELECTION
       - Choose election type: "immediate" (T+1) or "monthly" subscription
       - Monthly subscribers set a sweep percentage (25%, 50%, or 100%)
       - Monthly sweep means: each month, X% of points auto-convert to investments
       - Immediate means: member manually chooses when to invest

    5. TERMS & CONDITIONS
       - Must accept before investing
       - Covers the StockLoyal Introducing Broker relationship and Alpaca as custodian

    After completing all steps, members can access the Wallet and start investing.
  `,

  // ── Points & Cash Conversion ─────────────────────────────────────────────
  points: `
    HOW POINTS WORK:
    - Members earn loyalty points from their merchant partner
    - Points are synced from the merchant's system via webhooks
    - Each merchant has a conversion rate (e.g., 0.01 = 1 point = $0.01)
    - Example: 10,000 points at 0.01 rate = $100 cash value
    
    MEMBER TIERS:
    - Merchants can define tiers (e.g., Gold, Silver, Platinum)
    - Different tiers may have different conversion rates
    - Tier is set by the merchant, not the member
    
    POINTS REFRESH:
    - Points balance can be refreshed from the Wallet page
    - The refresh calls the merchant's system to get the latest balance
    - Last sync timestamp is displayed on the Wallet
  `,

  // ── The Investment Flow ──────────────────────────────────────────────────
  investing: `
    HOW TO INVEST (Stock Picker Flow):

    1. POINTS SLIDER (PointsSlider page)
       - Member selects how many points to convert
       - Range slider with haptic feedback
       - Can also type a cash amount directly
       - Must be within broker's min/max order limits
       - Broker minimum: $5.00 per individual order
       - Broker maximum: $5,000 per basket (total across all stocks)
       - Maximum stocks per basket: 10 (set by Alpaca)
       - Shows real-time points-to-cash conversion

    2. FILL BASKET (FillBasket page)
       - Browse stocks by category: Popular Member Picks, Most Active, 
         Growth Tech, Mutual Funds, ETFs, Crypto, Large Caps, Small Caps,
         Day Gainers, Day Losers
       - Search by symbol (e.g., AAPL) or company name (e.g., Apple)
       - Select stocks via checkboxes in the stock list overlay
       - Selected stocks appear in "My Basket" table
       - Cash is split equally across selected stocks by default
       - Members can save favorite stocks (heart icon)
       - Can remove stocks from basket (trash icon)
       - Maximum 10 stocks per basket (Alpaca limit — shown in Stock Picker)

    3. ORDER REVIEW (Order page)
       - Shows all stocks in basket with share quantities and allocations
       - Displays total investment amount
       - Member confirms the buy order

    4. ORDER CONFIRMATION
       - Shows success message with order details
       - Can share investment on social media
       - Navigates back to Wallet

    IMPORTANT RULES:
    - Investments are fractional — you can buy $5 worth of a $200 stock
    - Stock prices are delayed ~15 minutes (not real-time)
    - All trades go through the member's Alpaca brokerage account
    - Orders may show as "pending" until the broker executes them
    - Members can also buy and sell directly from the Portfolio page
    - Market orders execute during trading hours (Mon-Fri 9:30am-4pm ET)
  `,

  // ── Wallet ───────────────────────────────────────────────────────────────
  wallet: `
    The Wallet is the member's main dashboard. It shows:
    
    - AVAILABLE CASH VALUE: Points converted to dollar amount
    - POINTS BALANCE: Raw loyalty points from merchant
    - MEMBER TIER: If applicable (Gold, Silver, etc.)
    - SWEEP PERCENTAGE: For monthly subscribers
    - PORTFOLIO VALUE: Market value of investments held at Alpaca
    - "Convert to Invest Basket" button: Opens the stock picker flow
    
    QUICK LINKS (tile grid):
    - Trade Orders: View all orders (defaults to pending filter if any exist)
    - Transactions: Full transaction ledger
    
    The portfolio card is clickable and navigates to the full Portfolio page.
    
    NOTES:
    - If no broker is linked, the invest button is disabled
    - Portfolio value comes from Alpaca and may be delayed
    - Points are refreshable via a button on the landing page
    - Portfolio card navigates to full Portfolio page with buy/sell capabilities
  `,

  // ── Portfolio ────────────────────────────────────────────────────────────
  portfolio: `
    The Portfolio page shows all stocks the member owns through their Alpaca account:
    - Stock symbol and company name
    - Number of shares (fractional)
    - Current market value and cost basis
    - Unrealized gain/loss per position
    - Total portfolio value and buying power
    
    BUYING STOCKS FROM PORTFOLIO:
    - "Buy Stock" button at the top opens a buy modal for new positions
    - Each existing position has a "Buy" button to add more shares
    - Buy by dollar amount (notional) or by number of shares
    - Market orders or limit orders (day, GTC, IOC time-in-force)
    - "Use Max" button to invest full buying power
    - Shows estimated cost and available buying power
    - Notional (dollar) orders must be market + day
    - Limit orders require share quantity, not dollar amount
    
    SELLING STOCKS:
    - Each position has a "Sell" button
    - Sell by share quantity
    - Market or limit orders
    - Shows current shares owned
    
    BOTTOM NAVIGATION BUTTONS:
    - Alpaca Trades: View brokerage trade execution history
    - Alpaca Funding: View money flow and funding history
    - Back to Wallet: Return to main dashboard
    
    NOTE: Portfolio data comes from Alpaca Securities and shows positions
    held in the member's individual brokerage account.
  `,

  // ── Orders & Transactions ────────────────────────────────────────────────
  orders: `
    TRADE ORDERS (Transactions page):
    - Shows all buy orders placed through StockLoyal
    - Can filter by: status, symbol, date, order type
    - Auto-defaults to "pending" filter when pending orders exist
    - Orders are grouped by basket (multiple stocks per order)
    - Statuses: pending, approved, funded, placed, settled, failed

    ORDER STATUS PIPELINE (what happens after you invest):
    - pending: Order prepared and staged by StockLoyal
    - approved: Order confirmed and ready for merchant funding
    - funded: Cash journaled from StockLoyal sweep account into your Alpaca account
    - placed: Order submitted to Alpaca for execution
    - settled: Trade fully executed and confirmed
    - failed: Order could not be completed
    
    TRANSACTION LEDGER (/ledger):
    - Complete record of all financial transactions
    - Points conversions, cash movements, order amounts
    - Shows direction (inbound/outbound), channel, and status
    - Filterable by type, status, and date
    
    BROKERAGE TRADE HISTORY (/alpaca-transactions):
    - Shows actual trade executions from Alpaca
    - Includes filled price, quantity, side (buy/sell)
    - Shows order status from broker's perspective
    - Accessible from Portfolio bottom buttons
    
    BROKERAGE FUNDING HISTORY (/funding-history):
    - Shows the complete money flow into your brokerage account
    - Four tabs: Overview, Transfers, Journals, Activity
    - Transfers: ACH deposits/withdrawals (via Plaid)
    - Journals (JNLC): Cash moved from StockLoyal's IB sweep account to your Alpaca account
    - Activity: Deposits (CSD), withdrawals (CSW), dividends (DIV)
    - Summary cards show totals for each category
    - Money flow diagram: Merchant Payment → SL Sweep Account → Journal → Your Alpaca Account → Trades
    - Filterable by time period (7 days to 1 year)
  `,

  // ── Election Types ───────────────────────────────────────────────────────
  election: `
    INVESTMENT ELECTION:
    
    IMMEDIATE (T+1):
    - Member manually chooses when to invest
    - "T+1" means trade executes next business day
    - Member controls every investment decision
    
    MONTHLY SUBSCRIPTION:
    - Auto-invests a percentage of points each month
    - Sweep percentages: 25%, 50%, or 100%
    - Example: 100% sweep = all points auto-invest monthly
    - Uses the member's existing basket/stock picks
    - Sweep day is set by the merchant
    
    Members can change their election type at any time from the 
    Investment Election page.
  `,

  // ── Brokers ──────────────────────────────────────────────────────────────
  brokers: `
    CURRENT BROKER: Alpaca Securities LLC (exclusive)
    - StockLoyal uses the Alpaca Broker API to manage individual brokerage accounts
    - Each member gets their own Alpaca brokerage account created during onboarding
    - No separate Alpaca login needed — account is fully managed through StockLoyal
    - Alpaca is FINRA-registered (CRD #304483) and a SIPC member
    - Supports fractional share trading
    - Commission-free stock and ETF trading
    
    HOW MONEY FLOWS:
    1. Member earns loyalty points from merchant
    2. Member elects to invest (immediate or monthly sweep)
    3. Merchant transfers funds via ACH into StockLoyal's IB sweep account
    4. StockLoyal journals (JNLC transfer) funds from sweep account into member's Alpaca account
    5. Orders are submitted to Alpaca for execution
    6. Stocks are purchased and held in the member's Alpaca account
    
    Members do NOT need to link an existing brokerage account. A new, dedicated 
    Alpaca account is opened on their behalf as part of onboarding.
    
    ACCOUNT STATUSES:
    - SUBMITTED: Account application sent to Alpaca
    - ACTIVE: Account approved and ready for trading
    - APPROVAL_PENDING: Under review
    
    TRADING HOURS:
    - Regular market: Mon-Fri 9:30 AM - 4:00 PM ET
    - Orders placed outside market hours queue for next open
  `,

  // ── Social / Community ───────────────────────────────────────────────────
  social: `
    COMMUNITY FEED:
    - Members can view and create posts about their investments
    - Share investment milestones
    - Comment on other members' posts
    - Accessible from the Community Feed page
    
    SHARE YOUR INVESTMENT:
    - After placing an order, members can share on social media
    - Shows what stocks they invested in and the amount
    - Available on the Order Confirmation page
  `,

  // ── Common Questions & Troubleshooting ───────────────────────────────────
  faq: `
    Q: Why can't I click "Convert to Invest Basket"?
    A: You need to complete onboarding first — your Alpaca brokerage account must 
       be active. Go to Select Broker if you haven't finished setup yet.

    Q: Why are my points showing as zero?
    A: Points come from your merchant. Try refreshing your points from the home page. 
       If still zero, contact your merchant's loyalty program.

    Q: Can I withdraw cash instead of investing?
    A: No — StockLoyal converts points to stock investments only. 
       Points cannot be cashed out directly.

    Q: Do I need an existing brokerage account?
    A: No. StockLoyal opens a new, dedicated Alpaca brokerage account on your behalf 
       during onboarding. You don't need a Schwab, Fidelity, or Robinhood account.

    Q: Where are my shares held?
    A: Your shares are held in your individual brokerage account at Alpaca Securities LLC, 
       a FINRA-registered broker-dealer and SIPC member. You can view your account at 
       alpaca.markets once active.

    Q: How do I buy stocks from my portfolio?
    A: Go to Portfolio and tap "Buy Stock" for a new position, or tap the "Buy" 
       button next to any stock you already own. You can buy by dollar amount 
       or number of shares, using market or limit orders.

    Q: How do I sell my stocks?
    A: Go to Portfolio and tap the "Sell" button next to the stock you want to sell.
       You can sell by share quantity using market or limit orders.

    Q: Why is my order still "pending"?
    A: Orders go through a multi-step pipeline: approved → funded (cash journaled to 
       your Alpaca account) → placed (submitted to broker) → settled. Each step 
       can take up to 1 business day. If pending for more than 2 days, contact support.

    Q: Can I cancel a pending order?
    A: Currently, orders cannot be cancelled through StockLoyal once submitted.
       Contact support for assistance.

    Q: What is the minimum investment?
    A: The minimum is $5.00 per individual stock order. The maximum basket total 
       is $5,000, and you can select up to 10 stocks per basket. These limits are 
       set by Alpaca Securities and shown on the Points Slider page.

    Q: Where can I see how my money flows into my brokerage account?
    A: Go to Funding History (accessible from Portfolio). It shows ACH transfers, 
       journal entries from StockLoyal's sweep account to yours, and any dividends.

    Q: What is a journal (JNLC)?
    A: A journal is a cash transfer from StockLoyal's firm sweep account to your 
       individual Alpaca brokerage account. This is how your converted points become 
       buying power for stock purchases. JNLC stands for Journal Cash.

    Q: What is the sweep account?
    A: The sweep account is StockLoyal's omnibus firm account at Alpaca. It holds 
       funds collected from merchant ACH payments and acts as the source for all 
       journal transfers into individual member accounts. Members do not have direct 
       access to this account — it is managed by StockLoyal as the Introducing Broker.

    Q: Where can I see my actual trade executions?
    A: Go to Alpaca Trades (accessible from Portfolio) to see filled prices, 
       quantities, and execution details from the broker.

    Q: Why do I need to enter my SSN during onboarding?
    A: Your SSN is required by federal regulations (KYC/AML) to open a brokerage account.
       It is AES-encrypted and securely transmitted to Alpaca Securities. StockLoyal 
       only stores an encrypted version and never shows more than the last 4 digits.

    Q: Is my brokerage account password shared with StockLoyal?
    A: No. StockLoyal uses the Alpaca Broker API to manage your account — you don't 
       have a separate Alpaca password. StockLoyal holds API credentials, not your 
       personal login details.

    Q: Are there fees?
    A: StockLoyal may charge merchant-level fees. Trading through Alpaca is 
       commission-free for stocks and ETFs.

    Q: Is my data secure?
    A: Yes. SSN is AES-encrypted. The app uses HTTPS/TLS encryption. Your investments 
       are held at Alpaca Securities, a FINRA-registered broker-dealer with SIPC coverage 
       up to $500,000.

    Q: What happens to my investments if I leave the merchant's loyalty program?
    A: Your investments remain in your brokerage account at Alpaca. You own the stocks 
       regardless of your loyalty program status.

    Q: What is buying power?
    A: Buying power is the cash available in your Alpaca brokerage account to purchase 
       stocks. It comes from journaled funds (converted loyalty points) and any 
       dividends you've earned.

    Q: How many stocks can I pick per basket?
    A: Up to 10 stocks per basket. This limit is set by Alpaca Securities and is 
       displayed in the Stock Picker when you're selecting stocks.
  `,

  // ── App Navigation Map ───────────────────────────────────────────────────
  navigation: `
    MAIN MEMBER PAGES:
    - Home / Landing: /stockloyal-landing — Setup progress + quick links
    - Login: /login — Sign in or create account
    - Member Profile: /member-onboard — Personal info + KYC wizard (4 steps)
    - Select Broker: /select-broker — Alpaca account setup (automatic)
    - Investment Election: /election — Choose immediate or monthly
    - Terms: /terms — Terms & conditions (StockLoyal IB + Alpaca custodian)
    - Wallet: /wallet — Main dashboard with balances
    - Points Slider: /points-slider — Select investment amount (min $5, max $5,000)
    - Stock Picker: /fill-basket — Browse and select stocks (max 10 per basket)
    - Order: /order — Review and place order
    - Order Confirmation: /order-confirmation — Success page
    - Portfolio: /portfolio — View owned stocks, buy/sell directly
    - Trade Orders: /transactions — StockLoyal order history with filters
    - Transaction Ledger: /ledger — Complete financial record
    - Brokerage Trade History: /alpaca-transactions — Broker trade executions at Alpaca
    - Brokerage Funding History: /funding-history — Money flow: transfers, journals, dividends
    - Promotions: /promotions — Merchant offers
    - Community Feed: /social — Social posts
    - About & FAQs: /about — Help and information
  `,

  // ── Voice Assistant Personality ───────────────────────────────────────────
  personality: `
    You are the StockLoyal AI Assistant. Your personality:
    - Friendly, helpful, and concise
    - You speak like a knowledgeable financial advisor who keeps things simple
    - You never give specific investment advice (don't say "buy AAPL")
    - You DO help members navigate the app and understand features
    - Keep responses under 2-3 sentences when possible
    - Use the member's name when you know it
    - If you don't know something, say so and suggest where to find help
    - Never make up information about the member's account
    - Always use real data from API calls, never fabricate numbers
    - When asked about brokers or brokerage accounts, clarify that Alpaca is the 
      exclusive broker and no separate account or login is needed
  `,
};

export default STOCKLOYAL_KNOWLEDGE;
