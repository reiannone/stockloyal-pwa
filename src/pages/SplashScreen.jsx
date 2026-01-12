// src/pages/SplashScreen.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function SplashScreen() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    console.log("[Splash] location.href:", window.location.href);
    console.log("[Splash] location.search:", window.location.search);
    console.log("[Splash] location.hash:", window.location.hash);

    // ✅ Parse from search params first
    let params = new URLSearchParams(window.location.search);
    
    // ✅ If no search params, parse from hash (for hash routing)
    if (!params.toString() && window.location.hash) {
      const hashQuery = window.location.hash.replace(/^#\/?/, "");
      params = new URLSearchParams(hashQuery);
      console.log("[Splash] Using hash params:", hashQuery);
    }

    // Extract all parameters
    let memberEmail = params.get("member_email");
    let memberId = params.get("member_id");
    let merchantId = params.get("merchant_id");
    let merchantName = params.get("merchant_name"); // ✅ Optional
    let points = parseInt(params.get("points") || "0", 10);
    let action = params.get("action");

    // Prefer member_email if present, fall back to member_id
    if (memberEmail && !memberId) {
      memberId = memberEmail;
    }

    // Load conversion rate from localStorage, fallback to 0.01
    let conversionRate = parseFloat(localStorage.getItem("conversion_rate") || "0");
    if (!conversionRate || conversionRate <= 0) {
      conversionRate = 0.01;
    }

    console.log("[Splash] parsed params:", {
      memberId,
      memberEmail,
      merchantId,
      merchantName,
      points,
      action,
      conversionRate,
    });

    // Persist some values for downstream pages
    if (memberId) {
      // ✅ Clear old session data when new member_id is provided
      localStorage.removeItem("userName");
      localStorage.removeItem("userAvatar");
      localStorage.removeItem("broker");
      localStorage.removeItem("brokerName");
      localStorage.removeItem("cashBalance");
      localStorage.removeItem("portfolio_value");
      localStorage.removeItem("basketId");
      
      localStorage.setItem("memberId", memberId);
      console.log("[Splash] Stored memberId:", memberId);
      
      // Only clear memberEmail if it doesn't match the new memberId
      const oldEmail = localStorage.getItem("memberEmail");
      if (oldEmail && oldEmail !== memberId && !memberEmail) {
        console.log("[Splash] Clearing old memberEmail:", oldEmail);
        localStorage.removeItem("memberEmail");
      }
    }
    if (memberEmail) {
      localStorage.setItem("memberEmail", memberEmail);
      console.log("[Splash] Stored memberEmail:", memberEmail);
    }
    if (merchantId) {
      localStorage.setItem("merchantId", merchantId);
      console.log("[Splash] Stored merchantId:", merchantId);
    }
    if (merchantName) {
      // ✅ Store merchantName from URL if provided (will be overwritten by API if available)
      localStorage.setItem("merchantName", merchantName);
      console.log("[Splash] Stored merchantName from URL:", merchantName);
    }
    if (points > 0) {
      localStorage.setItem("points", String(points));
      console.log("[Splash] Stored points:", points);
    }
    if (conversionRate) {
      localStorage.setItem("conversion_rate", String(conversionRate));
    }
    if (action) {
      localStorage.setItem("action", action);
    }

    // Small animated splash timing
    const fadeIn = setTimeout(() => setVisible(true), 400);
    const fadeOut = setTimeout(() => setVisible(false), 2600);

    // Main async flow: fetch merchant, then route (NO wallet updates here)
    const routerTimeout = setTimeout(async () => {
      try {
        let merchantData = null;
        let isActive = false;
        let promoActive = false;

        if (merchantId) {
          console.log("[Splash] Fetching merchant for merchantId:", merchantId);

          const data = await apiPost("get_merchant.php", { merchant_id: merchantId });
          console.log("[Splash] get_merchant response:", data);

          if (data && data.success && data.merchant) {
            merchantData = data.merchant;

            // Defensive parsing: support "1", 1, true, "true"
            const parseBool = (v) => {
              if (v === true || v === 1 || v === "1") return true;
              if (typeof v === "string") {
                const s = v.toLowerCase();
                return s === "true" || s === "1";
              }
              return false;
            };

            isActive = parseBool(merchantData.active_status);
            promoActive = parseBool(merchantData.promotion_active);

            // Save merchant to localStorage for downstream pages
            try {
              localStorage.setItem("merchant", JSON.stringify(merchantData));
              
              // ✅ Also save merchantName separately for easy access
              if (merchantData.merchant_name) {
                localStorage.setItem("merchantName", merchantData.merchant_name);
                console.log("[Splash] Stored merchantName:", merchantData.merchant_name);
              }
            } catch (e) {
              console.warn(
                "[Splash] failed to store merchant in localStorage",
                e
              );
            }

            // Use merchant-specific conversion_rate if provided
            let merchantRate = parseFloat(merchantData.conversion_rate || "0");
            if (!merchantRate || merchantRate <= 0) merchantRate = 0.01;
            localStorage.setItem("conversion_rate", merchantRate.toString());
            console.log("[Splash] merchant conversion_rate set:", merchantRate);
          } else {
            console.warn(
              "[Splash] merchant lookup returned no merchant or success=false",
              data
            );
          }
        } else {
          console.log("[Splash] no merchantId provided; skipping merchant fetch.");
        }

        // ✅ NEW: If points are provided in URL and user exists, update their wallet
        if (memberId && points > 0) {
          console.log("[Splash] Points detected in URL, checking if user exists...");
          
          try {
            // Check if wallet exists
            const walletCheck = await apiPost("get-wallet.php", { member_id: memberId });
            
            if (walletCheck?.success && walletCheck?.wallet) {
              console.log("[Splash] User exists, updating points and balance...");
              
              // Get conversion rate
              const conv = parseFloat(localStorage.getItem("conversion_rate") || "0.01");
              const cashBalance = Number((points * conv).toFixed(2));
              
              // Update wallet
              await apiPost("update_points.php", {
                member_id: memberId,
                points: points,
                cash_balance: cashBalance,
              });
              
              // Log to ledger
              const clientTxId = `merchant_update_${memberId}_${Date.now()}`;
              const memberTimezone = localStorage.getItem("memberTimezone") || 
                                    Intl.DateTimeFormat().resolvedOptions().timeZone || 
                                    "America/New_York";
              
              await apiPost("log-ledger.php", {
                member_id: memberId,
                merchant_id: merchantId,
                points: points,
                // ✅ DON'T send amount_cash - constraint requires only ONE amount field
                action: "earn",
                client_tx_id: clientTxId,
                member_timezone: memberTimezone,
                note: "Points update from merchant referral link"
              });
              
              console.log("[Splash] Points updated - points:", points, "cashBalance:", cashBalance);
              console.log("[Splash] Transaction logged:", clientTxId);
              
              // Update localStorage
              localStorage.setItem("points", String(points));
              localStorage.setItem("cashBalance", cashBalance.toFixed(2));
            } else {
              console.log("[Splash] User doesn't exist yet, will create on registration");
            }
          } catch (err) {
            console.log("[Splash] User doesn't exist or update failed:", err);
            // Not an error - just means new user
          }
        }

        // Final routing decision
        if (merchantId && isActive && promoActive) {
          console.log("[Splash] routing to /promotions");
          navigate("/promotions", {
            state: {
              memberId,
              memberEmail,
              merchantId,
              points,
              merchant: merchantData,
            },
          });
        } else {
          console.log("[Splash] routing to /login");
          localStorage.setItem("mode", "login");
          navigate("/login");
        }
      } catch (err) {
        console.error("[Splash] routing flow error:", err);
        localStorage.setItem("mode", "login");
        navigate("/login");
      }
    }, 3000);

    return () => {
      clearTimeout(fadeIn);
      clearTimeout(fadeOut);
      clearTimeout(routerTimeout);
    };
  }, [navigate]);

  return (
    <div
      className="splash-screen"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100%",
        backgroundColor: "#fff",
        opacity: visible ? 1 : 0,
        transition: "opacity 800ms ease-in-out",
        overflow: "hidden",
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}logos/stockloyal.png`}
        alt="StockLoyal Logo"
        className="splash-logo"
        style={{ maxWidth: "60%", height: "auto" }}
      />
    </div>
  );
}

export default SplashScreen;
