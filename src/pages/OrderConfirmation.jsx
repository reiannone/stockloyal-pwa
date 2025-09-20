// src/pages/OrderConfirmation.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";

export default function OrderConfirmation() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // ✅ Fetch orders
        const data = await apiPost("get_order_history.php", { member_id: memberId });

        if (!data.success) {
          setError(data.error || "Failed to load orders.");
          return;
        }

        setOrders(data.orders || []);

        // ✅ Deduct points if there are completed orders
        if (data.orders && data.orders.length > 0) {
          // Calculate total spent (you might adapt if partial statuses matter)
          const pointsUsed = data.orders.reduce(
            (sum, o) => sum + (parseInt(o.points_used, 10) || 0),
            0
          );
          const cashUsed = data.orders.reduce(
            (sum, o) => sum + (parseFloat(o.cash_spent) || 0),
            0.0
          );

          if (pointsUsed > 0 || cashUsed > 0) {
            console.log("[OrderConfirmation] Deducting points:", {
              pointsUsed,
              cashUsed,
            });

            // Server update
            await apiPost("deduct_points.php", {
              member_id: memberId,
              points: pointsUsed,
              cash_balance: cashUsed.toFixed(2),
            });

            // Local storage sync
            const lsPoints = parseInt(localStorage.getItem("points") || "0", 10);
            const lsCash = parseFloat(localStorage.getItem("cashBalance") || "0");

            const newPoints = Math.max(lsPoints - pointsUsed, 0);
            const newCash = Math.max(lsCash - cashUsed, 0);

            localStorage.setItem("points", newPoints.toString());
            localStorage.setItem("cashBalance", newCash.toFixed(2));

            console.log("[OrderConfirmation] Wallet updated locally:", {
              newPoints,
              newCash,
            });
          }
        }
      } catch (err) {
        console.error("OrderConfirmation fetch error:", err);
        setError("Network error while fetching orders.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  if (loading) {
    return (
      <div className="order-container">
        <h2 className="order-heading">Order Confirmation</h2>
        <p>Loading your orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-container">
        <h2 className="order-heading">Order Confirmation</h2>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="order-container">
      <h2 className="order-heading">Your Portfolio Orders</h2>
      <p className="order-subtext">
        Below is a history of all orders placed with your StockLoyal account.
      </p>

      {orders.length === 0 ? (
        <p>You have not placed any orders yet.</p>
      ) : (
        <div className="basket-table-wrapper">
          <table className="basket-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Shares</th>
                <th>Order Type</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr key={idx}>
                  <td className="symbol">{order.symbol}</td>
                  <td className="shares">{order.shares}</td>
                  <td className="order-type">{order.order_type}</td>
                  <td className="status">{order.status || "Pending"}</td>
                  <td className="date">
                    {order.created_at
                      ? new Date(order.created_at).toLocaleString()
                      : "-"}
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
        <strong>Disclosure for Order History Page</strong>
        <br />
        <br />
        This Order History page reflects all orders you have placed through
        <strong> StockLoyal</strong> with your broker. Please note that your actual
        stock positions are held directly at your broker and are subject to:
        <br />
        <br />
        • <strong>Market maker pricing</strong> and execution conditions at the time
        your order reaches the market.
        <br />
        • <strong>Broker-specific processes</strong>, including their own policies on
        order routing, trade settlement, and reporting.
        <br />
        • <strong>Corporate actions or account-level activities</strong> (e.g.,
        dividends, stock splits, fees) managed by your broker.
        <br />
        <br />
        StockLoyal provides visibility into the orders you placed via this platform
        and will display settled trades in your StockLoyal portfolio. However, your
        broker remains the <strong>legal custodian</strong> of your securities, and
        your official confirmation, trade execution details, and ongoing account
        records will always be provided directly by your broker.
      </p>
    </div>
  );
}
