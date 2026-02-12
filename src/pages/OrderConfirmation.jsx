// src/pages/OrderConfirmation.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { CheckCircle, ShoppingBasket, Share2 } from "lucide-react";
import SharePointsSheet from "../components/SharePointsSheet.jsx";

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();

  const memberId = localStorage.getItem("memberId");

  // ✅ Pull broker name from storage for <<BROKER>> replacement
  const brokerName =
    localStorage.getItem("broker") ||
    localStorage.getItem("selectedBroker") ||
    localStorage.getItem("brokerName") ||
    "your broker";

  // ✅ Pull merchant name from storage for sweep schedule message
  const merchantName =
    localStorage.getItem("merchantName") ||
    localStorage.getItem("merchant_name") ||
    "Your merchant";

  const [orders, setOrders] = useState([]);
  const [memberTimezone, setMemberTimezone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ success banner (sound removed - plays elsewhere)
  const [showSuccess, setShowSuccess] = useState(false);

  // ✅ Social share sheet
  const [isShareOpen, setIsShareOpen] = useState(false);

  // ✅ passed from Order.jsx
  const totalAmount = Number(location.state?.amount || 0); // keep if referenced elsewhere
  const basketId =
    location.state?.basketId || localStorage.getItem("basketId") || "";
  const merchantNotified = location.state?.merchantNotified || false;

  // ✅ NEW: broker notification status (passed from Order.jsx)
  const brokerNotified = location.state?.brokerNotified || false;

  // ✅ NEW: Sweep schedule info (passed from Order.jsx)
  const isImmediateProcessing = location.state?.isImmediateProcessing !== false; // default true
  const sweepDay = location.state?.sweepDay || localStorage.getItem("sweep_day") || null;

  const pointsUsed = location.state?.pointsUsed || 0;

  // ✅ Helper to format sweep day display
  const getSweepDayDisplay = (day) => {
    if (!day) return "";
    const d = parseInt(day, 10);
    if (d === -1) return "last day";
    if (d >= 1 && d <= 31) {
      const suffix = (d === 1 || d === 21 || d === 31) ? "st" 
        : (d === 2 || d === 22) ? "nd" 
        : (d === 3 || d === 23) ? "rd" 
        : "th";
      return `${d}${suffix}`;
    }
    return String(day);
  };

  // Browser-detected fallback
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // Fetch orders + wallet (timezone) in parallel
        const [ordersRes, walletRes] = await Promise.all([
          apiPost("get_order_history.php", { member_id: memberId }),
          apiPost("get-wallet.php", { member_id: memberId }),
        ]);

        if (!ordersRes?.success) {
          setError(ordersRes?.error || "Failed to load orders.");
          setLoading(false);
        } else {
          // Filter to current basket
          const bid = String(basketId || "");
          const fetchedOrders = (ordersRes.orders || []).filter(
            (o) => String(o.basket_id || "") === bid
          );

          console.log("📦 Fetched orders:", fetchedOrders);
          console.log(
            "📦 Orders with status:",
            fetchedOrders.map((o) => ({ symbol: o.symbol, status: o.status }))
          );

          // ✅ Show success banner if ANY orders exist for this basket
          const hasSuccess = fetchedOrders.length > 0;

          console.log(
            "✅ Has success?",
            hasSuccess,
            `(${fetchedOrders.length} orders found)`
          );

          // Set orders AND success state together
          setOrders(fetchedOrders);

          if (hasSuccess) {
            console.log("🎉 Setting showSuccess to TRUE");
            setShowSuccess(true);

            // Update portfolio value from all orders in this basket
            const portfolioValue = fetchedOrders.reduce(
              (sum, o) => sum + (parseFloat(o.amount) || 0),
              0
            );

            apiPost("update_balances.php", {
              member_id: memberId,
              points: parseInt(localStorage.getItem("points") || "0", 10),
              cash_balance: parseFloat(localStorage.getItem("cashBalance") || "0"),
              portfolio_value: portfolioValue,
            }).catch((err) => {
              console.error("Error updating balances:", err);
            });

            localStorage.setItem("portfolio_value", portfolioValue.toFixed(2));
          }

          // Timezone from wallet (fallback to browser)
          const tz =
            walletRes?.success &&
            walletRes?.wallet?.member_timezone &&
            String(walletRes.wallet.member_timezone).trim() !== ""
              ? walletRes.wallet.member_timezone
              : detectedTz;

          setMemberTimezone(tz);
          setLoading(false);
        }
      } catch (err) {
        console.error("OrderConfirmation fetch error:", err);
        setError("Network error while fetching orders.");
        setLoading(false);
      }
    })();
  }, [memberId, basketId, detectedTz]);

  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  // Convert UTC/MySQL-ish timestamps to member's local time string
  const toLocalZonedString = (ts) => {
    if (!ts) return "-";

    // If ts lacks timezone info (e.g., "YYYY-MM-DD HH:MM:SS"), treat as UTC
    let iso = String(ts).trim();
    const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
    if (!hasZone) iso = iso.replace(" ", "T") + "Z";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return ts;

    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: memberTimezone || detectedTz,
        timeZoneName: "short",
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  if (loading) {
    return (
      <div className="order-container">
        <h2 className="page-title">Order Confirmation</h2>
        <p>Loading your orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-container">
        <h2 className="page-title">Order Confirmation</h2>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="order-container">
      <h2 className="page-title">Buy Order Confirmation</h2>

      {basketId && (
        <p style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
          Basket ID: <strong>{basketId}</strong>
        </p>
      )}

      <p className="page-deck">Below are the orders submitted in this checkout.</p>

      {/* ✅ Success banner + green check - different message for queued vs placed */}
      {showSuccess && (
        <>
          {console.log("🎉 SUCCESS BANNER RENDERING - showSuccess:", showSuccess, "isImmediateProcessing:", isImmediateProcessing)}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: isImmediateProcessing ? "#ecfdf5" : "#fef3c7",
              border: isImmediateProcessing ? "2px solid #10b981" : "2px solid #f59e0b",
              color: isImmediateProcessing ? "#065f46" : "#78350f",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 16,
              fontWeight: 800,
              fontSize: "0.95rem",
              textAlign: "center",
            }}
          >
            <CheckCircle size={28} color={isImmediateProcessing ? "#10b981" : "#f59e0b"} />
            <span>
              {isImmediateProcessing 
                ? `Buy Orders Successfully Placed — your buy order submitted to ${brokerName}!`
                : `Buy Orders Pending — your order is submitted to ${merchantName} and queued for processing on the ${getSweepDayDisplay(sweepDay)} of the month.`
              }
            </span>
          </div>
        </>
      )}

      {/* ✅ Broker Notification Banner (only for immediate/T+1 processing when broker confirmed) */}
      {showSuccess && isImmediateProcessing && brokerNotified && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "#e0f2fe",
            border: "2px solid #0284c7",
            color: "#0c4a6e",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 16,
            fontWeight: 600,
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          <CheckCircle size={24} color="#0284c7" />
          <span>✅ Broker Notified: {brokerName} received your order details</span>
        </div>
      )}

      {/* ✅ Merchant Notification Banner */}
      {showSuccess && merchantNotified && pointsUsed > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "#fef3c7",
            border: "2px solid #f59e0b",
            color: "#78350f",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 16,
            fontWeight: 600,
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          <CheckCircle size={24} color="#f59e0b" />
          <span>
            ✅ ${merchantName} Notified: {pointsUsed.toLocaleString()} points redeemed from your loyalty account
          </span>
        </div>
      )}

      {orders.length === 0 ? (
        <p>No orders found for this basket.</p>
      ) : (
        <div className="basket-table-wrapper">
          <table className="basket-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Shares</th>
                <th>Order Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Date & Time (Local)</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr key={idx}>
                  <td className="symbol">{order.symbol}</td>
                  <td className="shares">{order.shares}</td>
                  <td className="order-type">{`buy ${order.order_type || "buy"}`}</td>
                  <td className="status">{order.status || "Pending"}</td>
                  <td className="amount">{order.amount ? formatDollars(order.amount) : "-"}</td>
                  <td className="date">{order.placed_at ? toLocalZonedString(order.placed_at) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="basket-actions">
        {/* ✅ Share Your Investment */}
        {showSuccess && orders.length > 0 && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsShareOpen(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Share2 size={18} /> Share Your Investment
          </button>
        )}

        <button type="button" className="btn-secondary" onClick={() => navigate("/wallet")}>
          <ShoppingBasket size={18} /> Back to Wallet
        </button>
      </div>

      {/* ✅ Disclosure with broker name from storage */}
      <p className="form-disclosure">
        <strong>Disclosure for Order Confirmation Page</strong>
        <br />
        This confirmation reflects only the orders you just placed in this basket.
        Your official trade confirmations and records remain with {brokerName}.
      </p>

      {/* ✅ Social share sheet */}
      <SharePointsSheet
        open={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        memberId={memberId}
        pointsUsed={pointsUsed || orders.reduce((sum, o) => sum + (parseInt(o.points_used, 10) || 0), 0)}
        cashValue={totalAmount || orders.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0)}
        primaryTicker={orders.length > 0 ? orders[0].symbol : null}
        tickers={orders.map((o) => o.symbol).filter(Boolean)}
        merchantName={merchantName}
        broker={brokerName}
      />
    </div>
  );
}
