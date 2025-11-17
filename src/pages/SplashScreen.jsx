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

    const params = new URLSearchParams(window.location.search);

    // Prefer member_email if present, fall back to member_id
    let memberEmail = params.get("member_email");
    let memberId = params.get("member_id");

    if (memberEmail && !memberId) {
      memberId = memberEmail;
    }

    let merchantId = params.get("merchant_id");
    let points = parseInt(params.get("points") || "0", 10);
    let action = params.get("action");

    // Load conversion rate from localStorage, fallback to 0.01
    let conversionRate = parseFloat(localStorage.getItem("conversion_rate") || "0");
    if (!conversionRate || conversionRate <= 0) {
      conversionRate = 0.01;
    }

    console.log("[Splash] parsed params:", {
      memberId,
      memberEmail,
      merchantId,
      points,
      action,
      conversionRate,
    });

    // Try to recover from hash if missing
    if ((!memberId || !merchantId) && window.location.hash) {
      const hashQuery = new URLSearchParams(
        window.location.hash.replace(/^#\/?/, "")
      );

      const hashMerchantId = hashQuery.get("merchant_id");
      const hashMemberEmail = hashQuery.get("member_email");
      const hashMemberId = hashQuery.get("member_id");

      merchantId = merchantId || hashMerchantId;

      if (!memberId) {
        if (hashMemberEmail) {
          memberEmail = hashMemberEmail;
          memberId = hashMemberEmail;
        } else if (hashMemberId) {
          memberId = hashMemberId;
        }
      }

      if (hashQuery.get("points")) {
        points = parseInt(hashQuery.get("points"), 10);
      }
    }

    // Persist some values for downstream pages
    if (memberId) {
      localStorage.setItem("memberId", memberId);
    }
    if (memberEmail) {
      localStorage.setItem("memberEmail", memberEmail);
    }
    if (merchantId) {
      localStorage.setItem("merchantId", merchantId);
    }
    if (points > 0) {
      localStorage.setItem("points", String(points));
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

        // 🚫 IMPORTANT: no wallet updates here.
        // We only update wallet after successful login / account creation.

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
