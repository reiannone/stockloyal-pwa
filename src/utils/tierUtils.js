// src/utils/tierUtils.js
// Utility functions for tier-based conversion rate lookup

import { apiPost } from "../api.js";

/**
 * Get and apply tier-specific conversion rate from merchant data
 * @param {string} merchantId - The merchant ID
 * @param {string} memberTier - The member's tier name
 * @returns {Promise<number>} - The tier-specific conversion rate
 */
export async function getTierConversionRate(merchantId, memberTier) {
  try {
    if (!merchantId) {
      console.warn("[tierUtils] No merchantId provided, using default rate");
      return 0.01;
    }

    const res = await apiPost("get-member-tier-rate.php", {
      merchant_id: merchantId,
      member_tier: memberTier || ""
    });

    if (res?.success && res?.conversion_rate) {
      const rate = parseFloat(res.conversion_rate);
      console.log("[tierUtils] Applied tier rate:", rate, "for tier:", memberTier || "default");
      return rate;
    }

    console.warn("[tierUtils] Failed to get tier rate, using default");
    return 0.01;
  } catch (err) {
    console.error("[tierUtils] Error fetching tier rate:", err);
    return 0.01;
  }
}

/**
 * Apply tier-specific conversion rate to localStorage and return cash balance
 * @param {string} merchantId - The merchant ID
 * @param {string} memberTier - The member's tier name
 * @param {number} points - The member's points balance
 * @returns {Promise<{rate: number, cashBalance: number}>}
 */
export async function applyTierRate(merchantId, memberTier, points) {
  const rate = await getTierConversionRate(merchantId, memberTier);
  
  // Save to localStorage
  localStorage.setItem("conversion_rate", rate.toString());
  
  // Calculate cash balance
  const cashBalance = Number((points * rate).toFixed(2));
  localStorage.setItem("cashBalance", cashBalance.toFixed(2));
  
  console.log("[tierUtils] Applied tier rate:", {
    merchantId,
    memberTier,
    rate,
    points,
    cashBalance
  });
  
  return { rate, cashBalance };
}

/**
 * Parse tier field names from merchant data (handles both formats)
 * @param {object} merchantData - Merchant data object
 * @param {number} tierNumber - Tier number (1-6)
 * @returns {object} - { name, minPoints, rate }
 */
export function parseTierField(merchantData, tierNumber) {
  // Try underscore format first (tier_1_name)
  let name = merchantData[`tier_${tierNumber}_name`];
  let minPoints = merchantData[`tier_${tierNumber}_min_points`];
  let rate = merchantData[`tier_${tierNumber}_conversion_rate`];
  
  // Fall back to no-underscore format (tier1_name)
  if (!name) {
    name = merchantData[`tier${tierNumber}_name`];
    minPoints = merchantData[`tier${tierNumber}_min_points`];
    rate = merchantData[`tier${tierNumber}_conversion_rate`];
  }
  
  if (!name) return null;
  
  return {
    name: name,
    minPoints: parseFloat(minPoints || 0),
    rate: parseFloat(rate || 0.01)
  };
}
