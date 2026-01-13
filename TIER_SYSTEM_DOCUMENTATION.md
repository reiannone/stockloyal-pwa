# Tier-Based Conversion Rate System

## Overview
Members are assigned to tiers based on their merchant relationship. Each tier has its own conversion rate for converting points to cash.

## Database Schema

### merchant table tier fields:
```
tier1_name            VARCHAR(100)    - Name of tier 1 (e.g., "Bronze")
tier1_min_points      INT            - Minimum points for tier 1 (e.g., 0)
tier1_conversion_rate DECIMAL(10,4)  - Conversion rate (e.g., 0.0050)

tier2_name            VARCHAR(100)    - Name of tier 2 (e.g., "Silver")
tier2_min_points      INT            - Minimum points for tier 2 (e.g., 10000)
tier2_conversion_rate DECIMAL(10,4)  - Conversion rate (e.g., 0.0060)

... (up to tier6)
```

### wallet table:
```
member_tier VARCHAR(50) - Current tier name (e.g., "Gold")
```

## Example Tier Configuration

```sql
-- Sky Blue Airlines tier structure
merchant_id: merchant001

Tier 1: Bronze
  - min_points: 0
  - conversion_rate: 0.0050 (1 point = $0.005)
  
Tier 2: Silver  
  - min_points: 10,000
  - conversion_rate: 0.0060 (1 point = $0.006)
  
Tier 3: Gold
  - min_points: 50,000
  - conversion_rate: 0.0070 (1 point = $0.007)
```

## Conversion Rate Lookup Flow

### Scenario 1: New User from URL with Tier
```
URL: ?member_id=user1&tier=Gold&points=60000
  ↓
SplashScreen:
  1. Extract tier: "Gold"
  2. Fetch merchant data
  3. Find Gold tier: tier3_conversion_rate = 0.0070
  4. Store: localStorage.conversion_rate = "0.0070"
  5. Calculate: cashBalance = 60000 * 0.0070 = $420.00
  ↓
User creates account:
  - wallet.member_tier = "Gold"
  - Uses 0.0070 rate for all conversions
```

### Scenario 2: New User without Tier (Auto-Default)
```
URL: ?member_id=user2&points=5000
  ↓
SplashScreen:
  1. No tier in URL
  2. Fetch merchant tiers
  3. Find lowest tier: Bronze (0 min_points)
  4. Use tier1_conversion_rate = 0.0050
  5. Store: localStorage.conversion_rate = "0.0050"
  6. Calculate: cashBalance = 5000 * 0.0050 = $25.00
  ↓
User creates account:
  - wallet.member_tier = "Bronze"
  - Uses 0.0050 rate
```

### Scenario 3: Existing User Loads Wallet
```
User logs in:
  ↓
get-wallet.php returns:
  - member_tier: "Silver"
  - points: 15000
  - merchant_id: "merchant001"
  ↓
Frontend calls get-member-tier-rate.php:
  - merchant_id: "merchant001"
  - member_tier: "Silver"
  ↓
Response:
  - conversion_rate: 0.0060
  ↓
Calculate:
  - cashBalance = 15000 * 0.0060 = $90.00
  - Store in localStorage
```

## API Endpoints

### 1. get-member-tier-rate.php

**Purpose:** Fetch tier-specific conversion rate

**Request:**
```json
POST /api/get-member-tier-rate.php
{
  "merchant_id": "merchant001",
  "member_tier": "Gold"
}
```

**Response:**
```json
{
  "success": true,
  "merchant_id": "merchant001",
  "merchant_name": "Sky Blue Airlines",
  "member_tier": "Gold",
  "conversion_rate": 0.0070,
  "base_conversion_rate": 0.0060,
  "tier_info": {
    "name": "Gold",
    "min_points": 50000,
    "conversion_rate": 0.0070
  },
  "available_tiers": [
    {"name": "Bronze", "min_points": 0, "conversion_rate": 0.0050},
    {"name": "Silver", "min_points": 10000, "conversion_rate": 0.0060},
    {"name": "Gold", "min_points": 50000, "conversion_rate": 0.0070}
  ]
}
```

## Frontend Utilities

### tierUtils.js

**getTierConversionRate(merchantId, memberTier)**
- Fetches tier-specific rate from API
- Returns: float conversion rate

**applyTierRate(merchantId, memberTier, points)**
- Fetches rate and calculates cash balance
- Updates localStorage
- Returns: {rate, cashBalance}

**parseTierField(merchantData, tierNumber)**
- Parses tier data from merchant object
- Handles both underscore and non-underscore formats
- Returns: {name, minPoints, rate}

### useTierRate.js (React Hook)

**Usage:**
```javascript
import useTierRate from '../hooks/useTierRate';

function MyComponent() {
  const merchantId = localStorage.getItem("merchantId");
  const memberTier = localStorage.getItem("memberTier");
  const points = parseInt(localStorage.getItem("points") || "0");
  
  const { rate, cashBalance, loading } = useTierRate(merchantId, memberTier, points);
  
  return (
    <div>
      <p>Tier: {memberTier}</p>
      <p>Rate: {rate}</p>
      <p>Points: {points.toLocaleString()}</p>
      <p>Cash: ${cashBalance.toFixed(2)}</p>
    </div>
  );
}
```

## localStorage Keys

```javascript
{
  memberTier: "Gold",           // Current tier name
  conversion_rate: "0.0070",    // Tier-specific rate
  points: "60000",              // Points balance
  cashBalance: "420.00",        // Calculated: points * rate
  merchantId: "merchant001",    // For rate lookup
}
```

## Tier Progression Examples

### Member starts in Bronze
```
Points: 5,000
Tier: Bronze (0 min)
Rate: 0.0050
Cash: $25.00
```

### Member earns more points → Silver
```
Points: 15,000
Tier: Silver (10,000 min) ← Upgraded!
Rate: 0.0060 ← Better rate
Cash: $90.00
```

### Member reaches Gold
```
Points: 60,000
Tier: Gold (50,000 min) ← Upgraded!
Rate: 0.0070 ← Best rate
Cash: $420.00
```

## Calculation Examples

### Bronze Tier (0.0050 rate)
```
10,000 points × 0.0050 = $50.00
50,000 points × 0.0050 = $250.00
100,000 points × 0.0050 = $500.00
```

### Silver Tier (0.0060 rate)
```
10,000 points × 0.0060 = $60.00
50,000 points × 0.0060 = $300.00
100,000 points × 0.0060 = $600.00
```

### Gold Tier (0.0070 rate)
```
10,000 points × 0.0070 = $70.00
50,000 points × 0.0070 = $350.00
100,000 points × 0.0070 = $700.00
```

## Testing

### Test 1: Bronze member
```bash
curl -X POST https://api.stockloyal.com/api/get-member-tier-rate.php \
-H "Content-Type: application/json" \
-d '{"merchant_id": "merchant001", "member_tier": "Bronze"}'

# Expected: conversion_rate = 0.0050
```

### Test 2: No tier (default)
```bash
curl -X POST https://api.stockloyal.com/api/get-member-tier-rate.php \
-H "Content-Type: application/json" \
-d '{"merchant_id": "merchant001", "member_tier": ""}'

# Expected: conversion_rate = base merchant rate
```

### Test 3: Invalid tier
```bash
curl -X POST https://api.stockloyal.com/api/get-member-tier-rate.php \
-H "Content-Type: application/json" \
-d '{"merchant_id": "merchant001", "member_tier": "Platinum"}'

# Expected: Falls back to base_conversion_rate
```

## Deployment Checklist

- [ ] Run SQL: `add_member_tier_to_wallet.sql`
- [ ] Deploy: `get-member-tier-rate.php`
- [ ] Deploy: `create_member.php` (updated)
- [ ] Deploy: `get-wallet.php` (updated)
- [ ] Deploy: `update_member_tier.php`
- [ ] Deploy: `SplashScreen.jsx` (updated)
- [ ] Deploy: `tierUtils.js` (new)
- [ ] Deploy: `useTierRate.js` (new)
- [ ] Configure merchant tiers in Admin
- [ ] Test tier rate lookup
- [ ] Verify cash balance calculations
