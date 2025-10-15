// src/pages/Promotions.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function Promotions() {
  const navigate = useNavigate();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("✅ Start Promotions.jsx");
    

    // ✅ Get merchant_id from localStorage
    const merchantId = localStorage.getItem("merchantId");
    const memberId = localStorage.getItem("memberId");
    console.log("[Promotions] merchantId:", merchantId);
    console.log("[Promotions] memberId:", memberId);

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

  const handleGetStarted = () => navigate("/login");
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
