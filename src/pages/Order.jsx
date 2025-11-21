// src/pages/Order.jsx
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBasket } from "../context/BasketContext";
import { apiPost } from "../api.js";

console.log("[Order] start localStorage item broker:", localStorage.getItem("broker"));

// Simple UUID generator for basket_id
function generateBasketId() {
  return "basket-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
}

export default function Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearBasket } = useBasket();
  const broker = localStorage.getItem("broker");
  const memberId = localStorage.getItem("memberId");

  console.log("[Order] localStorage item broker:", localStorage.getItem("broker"));

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

      // ✅ Generate basket_id once per checkout
      const basketId = generateBasketId();
      localStorage.setItem("basketId", basketId);

      // Split amount across all basket items (simple even split)
      const perOrderAmount =
        enrichedBasket.length > 0 ? totalAmount / enrichedBasket.length : 0;

      // ✅ Prepare an *even* points allocation that sums exactly to pointsUsed
      const n = enrichedBasket.length;
      const pointsAlloc = [];
      if (n > 0) {
        if (Number.isInteger(pointsUsed)) {
          // Integer points: distribute remainder by +1 to the first R orders
          const base = Math.floor(pointsUsed / n);
          let remainder = pointsUsed - base * n;
          for (let i = 0; i < n; i++) {
            pointsAlloc.push(base + (i < remainder ? 1 : 0));
          }
        } else {
          // Decimal points: split to 2 decimals and distribute any leftover cents
          const raw = pointsUsed / n;
          const base = Math.floor(raw * 100) / 100; // 2-dp base
          let remCents = Math.round(pointsUsed * 100 - base * 100 * n);
          for (let i = 0; i < n; i++) {
            const add = remCents > 0 ? 0.01 : 0;
            pointsAlloc.push(Number((base + add).toFixed(2)));
            if (remCents > 0) remCents--;
          }
        }
      }
      console.log("[Order] points allocation per order:", pointsAlloc, "total:", pointsAlloc.reduce((a, b) => a + b, 0));

      // Attempt to fetch authoritative wallet from server
      let currentWallet = null;
      try {
        const walletRes = await apiPost("get-wallet.php", { member_id: memberId });
        if (walletRes?.success && walletRes.wallet) {
          currentWallet = walletRes.wallet;
          console.log("[Order] fetched wallet from server:", currentWallet);
        }
      } catch (gErr) {
        console.warn("[Order] get-wallet.php failed, falling back to localStorage", gErr);
      }

      // Fallback values
      const currPoints =
        Number(currentWallet?.points) ||
        parseInt(localStorage.getItem("points") || "0", 10);
      const currCash =
        Number(currentWallet?.cash_balance) ||
        parseFloat(localStorage.getItem("cashBalance") || "0");
      const currPortfolio =
        Number(currentWallet?.portfolio_value) ||
        parseFloat(localStorage.getItem("portfolio_value") || "0");

      const newPoints = Math.max(0, Math.round(currPoints - pointsUsed));
      const newCash = Math.max(0, Number((currCash - totalAmount).toFixed(2)));
      const newPortfolio = Number((currPortfolio + totalAmount).toFixed(2));

      // 1) Place broker orders sequentially with basket_id + per-order amount + per-order points_used
      for (let i = 0; i < enrichedBasket.length; i++) {
        const stock = enrichedBasket[i];

        const payload = {
          member_id: memberId,
          basket_id: basketId, // ✅ tie all orders to this basket
          symbol: stock.symbol,
          shares: stock.shares || 0,
          points_used: pointsAlloc[i] || 0, // ✅ evenly split per order
          amount: perOrderAmount, // ✅ evenly split amount (simple split)
          order_type: "market",
          broker: broker || "Not linked",
        };

        console.log("[Order] place_order.php payload:", payload);
        const result = await apiPost("place_order.php", payload);

        if (!result || !result.success) {
          console.error("[Order] place_order.php failure for", stock.symbol, result);
          throw new Error(result?.error || `Failed to place order for ${stock.symbol}`);
        }
      }

      // 2) Persist wallet updates
      try {
        const updatePayload = {
          member_id: memberId,
          points: newPoints,
          cash_balance: newCash,
          portfolio_value: newPortfolio,
        };

        console.log("[Order] calling update_balances.php", updatePayload);
        await apiPost("update_balances.php", updatePayload);

        localStorage.setItem("points", String(newPoints));
        localStorage.setItem("cashBalance", newCash.toFixed(2));
        localStorage.setItem("portfolio_value", newPortfolio.toFixed(2));
      } catch (walletErr) {
        console.error("[Order] wallet update failed:", walletErr);
      }

      // 3) Schedule broker confirmation stub after 20s
      setTimeout(async () => {
        try {
          console.log("[Order] Triggering broker_confirm.php after 20s...");
          await apiPost("broker_confirm.php", { member_id: memberId });
        } catch (err) {
          console.error("[Order] broker_confirm.php failed:", err);
        }
      }, 1000);

      // 4) Clear basket and navigate with basketId
      clearBasket();
      navigate("/order-confirmation", {
        state: { refreshWallet: true, placed: true, amount: totalAmount, basketId },
      });
    } catch (err) {
      console.error("❌ Error placing order:", err);
      alert("Error placing order: " + (err.message || String(err)));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="order-container">
      <h2 className="page-title">Place Market Order with {broker || "Broker"}</h2>
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
        settled trades to your StockLoyal portfolio. To execute <strong>sell orders</strong>,
        please contact your broker directly through their application or service desk.
      </p>

      {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
