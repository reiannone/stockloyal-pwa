// src/pages/Basket.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBasket } from "../context/BasketContext";

export default function Basket() {
  const navigate = useNavigate();
  const location = useLocation();
  const { basket, removeFromBasket } = useBasket();

  // ✅ Prefer route state (when coming from StockPicker),
  // otherwise fall back to persisted values (when coming from Footer/Menu)
  const investedAmount = useMemo(() => {
    const fromState = location.state?.amount;
    if (fromState != null && fromState !== "") return Number(fromState) || 0;

    const fromStorage =
      localStorage.getItem("basket_amount") ??
      localStorage.getItem("lastInvestedAmount");

    return Number(fromStorage) || 0;
  }, [location.state]);

  const pointsUsed = useMemo(() => {
    const fromState = location.state?.pointsUsed;
    if (fromState != null && fromState !== "") return parseInt(fromState, 10) || 0;

    const fromStorage =
      localStorage.getItem("basket_pointsUsed") ??
      localStorage.getItem("lastPointsUsed");

    return parseInt(fromStorage || "0", 10) || 0;
  }, [location.state]);

  const memberId =
    location.state?.memberId || localStorage.getItem("memberId");

  // ✅ Persist the values whenever Basket is opened with valid state
  useEffect(() => {
    if (location.state?.amount != null) {
      localStorage.setItem("basket_amount", String(location.state.amount));
      localStorage.setItem("lastInvestedAmount", String(location.state.amount));
    }
    if (location.state?.pointsUsed != null) {
      localStorage.setItem("basket_pointsUsed", String(location.state.pointsUsed));
      localStorage.setItem("lastPointsUsed", String(location.state.pointsUsed));
    }
  }, [location.state]);

  // ✅ Get broker name from localStorage
  const brokerName =
    localStorage.getItem("broker") ||
    localStorage.getItem("selectedBroker") ||
    localStorage.getItem("brokerName") ||
    "your broker";

  // ✅ Get merchant name from localStorage
  const merchantName = localStorage.getItem("merchantName") || "Merchant";

  // ✅ Get sweep day from localStorage (merchant data)
  const sweepDay = localStorage.getItem("sweep_day");

  // ✅ Format sweep day for display (handles VARCHAR values)
  // Returns null for "T+1" (handled separately) or invalid values
  const formatSweepDay = (day) => {
    if (!day || day === "null") return null;
    // "T+1" is handled separately in the JSX, return null here
    if (day === "T+1") return null;
    const numDay = parseInt(day, 10);
    if (isNaN(numDay)) return null;
    if (numDay === -1) return "the last business day";
    if (numDay === 1) return "the 1st";
    if (numDay === 2) return "the 2nd";
    if (numDay === 3) return "the 3rd";
    if (numDay === 21) return "the 21st";
    if (numDay === 22) return "the 22nd";
    if (numDay === 23) return "the 23rd";
    if (numDay === 31) return "the 31st";
    return `the ${numDay}th`;
  };

  // ✅ Safety: basket is expected to be an array here
  const basketArray = Array.isArray(basket) ? basket : [];
  const basketCount = basketArray.length;

  // ✅ Prevent divide-by-zero
  const enrichedBasket =
    basketCount > 0
      ? basketArray.map((stock) => {
          const allocation = investedAmount / basketCount;
          const price = Number(stock.price || 0);
          const shares = price > 0 ? allocation / price : 0;

          return {
            ...stock,
            allocatedAmount: allocation,
            shares: parseFloat(shares.toFixed(4)),
          };
        })
      : [];

  const handleProceed = () => {
    // 🔥 Ensure persisted values are always available for other pages
    localStorage.setItem("lastPointsUsed", String(pointsUsed));
    localStorage.setItem("lastInvestedAmount", String(investedAmount));

    // also keep the basket_* keys current
    localStorage.setItem("basket_pointsUsed", String(pointsUsed));
    localStorage.setItem("basket_amount", String(investedAmount));

    navigate("/order", {
      state: {
        basket: enrichedBasket,
        amount: investedAmount,
        pointsUsed,
        memberId,
      },
    });
  };

  if (basketCount === 0) {
    return (
      <div className="basket-container">
        <h2 className="page-title">Your Basket for Buy Order</h2>
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
      <h2 className="page-title">Your Basket for Buy Order</h2>

      <p className="page-deck">
        You're investing <strong>${Number(investedAmount).toFixed(2)}</strong> across{" "}
        {basketCount} stock{basketCount !== 1 ? "s" : ""}, using{" "}
        <strong>{Number(pointsUsed).toLocaleString()}</strong> points.
      </p>

      {/* Sweep Schedule Notice */}
      {(sweepDay === "T+1" || formatSweepDay(sweepDay)) && (
        <div style={{
          background: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          textAlign: "center",
          fontSize: "0.875rem",
          color: "#92400e"
        }}>
          {sweepDay === "T+1" ? (
            <>📅 <strong>{merchantName}</strong> processes points conversion and trade orders same day with settlement next business day.</>
          ) : (
            <>📅 <strong>{merchantName}</strong> processes points conversion and trade orders on <strong>{formatSweepDay(sweepDay)}</strong> of each month.</>
          )}
        </div>
      )}

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
          Proceed to Buy Order with {brokerName}
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
