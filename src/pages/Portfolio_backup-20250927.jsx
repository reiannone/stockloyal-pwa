// src/pages/Portfolio.jsx (was OrderConfirmation.jsx)
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";

export default function Portfolio() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false); // ✅ new state

  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await apiPost("get_order_history.php", { member_id: memberId });

        if (!data.success) {
          setError(data.error || "Failed to load orders.");
          return;
        }

        setOrders(data.orders || []);
      } catch (err) {
        console.error("Portfolio fetch error:", err);
        setError("Network error while fetching orders.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  // ✅ Filter logic
  const filteredOrders = showAll
    ? orders
    : orders.filter((o) => (o.status || "").toLowerCase() === "confirmed");

  if (loading) {
    return (
      <div className="order-container">
        <h2 className="order-heading">Portfolio</h2>
        <p>Loading your orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-container">
        <h2 className="order-heading">Portfolio</h2>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="order-container">
      <h2 className="order-heading">Your Portfolio Orders</h2>
      <p className="order-subtext">
        {showAll
          ? "Showing all orders (Confirmed + Pending + Cancelled)."
          : "Showing only confirmed orders in your portfolio."}
      </p>

      {filteredOrders.length === 0 ? (
        <p>
          {showAll
            ? "You have no transactions yet."
            : "You have no confirmed orders yet."}
        </p>
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
              {filteredOrders.map((order, idx) => (
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

      <div className="basket-actions" style={{ marginTop: "20px" }}>
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/wallet")}
        >
          Back to Wallet
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ marginLeft: "10px" }}
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll ? "Show Confirmed Only" : "Show All Transactions"}
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
