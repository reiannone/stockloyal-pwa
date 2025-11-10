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
    let memberId = params.get("member_id");
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
      merchantId,
      points,
      action,
      conversionRate,
    });

    // try to recover from hash if missing
    if ((!memberId || !merchantId) && window.location.hash) {
      const hashQuery = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
      merchantId = merchantId || hashQuery.get("merchant_id");
      memberId = memberId || hashQuery.get("member_id");
      if (hashQuery.get("points")) {
        points = parseInt(hashQuery.get("points"), 10);
      }
    }

    // persist some values for downstream pages
    if (memberId) localStorage.setItem("memberId", memberId);
    if (merchantId) localStorage.setItem("merchantId", merchantId);
    if (points > 0) localStorage.setItem("points", String(points));
    if (conversionRate) localStorage.setItem("conversion_rate", String(conversionRate));
    if (action) localStorage.setItem("action", action);

    // small animated splash timing
    const fadeIn = setTimeout(() => setVisible(true), 400);
    const fadeOut = setTimeout(() => setVisible(false), 2600);

    // main async flow: fetch merchant, update wallet if deep link, then route
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
              console.warn("[Splash] failed to store merchant in localStorage", e);
            }

            // Use merchant-specific conversion_rate if provided
            let merchantRate = parseFloat(merchantData.conversion_rate || "0");
            if (!merchantRate || merchantRate <= 0) merchantRate = 0.01;
            localStorage.setItem("conversion_rate", merchantRate.toString());
            console.log("[Splash] merchant conversion_rate set:", merchantRate);
          } else {
            console.warn("[Splash] merchant lookup returned no merchant or success=false", data);
          }
        } else {
          console.log("[Splash] no merchantId provided; skipping merchant fetch.");
        }

        // If deep-link provided member and points, update wallet BEFORE routing
        if (memberId && merchantId && points > 0) {
          console.log("[Splash] Deep-link present — updating wallet before routing");

          // compute cashBalance
          const conv = parseFloat(localStorage.getItem("conversion_rate") || "0.01");
          const cashBalance = Number((points * (conv > 0 ? conv : 0.01)).toFixed(2));

          const updateEndpoints = ["update_points.php", "update_points.php"];
          let updated = null;

          for (const ep of updateEndpoints) {
            try {
              console.log(`[Splash] calling ${ep} to add points`, {
                memberId,
                points,
                cash_balance: cashBalance,
              });

              const json = await apiPost(ep, {
                member_id: memberId,
                points,
                cash_balance: cashBalance,
              });

              console.log(`[Splash] ${ep} response:`, json);
              if (json && json.success) {
                updated = json;
                break;
              } else {
                console.warn(`[Splash] ${ep} returned success=false or invalid body`, json);
              }
            } catch (e) {
              console.warn(`[Splash] ${ep} network/error:`, e);
            }
          }

          if (updated) {
            console.log("[Splash] Wallet updated successfully from deep-link:", updated);
            if (updated.wallet) {
              try {
                localStorage.setItem("points", String(updated.wallet.points ?? points));
                localStorage.setItem(
                  "cashBalance",
                  Number(updated.wallet.cash_balance ?? cashBalance).toFixed(2)
                );
                if (typeof updated.wallet.portfolio_value !== "undefined") {
                  localStorage.setItem(
                    "portfolio_value",
                    Number(updated.wallet.portfolio_value).toFixed(2)
                  );
                }
              } catch (e) {
                console.warn("[Splash] failed to sync wallet values to localStorage", e);
              }
            }
          } else {
            console.warn("[Splash] Wallet update failed on all endpoints; continuing to route.");
          }
        } else {
          console.log("[Splash] not updating wallet (missing memberId/merchantId/points)");
        }

        // final routing decision
        if (merchantId && isActive && promoActive) {
          console.log("[Splash] routing to /promotions");
          navigate("/promotions", {
            state: { memberId, merchantId, points, merchant: merchantData },
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
