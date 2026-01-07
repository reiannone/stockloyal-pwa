// src/pages/Order.jsx
import React, { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBasket } from "../context/BasketContext";
import { apiPost } from "../api.js";

// ⭐ NEW: import audio as module so bundler manages path
import pingSound from "../assets/sounds/mixkit-confirmation-tone-2867.wav";

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
  const merchantId = localStorage.getItem("merchantId");

  // basket state
  const enrichedBasket = location.state?.basket || [];
  const totalAmount = Number(location.state?.amount || 0);
  const pointsUsed = Number(location.state?.pointsUsed || 0);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // 🔊 audio created from imported asset (works in Vite/CRA)
  const pingRef = useRef(new Audio(pingSound));

  const playPing = () => {
    try {
      if (!pingRef.current) return;
      pingRef.current.currentTime = 0;
      pingRef.current.volume = 1.0;
      pingRef.current.play().catch((err) => {
        console.warn("Ping play blocked or failed:", err);
      });
    } catch (e) {
      console.warn("Ping audio error:", e);
    }
  };

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
      const basketId = generateBasketId();
      localStorage.setItem("basketId", basketId);

      const perOrderAmount =
        enrichedBasket.length > 0 ? totalAmount / enrichedBasket.length : 0;

      // even split points
      const n = enrichedBasket.length;
      const pointsAlloc = [];
      if (n > 0) {
        if (Number.isInteger(pointsUsed)) {
          const base = Math.floor(pointsUsed / n);
          let remainder = pointsUsed - base * n;
          for (let i = 0; i < n; i++) {
            pointsAlloc.push(base + (i < remainder ? 1 : 0));
          }
        } else {
          const raw = pointsUsed / n;
          const base = Math.floor(raw * 100) / 100;
          let remCents = Math.round(pointsUsed * 100 - base * 100 * n);
          for (let i = 0; i < n; i++) {
            const add = remCents > 0 ? 0.01 : 0;
            pointsAlloc.push(Number((base + add).toFixed(2)));
            if (remCents > 0) remCents--;
          }
        }
      }

      // attempt wallet fetch
      let currentWallet = null;
      try {
        const walletRes = await apiPost("get-wallet.php", { member_id: memberId });
        if (walletRes?.success && walletRes.wallet) currentWallet = walletRes.wallet;
      } catch (_) {}

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

      // place each order
      for (let i = 0; i < enrichedBasket.length; i++) {
        const stock = enrichedBasket[i];

        const payload = {
          member_id: memberId,
          merchant_id: merchantId,
          basket_id: basketId,
          symbol: stock.symbol,
          shares: stock.shares || 0,
          points_used: pointsAlloc[i] || 0,
          amount: perOrderAmount,
          order_type: "market",
          broker: broker || "Not linked",
        };

        const result = await apiPost("place_order.php", payload);
        if (!result?.success) {
          throw new Error(result?.error || `Failed to place order for ${stock.symbol}`);
        }
      }

      // update wallet
      try {
        await apiPost("update_balances.php", {
          member_id: memberId,
          points: newPoints,
          cash_balance: newCash,
          portfolio_value: newPortfolio,
        });

        localStorage.setItem("points", String(newPoints));
        localStorage.setItem("cashBalance", newCash.toFixed(2));
        localStorage.setItem("portfolio_value", newPortfolio.toFixed(2));
      } catch (_) {}

      // broker confirm stub
      setTimeout(async () => {
        try {
          await apiPost("broker_confirm.php", { member_id: memberId });
        } catch (_) {}
      }, 1000);

      // 🔊 success ping here
      playPing();

      // nav + clear basket
      clearBasket();
      navigate("/order-confirmation", {
        state: { refreshWallet: true, placed: true, amount: totalAmount, basketId },
      });
    } catch (err) {
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
          <p className="basket-intro">
            Total Investment: ${Number(totalAmount).toFixed(2)}
          </p>
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

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-secondary"
          disabled={placing}
        >
          Back to Basket
        </button>
      </div>

      <p className="form-disclosure">
        This order is submitted to your broker as a <strong>market order</strong> and is subject to
        the broker's ability to execute it at market price. Orders not filled today will roll to the
        next trading day. For sell orders, please contact your broker directly.
      </p>

      {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
