// src/pages/Basket.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBasket } from "../context/BasketContext";

export default function Basket() {
  const navigate = useNavigate();
  const location = useLocation();
  const { basket, removeFromBasket } = useBasket();

  // ✅ Values passed from earlier steps
  const investedAmount = location.state?.amount || 0;
  const pointsUsed = location.state?.pointsUsed || 0;
  const memberId = location.state?.memberId || localStorage.getItem("memberId");

  // ✅ Prevent divide-by-zero
  const enrichedBasket =
    basket.length > 0
      ? basket.map((stock) => {
          const allocation = investedAmount / basket.length;
          const shares =
            stock.price && stock.price > 0 ? allocation / stock.price : 0;

          return {
            ...stock,
            allocatedAmount: allocation,
            shares: parseFloat(shares.toFixed(4)), // fractional shares
          };
        })
      : [];

  const handleProceed = () => {
    // 🔥 Save to localStorage so SharePointsSheet can access them
    localStorage.setItem("lastPointsUsed", pointsUsed.toString());
    localStorage.setItem("lastInvestedAmount", investedAmount.toString());
    
    navigate("/order", {
      state: {
        basket: enrichedBasket,
        amount: investedAmount,
        pointsUsed,
        memberId,
      },
    });
  };

  if (basket.length === 0) {
    return (
      <div className="basket-container">
        <h2 className="page-title">Your Basket</h2>
        <p className="basket-empty">Your basket is empty.</p>
        <button
          type="button"
          onClick={() => navigate("/stock-picker")}
          className="btn-primary"
        >
          Browse Categories
        </button>
      </div>
    );
  }

  return (
    <div className="basket-container">
      <h2 className="page-title">Your Basket</h2>
      <p className="page-deck">
        You're investing <strong>${investedAmount.toFixed(2)}</strong> across{" "}
        {basket.length} stocks, using <strong>{pointsUsed}</strong> points.
      </p>

      <div className="basket-table-wrapper">
        <table className="basket-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>
                Allocation
                <div style={{ fontSize: "0.75rem", fontWeight: "normal", color: "#6b7280" }}>
                  Shares
                </div>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {enrichedBasket.map((stock) => (
              <tr key={stock.symbol} className="stock-row">
                <td className="symbol">{stock.symbol}</td>
                <td className="text-left">{stock.name || "-"}</td>
                <td className="shares">{stock.shares}</td>
                <td className="text-center">
                  <button
                    type="button"
                    onClick={() => removeFromBasket(stock.symbol)}
                    className="remove-icon-btn"
                    title="Remove"
                  >
                    ➖
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="basket-actions">
        <button type="button" onClick={handleProceed} className="btn-primary">
          Proceed to Order
        </button>

        <button
          type="button"
          onClick={() => navigate("/stock-picker")}
          className="btn-secondary"
        >
          Add More Stocks
        </button>
      </div>
    </div>
  );
}
