// src/pages/SplashScreen.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function SplashScreen() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    console.log("[Splash] location.href:", window.location.href);

    // ── Parse URL parameters ──────────────────────────
    let params = new URLSearchParams(window.location.search);

    // Fallback: parse from hash (for hash routing)
    if (!params.toString() && window.location.hash) {
      const hashQuery = window.location.hash.replace(/^#\/?/, "");
      params = new URLSearchParams(hashQuery);
      console.log("[Splash] Using hash params:", hashQuery);
    }

    let memberId   = params.get("member_id");
    let merchantId = params.get("merchant_id");

    // Legacy support: member_email as fallback for member_id
    const memberEmail = params.get("member_email");
    if (memberEmail && !memberId) {
      memberId = memberEmail;
    }

    console.log("[Splash] parsed params:", { memberId, merchantId });

    // ── Store inbound identification to localStorage ──
    // Clear stale session data when a new member_id arrives
    if (memberId) {
      localStorage.removeItem("userName");
      localStorage.removeItem("userAvatar");
      localStorage.removeItem("broker");
      localStorage.removeItem("brokerName");
      localStorage.removeItem("cashBalance");
      localStorage.removeItem("portfolio_value");
      localStorage.removeItem("basketId");
      localStorage.removeItem("sweep_day");
      localStorage.removeItem("merchantLogo");

      localStorage.setItem("memberId", memberId);
    }
    if (memberEmail) localStorage.setItem("memberEmail", memberEmail);
    if (merchantId) localStorage.setItem("merchantId", merchantId);

    // ── Splash animation timing ───────────────────────
    const fadeIn  = setTimeout(() => setVisible(true), 400);
    const fadeOut = setTimeout(() => setVisible(false), 2600);

    // ── Main async flow: fetch merchant, then route ───
    const routerTimeout = setTimeout(async () => {
      try {
        let merchantData = null;
        let isActive = false;
        let promoActive = false;

        // Fetch merchant details (conversion rate, promo status, logo, tiers)
        if (merchantId) {
          console.log("[Splash] Fetching merchant for:", merchantId);
          const data = await apiPost("get_merchant.php", { merchant_id: merchantId });

          if (data?.success && data?.merchant) {
            merchantData = data.merchant;

            const parseBool = (v) => {
              if (v === true || v === 1 || v === "1") return true;
              if (typeof v === "string") {
                const s = v.toLowerCase();
                return s === "true" || s === "1";
              }
              return false;
            };

            isActive   = parseBool(merchantData.active_status);
            promoActive = parseBool(merchantData.promotion_active);

            // Persist merchant data for downstream pages
            try {
              localStorage.setItem("merchant", JSON.stringify(merchantData));

              if (merchantData.merchant_name) {
                localStorage.setItem("merchantName", merchantData.merchant_name);
              }
              if (merchantData.logo_url) {
                localStorage.setItem("merchantLogo", merchantData.logo_url);
              } else {
                localStorage.removeItem("merchantLogo");
              }
              if (merchantData.sweep_day !== undefined && merchantData.sweep_day !== null) {
                localStorage.setItem("sweep_day", String(merchantData.sweep_day));
              } else {
                localStorage.removeItem("sweep_day");
              }
            } catch (e) {
              console.warn("[Splash] failed to store merchant in localStorage", e);
            }

            // Store conversion rate (used by Wallet display)
            let merchantRate = parseFloat(merchantData.conversion_rate || "0");
            if (!merchantRate || merchantRate <= 0) merchantRate = 0.01;
            localStorage.setItem("conversion_rate", merchantRate.toString());
            console.log("[Splash] conversion_rate:", merchantRate);
          } else {
            console.warn("[Splash] merchant lookup failed", data);
          }
        } else {
          console.log("[Splash] no merchantId; skipping merchant fetch.");
        }

        // ── Route decision ────────────────────────────
        // Wallet is already updated server-side by demo-inbound.php.
        // For new members, pending_inbound is queued and will be
        // applied after account creation via apply-pending-inbound.php.
        if (merchantId && isActive && promoActive) {
          console.log("[Splash] routing to /promotions");
          navigate("/promotions", {
            state: {
              memberId,
              merchantId,
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
