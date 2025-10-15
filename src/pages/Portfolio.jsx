// src/pages/Portfolio.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function Portfolio() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [orders, setOrders] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
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
        const data = await apiPost("get_portfolio_orders.php", { member_id: memberId });
        if (!data.success) {
          setError(data.error || "Failed to load portfolio.");
          return;
        }

        setOrders(data.orders || []);
        setPortfolioValue(data.portfolio_value || 0);
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

  const formatPercent = (val) => {
    const num = parseFloat(val);
    const color = num >= 0 ? "#22c55e" : "#ef4444"; // green / red
    const sign = num > 0 ? "+" : "";
    return (
      <span style={{ color, fontWeight: 500 }}>
        {`${sign}${num.toFixed(2)}%`}
      </span>
    );
  };

  return (
    <div className="portfolio-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Your StockLoyal Portfolio
      </h2>

      {loading ? (
        <p>Loading your portfolio...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : orders.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          You have no confirmed holdings yet.
        </p>
      ) : (
        <>
          {/* --- Portfolio Total --- */}
          <div
            className="portfolio-total"
            style={{
              textAlign: "center",
              marginBottom: "20px",
              fontSize: "1rem",
            }}
          >
            <strong>Total Portfolio Value:</strong>{" "}
            <span
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                color: "#007bff",
              }}
            >
              {formatDollars(portfolioValue)}
            </span>
          </div>

          {/* --- Holdings Table --- */}
          <div className="basket-table-wrapper">
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Stock Name</th>
                  <th style={{ textAlign: "right" }}>Total Shares</th>
                  <th style={{ textAlign: "right" }}>Current Price</th>
                  <th style={{ textAlign: "right" }}>
                    Current Value<br />
                    <small style={{ fontWeight: 400, color: "#666" }}>
                      (and Daily % Change)
                    </small>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, idx) => (
                  <tr key={idx}>
                    <td>{o.symbol}</td>
                    <td>{o.stock_name}</td>
                    <td style={{ textAlign: "right" }}>
                      {o.total_shares?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatDollars(o.current_price)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div>{formatDollars(o.current_value)}</div>
                      <div style={{ fontSize: "0.85rem" }}>
                        {formatPercent(o.daily_change)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* --- Centered Buttons --- */}
      <div
        className="portfolio-actions"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          marginTop: "20px",
        }}
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate("/transactions")}
        >
          View Transactions
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/wallet")}
        >
          Back to Wallet
        </button>
      </div>
      <p className="form-disclosure">
        <strong>Disclosure:</strong> Your <em>StockLoyal Portfolio</em> displays only the securities you’ve purchased through the <strong>StockLoyal app</strong>. 
        These holdings are maintained directly with your brokerage firm, <strong>Charles Schwab</strong>. 
        To view your complete investment portfolio, visit{" "}
        <a
          href="https://www.schwab.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#007bff", textDecoration: "underline" }}
        >
          Charles Schwab
        </a>.
      </p>
    </div>
  );
}
