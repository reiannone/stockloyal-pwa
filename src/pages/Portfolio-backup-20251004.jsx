// src/pages/Portfolio.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";

export default function Portfolio() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [orders, setOrders] = useState([]);
  const [totalConfirmed, setTotalConfirmed] = useState(0);
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
        // ✅ Fetch all orders for this member
        const data = await apiPost("get_order_history.php", { member_id: memberId });

        if (!data.success) {
          setError(data.error || "Failed to load portfolio.");
          return;
        }

        const fetchedOrders = data.orders || [];

        // ✅ Calculate confirmed total
        const confirmedTotal = fetchedOrders
          .filter(o =>
            ["confirmed", "executed"].includes((o.status || "").toLowerCase())
          )
          .reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);

        setOrders(fetchedOrders);
        setTotalConfirmed(confirmedTotal);
      } catch (err) {
        console.error("Portfolio fetch error:", err);
        setError("Network error while fetching portfolio.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  if (loading) {
    return (
      <div className="portfolio-container">
        <h2 className="portfolio-heading" style={{ textAlign: "center" }}>
          Portfolio
        </h2>
        <p>Loading your portfolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-container">
        <h2 className="portfolio-heading" style={{ textAlign: "center" }}>
          StockLoyal Portfolio
        </h2>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="portfolio-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Your StockLoyal Portfolio
      </h2>

      {/* ✅ Total confirmed portfolio value with styled amount only */}
      <div
        className="portfolio-total"
        style={{
          textAlign: "center",
          marginBottom: "20px",
          fontSize: "1rem",
        }}
      >
        <strong>Total Confirmed Value:</strong>{" "}
        <span
          style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            color: "#007bff",
          }}
        >
          {formatDollars(totalConfirmed)}
        </span>
      </div>

      {orders.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          You have not placed any orders yet.
        </p>
      ) : (
        <div className="basket-table-wrapper">
          <table className="basket-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Shares</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Order Type</th>
                <th>Status</th>
                <th>Placed At</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr key={idx}>
                  <td className="symbol">{order.symbol}</td>
                  <td className="shares">{order.shares}</td>
                  <td className="amount" style={{ textAlign: "right" }}>
                    {order.amount ? formatDollars(order.amount) : "-"}
                  </td>
                  <td className="order-type">{order.order_type || "-"}</td>
                  <td className="status">{order.status || "Pending"}</td>
                  <td className="date">
                    {order.placed_at
                      ? new Date(order.placed_at).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="portfolio-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/wallet")}
        >
          Back to Wallet
        </button>
      </div>
    </div>
  );
}
