// src/hooks/useTierRate.js
import { useEffect, useState } from "react";
import { applyTierRate } from "../utils/tierUtils.js";

/**
 * React hook to load and apply tier-specific conversion rate
 * @param {string} merchantId - The merchant ID
 * @param {string} memberTier - The member's tier name
 * @param {number} points - The member's points balance
 * @returns {{rate: number, cashBalance: number, loading: boolean}}
 */
export function useTierRate(merchantId, memberTier, points) {
  const [rate, setRate] = useState(() => {
    const stored = localStorage.getItem("conversion_rate");
    return stored ? parseFloat(stored) : 0.01;
  });
  
  const [cashBalance, setCashBalance] = useState(() => {
    const stored = localStorage.getItem("cashBalance");
    return stored ? parseFloat(stored) : 0;
  });
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!merchantId) return;

    (async () => {
      setLoading(true);
      try {
        const result = await applyTierRate(merchantId, memberTier, points);
        setRate(result.rate);
        setCashBalance(result.cashBalance);
      } catch (err) {
        console.error("[useTierRate] Error applying tier rate:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [merchantId, memberTier, points]);

  return { rate, cashBalance, loading };
}

export default useTierRate;
