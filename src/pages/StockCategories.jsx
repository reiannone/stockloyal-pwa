// src/pages/StockCategories.jsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../config/api"; // ✅ centralized API base

const categoryMap = {
  "Most Active": "most_actives",
  "Trending": "trending_tickers",
  "Day Gainers": "day_gainers",
  "Day Losers": "day_losers",
  "Large Caps": "undervalued_large_caps",
  "Small Caps": "aggressive_small_caps",
  "Growth Tech": "growth_technology_stocks",
  "Mutual Funds": "top_mutual_funds",
  "ETFs": "etf",
  // ✅ Expanded Crypto categories
  "Crypto - Most Active": "most_actives_cryptocurrencies",
};

export default function StockCategories() {
  const navigate = useNavigate();
  const location = useLocation();

  const { amount = 0, pointsUsed = 0, memberId } = location.state || {};

  const handleCategoryClick = async (category, scrId) => {
    try {
      const resp = await fetch(`${API_BASE}/proxy.php?scrId=${scrId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      const results =
        data.finance?.result?.[0]?.quotes?.map((q) => ({
          symbol: q.symbol,
          name: q.shortName,
          price: q.regularMarketPrice,
          change: q.regularMarketChangePercent,
        })) || [];

      navigate("/stock-list", {
        state: { category, results, amount, pointsUsed, memberId },
      });
    } catch (err) {
      console.error("Proxy/Yahoo API error:", err);
      navigate("/stock-list", {
        state: {
          category,
          results: [],
          error: "Failed to fetch stocks",
          amount,
          pointsUsed,
          memberId,
        },
      });
    }
  };

  return (
    <div className="categories-page">
      <h2 className="categories-title">Select a Category</h2>

      <div className="categories-grid">
        {Object.entries(categoryMap).map(([cat, scrId]) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleCategoryClick(cat, scrId)}
            className="category-btn"
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="categories-footer">
        <button
          type="button"
          onClick={() => navigate("/wallet")}
          className="btn-secondary"
        >
          Back to Wallet
        </button>
      </div>
    </div>
  );
}
