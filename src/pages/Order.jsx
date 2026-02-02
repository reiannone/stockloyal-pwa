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

      // ✅ Log points redemption in transactions ledger
      let ledgerSuccess = false;
      try {
        const clientTxId = `redeem_${memberId}_${basketId}_${Date.now()}`;
        const memberTimezone =
          localStorage.getItem("memberTimezone") ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "America/New_York";

        const ledgerPayload = {
          member_id: memberId,
          merchant_id: merchantId,
          broker: broker,
          client_tx_id: clientTxId,
          tx_type: "redeem_points",
          points: Math.round(pointsUsed), // ✅ Only send points for redeem_points
          // amount_cash: totalAmount, // ❌ Don't send cash - violates ck_amount_exclusive constraint
          note: `Points redeemed for stock purchase - Basket: ${basketId} - Cash value: $${totalAmount.toFixed(
            2
          )}`,
          member_timezone: memberTimezone,
        };

        console.log("[Order] Logging ledger transaction:", ledgerPayload);

        const ledgerRes = await apiPost("log-ledger.php", ledgerPayload);

        console.log("[Order] Ledger response:", ledgerRes);

        if (!ledgerRes?.success) {
          console.error("[Order] Ledger transaction FAILED:", ledgerRes?.error);
          // Show warning to user but don't fail the order
          alert(
            "Warning: Transaction logging failed. Your order was placed successfully, but the transaction may not appear in your ledger immediately."
          );
        } else {
          ledgerSuccess = true;
          console.log("[Order] Ledger transaction logged successfully:", clientTxId);
        }
      } catch (err) {
        console.error("[Order] Failed to log ledger transaction - EXCEPTION:", err);
        alert("Warning: Transaction logging error. Your order was placed successfully.");
      }

      // ✅ Notify merchant of points redemption
      let merchantNotified = false;
      try {
        const merchantPayload = {
          member_id: memberId,
          merchant_id: merchantId,
          points_redeemed: Math.round(pointsUsed), // ✅ Send as integer
          cash_value: totalAmount,
          basket_id: basketId,
          transaction_type: "redeem",
          timestamp: new Date().toISOString(),
        };

        const notifyRes = await apiPost("notify_merchant.php", merchantPayload);
        merchantNotified = notifyRes?.notified || notifyRes?.success;
        console.log("[Order] Merchant notified:", merchantNotified);
      } catch (err) {
        console.error("[Order] Failed to notify merchant:", err);
        // Don't fail the order if merchant notification fails
      }

      // ✅ Check sweep_day to determine if broker processes should run
      // Run broker notifications if sweep_day is missing, null, or "T+1" (immediate processing)
      // Skip if sweep_day is 1-31 (orders will be batched on that day of the month)
      const sweepDay = localStorage.getItem("sweep_day");
      const runBrokerProcesses = !sweepDay || sweepDay === "T+1";

      let brokerNotified = false;

      if (!runBrokerProcesses) {
        console.log("[Order] Skipping broker processes - sweep_day:", sweepDay, "(orders will be batched)");
      } else {
        console.log("[Order] Running broker processes - sweep_day:", sweepDay || "(not set)");
        // ✅ Notify broker (server-side uses broker_master.webhook_url + api_key)
        // Modeled after merchant_notifications approach: try/catch, log on server, do NOT fail order
        try {
          const brokerPayload = {
            event_type: "order_placed",
            member_id: memberId,
            merchant_id: merchantId,
            broker: broker || "Not linked", // matches broker_master.broker_name OR broker_id (backend supports both)
            basket_id: basketId,
            amount: totalAmount,
            points_used: Math.round(pointsUsed),
            orders: enrichedBasket.map((s, idx) => ({
              symbol: s.symbol,
              shares: s.shares || 0,
              points_used: pointsAlloc[idx] || 0,
              amount: perOrderAmount,
              order_type: "market",
            })),
            timestamp: new Date().toISOString(),
          };

          const brokerRes = await apiPost("notify_broker.php", brokerPayload);
          brokerNotified = brokerRes?.notified || brokerRes?.success;
          console.log("[Order] Broker notified:", brokerNotified, brokerRes);
        } catch (err) {
          console.error("[Order] Failed to notify broker:", err);
          // Don't fail the order if broker notification fails
        }

        // broker confirm stub
        setTimeout(async () => {
          try {
            const confirmRes = await apiPost("broker_confirm.php", { member_id: memberId });
            console.log("[Order] Broker confirm response:", confirmRes);
          } catch (err) {
            console.error("[Order] Broker confirm error:", err);
          }
        }, 60000); // 1 minutes = 1 * 60 * 1000 = 60,000ms
      }

      // 🔊 success ping here
      playPing();

      // nav + clear basket
      clearBasket();
      navigate("/order-confirmation", {
        state: {
          refreshWallet: true,
          placed: true,
          amount: totalAmount,
          basketId,
          merchantNotified, // ✅ Pass notification status
          brokerNotified, // ✅ Pass broker notification status
          pointsUsed: Math.round(pointsUsed), // ✅ Pass points used
          // ledgerSuccess, // optional if you want to show status on confirmation page
        },
      });
    } catch (err) {
      alert("Error placing order: " + (err.message || String(err)));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="order-container">
      <h2 className="page-title">Place Buy Order with {broker || "Broker"}</h2>
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
          {placing ? "Placing orders…" : `Place Buy Order with ${broker || "Broker"}`}
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

      {error && (
        <p className="form-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
