// src/pages/Promotions.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, API_BASE } from "../api.js";

function Promotions() {
  const navigate = useNavigate();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("✅ Start Promotions.jsx");
    console.log("API_BASE:", API_BASE);

    // -------------------------------
    // NEW: Read memberEmail too
    // -------------------------------
    const merchantId = localStorage.getItem("merchantId");
    const memberEmail =
      localStorage.getItem("memberEmail") ||
      localStorage.getItem("memberId"); // fallback compatibility

    console.log("[Promotions] merchantId:", merchantId);
    console.log("[Promotions] memberEmail:", memberEmail);

    // Save fallback → forward compatibility
    if (memberEmail) {
      localStorage.setItem("memberEmail", memberEmail);
    }

    if (!merchantId) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/get_promotions.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_id: merchantId }),
    })
      .then(async (res) => {
        console.log("[Promotions] Fetch status:", res.status);

        if (!res.ok) {
          const text = await res.text();
          console.error("[Promotions] Non-200 response:", text);
          return null;
        }

        try {
          const data = await res.json();
          console.log("[Promotions] Parsed JSON:", data);
          return data;
        } catch (e) {
          const text = await res.text();
          console.error("[Promotions] JSON parse error:", e, "Raw:", text);
          return null;
        }
      })
      .then((data) => {
        if (data && data.success) {
          setPromotions(data.promotions || []);
        } else {
          console.warn("[Promotions] No promotions found or API failed");
        }
      })
      .catch((err) => console.error("❌ Error fetching promotions:", err))
      .finally(() => setLoading(false));
  }, []);

  // ------------------------------------
  // Routes to Wallet if logged in, otherwise Login
  // ------------------------------------
  const handleGetStarted = async () => {
    const memberId = localStorage.getItem("memberId");
    const memberEmail = localStorage.getItem("memberEmail");
    
    // ✅ If user has memberId, verify they actually have a wallet
    if (memberId) {
      console.log("[Promotions] Checking if user has wallet...");
      
      try {
        const walletCheck = await apiPost("get-wallet.php", { member_id: memberId });
        
        if (walletCheck?.success && walletCheck?.wallet) {
          // User has a wallet - they're fully registered
          console.log("[Promotions] User has wallet, navigating to wallet");
          navigate("/wallet");
          return;
        } else {
          // Wallet not found - user needs to complete registration
          // ✅ DON'T clear memberId - Login needs it to pre-fill the username field!
          console.log("[Promotions] No wallet found - user needs to register");
        }
      } catch (err) {
        console.log("[Promotions] Wallet check failed:", err);
        // ✅ DON'T clear memberId on error - Login needs it!
      }
    }
    
    // Go to login to complete registration (with memberId preserved for pre-fill)
    console.log("[Promotions] Navigating to login");
    navigate("/login");
  };

  const handleNoThanks = () => navigate("/goodbye");

  if (loading) return <p>Loading promotions...</p>;

  return (
    <div className="promotions-container">
      <h2 className="promotions-heading">Exclusive Promotions</h2>

      {promotions.length > 0 ? (
        promotions.map((promo, idx) => (
          <div key={idx} className="promotion-block">
            <h3>{promo.merchant_name}</h3>
            <div
              className="promotion-text"
              dangerouslySetInnerHTML={{ __html: promo.promotion_text }}
            />
          </div>
        ))
      ) : (
        <p>No active promotions from your merchant.</p>
      )}

      <div className="promotions-actions">
        <button onClick={handleGetStarted} className="btn-primary">
          Let's Get Started!
        </button>
        <button onClick={handleNoThanks} className="btn-secondary">
          No Thanks.
        </button>
      </div>
    </div>
  );
}

export default Promotions;
