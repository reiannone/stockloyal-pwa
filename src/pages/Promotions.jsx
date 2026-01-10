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
  const handleGetStarted = () => {
    const memberId = localStorage.getItem("memberId");
    const memberEmail = localStorage.getItem("memberEmail");
    
    // ✅ If user is already logged in (has memberId), go to wallet
    if (memberId) {
      console.log("[Promotions] User already logged in, navigating to wallet");
      navigate("/wallet");
    } else {
      // Otherwise, go to login
      console.log("[Promotions] User not logged in, navigating to login");
      navigate("/login");
    }
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
