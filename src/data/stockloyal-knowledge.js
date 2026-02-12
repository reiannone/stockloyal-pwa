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
    merchants (restaurants, retailers, etc.) and can invest those points into 
    real stocks, ETFs, mutual funds, and crypto through connected brokerage accounts.
    
    Think of it as: "Your loyalty points → real investments."
    
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

    2. MEMBER PROFILE (Member Onboard)
       - Required fields: first name, last name, email, address line 1,
         city, state, zip, country, timezone
       - Optional: middle name, address line 2, phone, avatar photo
       - Address autocomplete is available (powered by Geoapify)

    3. SELECT BROKER
       - Members choose a brokerage (e.g., Robinhood, Fidelity, Public)
       - They enter broker credentials (username + password)
       - Credentials are validated via webhook to the broker
       - Each broker has min/max order amounts (e.g., $1 min, $500 max)

    4. INVESTMENT ELECTION
       - Choose election type: "immediate" (T+1) or "monthly" subscription
       - Monthly subscribers set a sweep percentage (25%, 50%, or 100%)
       - Monthly sweep means: each month, X% of points auto-convert to investments
       - Immediate means: member manually chooses when to invest

    5. TERMS & CONDITIONS
       - Must accept before investing

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
    - All trades go through the member's connected broker
    - Orders may show as "pending" until the broker executes them
    - Members cannot sell stocks through StockLoyal (sell via broker directly)
  `,

  // ── Wallet ───────────────────────────────────────────────────────────────
  wallet: `
    The Wallet is the member's main dashboard. It shows:
    
    - AVAILABLE CASH VALUE: Points converted to dollar amount
    - POINTS BALANCE: Raw loyalty points from merchant
    - MEMBER TIER: If applicable (Gold, Silver, etc.)
    - SWEEP PERCENTAGE: For monthly subscribers
    - PORTFOLIO VALUE: Market value of investments held at broker
    - "Convert to Invest Basket" button: Opens the stock picker flow
    
    QUICK LINKS (tile grid):
    - Trade Orders: View all orders (defaults to pending filter if any exist)
    - Transactions: Full transaction ledger
    
    The portfolio card is clickable and navigates to the full Portfolio page.
    
    NOTES:
    - If no broker is linked, the invest button is disabled
    - Portfolio value comes from the broker and may be delayed
    - Points are refreshable via a button on the landing page
  `,

  // ── Portfolio ────────────────────────────────────────────────────────────
  portfolio: `
    The Portfolio page shows all stocks the member owns through StockLoyal:
    - Stock symbol and company name
    - Number of shares (fractional)
    - Current market value
    - Total portfolio value
    
    NOTE: This only shows investments made through StockLoyal, not the 
    member's entire brokerage portfolio. For full portfolio view, members 
    should check their broker's app directly.
  `,

  // ── Orders & Transactions ────────────────────────────────────────────────
  orders: `
    TRADE ORDERS (Transactions page):
    - Shows all buy orders placed through StockLoyal
    - Can filter by: status, symbol, date, order type
    - Auto-defaults to "pending" filter when pending orders exist
    - Orders are grouped by basket (multiple stocks per order)
    - Statuses: pending, queued, executed, confirmed, failed, partial
    
    TRANSACTION LEDGER:
    - Complete record of all financial transactions
    - Points conversions, cash movements, order amounts
    - Exportable data
    
    ORDER STATUSES EXPLAINED:
    - Pending: Order submitted, waiting for broker to execute
    - Queued: In processing queue
    - Executed: Broker completed the trade
    - Confirmed: Trade settled and verified
    - Failed: Order could not be completed (insufficient funds, etc.)
    - Partial: Some stocks in the basket executed, others failed
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
    SUPPORTED BROKERS:
    - The available brokers depend on the merchant's configuration
    - Common brokers: Robinhood, Fidelity, Public, Charles Schwab
    - Each broker has its own min/max order amounts
    
    BROKER CREDENTIALS:
    - Members enter their broker username and password
    - Credentials are validated via the broker's API
    - StockLoyal does not store passwords — they are sent to the broker
    
    CHANGING BROKERS:
    - Members can change their broker from the Select Broker page
    - Existing investments remain with the previous broker
    - New investments go through the new broker
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
    A: You need to link a broker first. Go to Select Broker to set up your brokerage account.

    Q: Why are my points showing as zero?
    A: Points come from your merchant. Try refreshing your points from the home page. 
       If still zero, contact your merchant's loyalty program.

    Q: Can I withdraw cash instead of investing?
    A: No — StockLoyal converts points to stock investments only. 
       Points cannot be cashed out directly.

    Q: How do I sell my stocks?
    A: StockLoyal is for buying only. To sell, log into your broker's app 
       (Robinhood, Fidelity, etc.) directly.

    Q: Why is my order still "pending"?
    A: Orders are sent to your broker for execution. This can take up to 
       1 business day (T+1). If pending for more than 2 days, contact support.

    Q: Can I cancel a pending order?
    A: Currently, orders cannot be cancelled through StockLoyal once submitted.
       Contact your broker directly for cancellation.

    Q: What is the minimum investment?
    A: It depends on your broker. Typical minimums are $1-$5. The app will 
       show you your broker's limits on the Points Slider page.

    Q: Are there fees?
    A: StockLoyal may charge merchant fees. Broker trading fees depend on 
       your brokerage account. Many modern brokers offer commission-free trading.

    Q: Is my data secure?
    A: Yes. Broker credentials are validated and not stored. The app uses 
       HTTPS encryption. Financial data is handled through your broker's systems.

    Q: What happens to my investments if I leave the merchant's loyalty program?
    A: Your investments remain in your brokerage account. You own the stocks 
       regardless of your loyalty program status.
  `,

  // ── App Navigation Map ───────────────────────────────────────────────────
  navigation: `
    MAIN PAGES:
    - Home / Landing: /stockloyal-landing — Setup progress + quick links
    - Login: /login — Sign in or create account
    - Member Profile: /member-onboard — Personal info form
    - Select Broker: /select-broker — Choose and link brokerage
    - Investment Election: /election — Choose immediate or monthly
    - Terms: /terms — Terms & conditions
    - Wallet: /wallet — Main dashboard with balances
    - Points Slider: /points-slider — Select investment amount
    - Stock Picker: /fill-basket — Browse and select stocks
    - Order: /order — Review and place order
    - Order Confirmation: /order-confirmation — Success page
    - Portfolio: /portfolio — View owned stocks
    - Trade Orders: /transactions — Order history with filters
    - Transaction Ledger: /ledger — Complete financial record
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
  `,
};

export default STOCKLOYAL_KNOWLEDGE;
