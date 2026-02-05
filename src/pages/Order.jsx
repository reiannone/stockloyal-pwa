// src/pages/Order.jsx
import React, { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useBasket } from "../context/BasketContext";
import { apiPost } from "../api.js";
import {
  CreditCard,
  BarChart2,
  RefreshCw,
  Share2,
  XCircle,
  AlertTriangle,
  ShoppingBasket,
  ClipboardCheck,
} from "lucide-react";

// ⭐ NEW: import audio as module so bundler manages path
import pingSound from "../assets/sounds/mixkit-confirmation-tone-2867.wav";
import { color } from "framer-motion";

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
  const merchantName = localStorage.getItem("merchantName") || "your merchant";
  const sweepDayRaw = localStorage.getItem("sweep_day");

  // Helper: ordinal suffix for day numbers (1st, 2nd, 3rd, 15th, etc.)
  const ordinal = (n) => {
    const num = parseInt(n, 10);
    if (isNaN(num)) return n;
    const s = ["th", "st", "nd", "rd"];
    const v = num % 100;
    return num + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Format number with commas (e.g., 513007 → "513,007")
  const fmt = (n) => Number(n).toLocaleString();

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

      // ✅ Check sweep_day to determine order processing mode
      // - "T+1", null, or missing: Immediate processing with 3-stage flow (pending → placed → confirmed)
      // - "1"-"31" or "-1": Batched processing on sweep day (status: "queued")
      const sweepDay = localStorage.getItem("sweep_day");
      const isImmediateProcessing = !sweepDay || sweepDay === "T+1";
      const initialOrderStatus = isImmediateProcessing ? "pending" : "queued";

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
          status: initialOrderStatus, // ✅ Matches database column name
          sweep_day: sweepDay || null, // ✅ Include sweep_day for backend reference
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

      // ✅ THREE-STAGE ORDER PROCESS (for T+1/null/missing sweep_day):
      // Stage 1: Order created with status "pending" (done above)
      // Stage 2: notify_broker.php → Broker acknowledges → status updated to "placed"
      // Stage 3: broker_confirm.php → Broker confirms execution → status updated to "confirmed"
      //
      // For batched orders (sweep_day 1-31): Orders stay "queued" until sweep day processing

      let brokerNotified = false;

      if (!isImmediateProcessing) {
        console.log("[Order] Skipping broker processes - sweep_day:", sweepDay, "(orders queued for batch processing)");
      } else {
        console.log("[Order] Running 3-stage broker process - sweep_day:", sweepDay || "(not set)");
        
        // ✅ STAGE 2: Notify broker to acknowledge order → updates status to "placed"
        try {
          const brokerPayload = {
            event_type: "order_placed",
            member_id: memberId,
            merchant_id: merchantId,
            broker: broker || "Not linked",
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
            // ✅ Include processing stage info
            processing_stage: "acknowledge", // Broker should update order status to "placed"
          };

          const brokerRes = await apiPost("notify_broker.php", brokerPayload);
          brokerNotified = brokerRes?.notified || brokerRes?.success;
          console.log("[Order] Stage 2 - Broker notified:", brokerNotified, brokerRes);
        } catch (err) {
          console.error("[Order] Stage 2 - Failed to notify broker:", err);
          // Don't fail the order if broker notification fails
        }

        // ✅ STAGE 3: Broker confirmation → updates status to "confirmed"
        // Delayed call to allow broker time to process and execute the order
        setTimeout(async () => {
          try {
            const confirmPayload = {
              member_id: memberId,
              basket_id: basketId,
              processing_stage: "confirm", // Broker should update order status to "confirmed"
            };
            const confirmRes = await apiPost("broker_confirm.php", confirmPayload);
            console.log("[Order] Stage 3 - Broker confirm response:", confirmRes);
          } catch (err) {
            console.error("[Order] Stage 3 - Broker confirm error:", err);
          }
        }, 6000); // 1 minute delay for broker to process
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
          merchantNotified,
          brokerNotified,
          pointsUsed: Math.round(pointsUsed),
          // ✅ Order processing info
          orderStatus: initialOrderStatus, // "pending" for T+1, "queued" for batched
          isImmediateProcessing, // true for T+1/null/missing, false for batched
          sweepDay: sweepDay || null,
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
      <h2 className="page-title">My Buy Order with {broker || "Broker"}</h2>
      <p className="order-subtext"></p>
      {enrichedBasket.length > 0 && (
        <div className="order-info-banner" style={{
          background: "#fff8e1",
          border: "1px solid #ffe082",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: "0.93rem",
          lineHeight: 1.5,
          color: "#5d4037",
        }}>
          {(() => {
            const sweepDay = localStorage.getItem("sweep_day");
            const isImmediate = !sweepDay || sweepDay === "T+1";
            const brokerName = broker || "your broker";

            if (isImmediate) {
              return (
                <>
                  <strong>Buy Order — Immediate Processing</strong>
                  <span> — Your order will be submitted to {brokerName} for execution.
                  {merchantName} will be notified that {fmt(pointsUsed)} points
                  were redeemed from your loyalty account.</span>
                </>
              );
            } else {
              return (
                <>
                  <strong>Submitting Buy Order</strong>
                  <span> — Your order will be queued for processing on
                  the {ordinal(sweepDay)} of the month, when {merchantName} converts
                  redeemed loyalty points and submits trade orders to {brokerName}.
                  {" "}{merchantName} will be notified that {fmt(pointsUsed)} points
                  were redeemed from your loyalty account.</span>
                </>
              );
            }
          })()}
        </div>
      )}
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
        <button style={{backgroundColor: "#21b140"}}
          type="button"
          onClick={handlePlaceOrder}
          className="btn-primary"
          disabled={placing}
        >
         <ClipboardCheck size={18} />  {placing ? " Placing orders…" : ` Submit Buy Order with ${broker || "Broker"}`}
        </button>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-secondary"
          disabled={placing}
        >
          <ShoppingBasket size={18} /> Back to Basket
        </button>
      </div>

      <p className="form-disclosure">
        This order is submitted to {broker || "your broker"} as a <strong>{localStorage.getItem("default_order_type") || "market"} order</strong> and is subject to
        the broker's ability to execute it at market price. Orders not filled today will roll to the
        next trading day. For sell orders, please contact {broker || "your broker"} directly.
      </p>

      {error && (
        <p className="form-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
