// src/pages/OrderConfirmation.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const memberId = localStorage.getItem("memberId");

  const [orders, setOrders] = useState([]);
  const [memberTimezone, setMemberTimezone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ passed from Order.jsx
  const totalAmount = Number(location.state?.amount || 0); // not required here; keep if you reference it elsewhere
  const basketId =
    location.state?.basketId || localStorage.getItem("basketId") || "";

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
        // 1) Fetch orders + wallet (for timezone) in parallel
        const [ordersRes, walletRes] = await Promise.all([
          apiPost("get_order_history.php", { member_id: memberId }),
          apiPost("get-wallet.php", { member_id: memberId }),
        ]);

        if (!ordersRes?.success) {
          setError(ordersRes?.error || "Failed to load orders.");
        } else {
          // 2) Filter only current basket orders (coerce to string to be safe)
          const bid = String(basketId || "");
          const fetchedOrders = (ordersRes.orders || []).filter(
            (o) => String(o.basket_id || "") === bid
          );
          setOrders(fetchedOrders);

          // 3) Optionally update wallet portfolio_value from this basket (unchanged logic)
          if (fetchedOrders.length > 0) {
            const portfolioValue = fetchedOrders
              .filter((o) =>
                ["confirmed", "executed"].includes((o.status || "").toLowerCase())
              )
              .reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);

            await apiPost("update_balances.php", {
              member_id: memberId,
              points: parseInt(localStorage.getItem("points") || "0", 10),
              cash_balance: parseFloat(localStorage.getItem("cashBalance") || "0"),
              portfolio_value: portfolioValue,
            });

            localStorage.setItem("portfolio_value", portfolioValue.toFixed(2));
          }
        }

        // 4) Timezone from wallet (fallback to browser)
        const tz =
          walletRes?.success &&
          walletRes?.wallet?.member_timezone &&
          String(walletRes.wallet.member_timezone).trim() !== ""
            ? walletRes.wallet.member_timezone
            : detectedTz;

        setMemberTimezone(tz);
      } catch (err) {
        console.error("OrderConfirmation fetch error:", err);
        setError("Network error while fetching orders.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, basketId, detectedTz, totalAmount]);

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
    if (!hasZone) {
      iso = iso.replace(" ", "T") + "Z";
    }

    const d = new Date(iso);
    if (isNaN(d.getTime())) return ts; // fallback to raw

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
      <h2 className="page-title">Your Portfolio Orders</h2>
      {basketId && (
        <p style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
          Basket ID: <strong>{basketId}</strong>
        </p>
      )}
      <p className="page-deck">
        Below are the orders placed in this checkout.
      </p>
      {/* Show which timezone is used for rendering */}
      <p className="subtext" style={{ marginTop: -6, marginBottom: 12 }}>
        Showing times in <strong>{memberTimezone || detectedTz}</strong>
      </p>

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
                <th>Date (Local)</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr key={idx}>
                  <td className="symbol">{order.symbol}</td>
                  <td className="shares">{order.shares}</td>
                  <td className="order-type">{order.order_type || "-"}</td>
                  <td className="status">{order.status || "Pending"}</td>
                  <td className="amount">
                    {order.amount ? formatDollars(order.amount) : "-"}
                  </td>
                  <td className="date">
                    {order.placed_at ? toLocalZonedString(order.placed_at) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="basket-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/wallet")}
        >
          Back to Wallet
        </button>
      </div>

      {/* ✅ Disclosure */}
      <p className="form-disclosure">
        <strong>Disclosure for Order Confirmation Page</strong>
        <br />
        This confirmation reflects only the orders you just placed in this basket.
        Your official trade confirmations and records remain with your broker.
      </p>
    </div>
  );
}
