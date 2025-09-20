// src/pages/Order.jsx
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBasket } from "../context/BasketContext";
import { useBroker } from "../context/BrokerContext";
import { apiPost } from "../api";

export default function Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearBasket } = useBasket();
  const { broker } = useBroker();
  const memberId = localStorage.getItem("memberId");

  // ✅ Basket data passed from Basket.jsx
  const enrichedBasket = location.state?.basket || [];
  const totalAmount = Number(location.state?.amount || 0);
  const pointsUsed = Number(location.state?.pointsUsed || 0);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  const handlePlaceOrder = async () => {
    setError("");

    if (!memberId) {
      alert("No member ID found. Please log in again.");
      return;
    }

    if (!Array.isArray(enrichedBasket) || enrichedBasket.length === 0) {
      alert("Your basket is empty.");
      return;
    }

    setPlacing(true);

    try {
      console.log("[Order] starting place order flow", {
        memberId,
        totalAmount,
        pointsUsed,
        enrichedBasketCount: enrichedBasket.length,
      });

      // Attempt to fetch authoritative wallet from server
      let currentWallet = null;
      try {
        const walletRes = await apiPost("get-wallet.php", { member_id: memberId });
        if (walletRes?.success && walletRes.wallet) {
          currentWallet = walletRes.wallet;
          console.log("[Order] fetched wallet from server:", currentWallet);
        } else {
          console.warn("[Order] get-wallet.php returned no wallet or success=false", walletRes);
        }
      } catch (gErr) {
        console.warn("[Order] get-wallet.php failed, falling back to localStorage", gErr);
      }

      // Fallback to localStorage if server wallet not available
      const currPoints = Number.isFinite(Number(currentWallet?.points))
        ? Number(currentWallet.points)
        : parseInt(localStorage.getItem("points") || "0", 10);

      const currCash = Number.isFinite(Number(currentWallet?.cash_balance))
        ? Number(currentWallet.cash_balance)
        : parseFloat(localStorage.getItem("cashBalance") || "0");

      const currPortfolio = Number.isFinite(Number(currentWallet?.portfolio_value))
        ? Number(currentWallet.portfolio_value)
        : parseFloat(localStorage.getItem("portfolio_value") || "0");

      const newPoints = Math.max(0, Math.round(currPoints - pointsUsed));
      const newCash = Math.max(0, Number((currCash - totalAmount).toFixed(2)));
      const newPortfolio = Number((currPortfolio + totalAmount).toFixed(2));

      console.log("[Order] computed wallet updates (pending):", {
        currPoints,
        currCash,
        currPortfolio,
        newPoints,
        newCash,
        newPortfolio,
      });

      // 1) Place broker orders sequentially
      for (const stock of enrichedBasket) {
        const payload = {
          member_id: memberId,
          symbol: stock.symbol,
          shares: stock.shares || 0,
          amount: stock.allocatedAmount || 0,
          order_type: "market",
          broker: broker?.id || broker || "Not linked",
        };

        console.log("[Order] place_order.php payload:", payload);
        const result = await apiPost("place_order.php", payload);

        if (!result || !result.success) {
          console.error("[Order] place_order.php failure for", stock.symbol, result);
          throw new Error(result?.error || `Failed to place order for ${stock.symbol}`);
        }
      }

      // 2) All orders succeeded — persist wallet updates via update_balances.php
      try {
        const updatePayload = {
          member_id: memberId,
          points: newPoints,
          cash_balance: newCash,
          portfolio_value: newPortfolio,
        };

        console.log("[Order] calling update_balances.php", updatePayload);
        const updateRes = await apiPost("update_balances.php", updatePayload);

        if (!updateRes || !updateRes.success) {
          console.warn("[Order] wallet update failed or returned success=false", updateRes);
          // Non-fatal: orders succeeded, wallet update failed. Notify user but proceed.
          alert("Order placed but failed to update wallet: " + (updateRes?.error || "unknown"));
        } else {
          console.log("[Order] wallet updated successfully on server:", updateRes.wallet ?? updateRes);

          // Prefer server-returned wallet if present
          const returnedWallet = updateRes.wallet ?? {
            points: newPoints,
            cash_balance: newCash,
            portfolio_value: newPortfolio,
          };

          try {
            localStorage.setItem("points", String(returnedWallet.points ?? newPoints));
            localStorage.setItem("cashBalance", Number(returnedWallet.cash_balance ?? newCash).toFixed(2));
            localStorage.setItem("portfolio_value", Number(returnedWallet.portfolio_value ?? newPortfolio).toFixed(2));
            console.log("[Order] localStorage synced with new wallet values");
          } catch (lsErr) {
            console.warn("[Order] failed to update localStorage", lsErr);
          }
        }
      } catch (walletErr) {
        console.error("[Order] network error while updating wallet:", walletErr);
        alert("Order placed but failed to update wallet (network error). Check logs.");
      }

      // 3) Clear basket and navigate to confirmation
      clearBasket();
      navigate("/order-confirmation", { state: { refreshWallet: true, placed: true, amount: totalAmount } });
    } catch (err) {
      console.error("❌ Error placing order:", err);
      alert("Error placing order: " + (err.message || String(err)));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="order-container">
      <h2 className="order-heading">Place Market Order with {broker || "Broker"}</h2>
      <p className="order-subtext">
        These orders will be executed as <span className="highlight">Market Orders</span>.
      </p>

      {enrichedBasket.length === 0 ? (
        <p className="basket-empty">Your basket is empty.</p>
      ) : (
        <div className="basket-table-wrapper">
          <p className="basket-intro">Total Investment: ${Number(totalAmount).toFixed(2)}</p>
          <p className="basket-intro">Points Used: {pointsUsed}</p>

          <table className="basket-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Shares</th>
                <th>Order Type</th>
              </tr>
            </thead>
            <tbody>
              {enrichedBasket.map((stock) => (
                <tr key={stock.symbol}>
                  <td className="symbol">{stock.symbol}</td>
                  <td>{stock.name || "-"}</td>
                  <td className="shares">{stock.shares ?? "N/A"}</td>
                  <td className="order-type">Market</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="basket-actions" style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          onClick={handlePlaceOrder}
          className="btn-primary"
          disabled={placing}
        >
          {placing ? "Placing orders…" : `Place Market Order with ${broker || "Broker"}`}
        </button>

        <button type="button" onClick={() => navigate(-1)} className="btn-secondary" disabled={placing}>
          Back to Basket
        </button>
      </div>

      {/* ✅ Disclosure */}
      <p className="form-disclosure">
        This order is submitted to your broker as a <strong>market order</strong> and is
        subject to the broker's ability to execute the order at market price and add
        securities to your portfolio at the brokerage. Orders not filled in the current
        market day will be held over to the next trading day. The actual confirmation for
        this order will be provided by your broker directly to you. We will add these
        settled trades to your StockLoyal portfolio. To execute <strong>sell market orders</strong>,
        please contact your broker directly through their application or service desk.
      </p>

      {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
