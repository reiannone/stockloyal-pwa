// src/pages/Portfolio.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

// OPTIONAL — only if BrokerContext exists. If not, this still works.
import { useBroker } from "../context/BrokerContext";

export default function Portfolio() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  // broker lookup (context + localStorage fallback)
  let brokerContext = null;
  try {
    brokerContext = useBroker();
  } catch (_) {
    brokerContext = null;
  }

  const storedBrokerName = localStorage.getItem("brokerName");
  const memberBroker =
    brokerContext?.broker?.name || storedBrokerName || "your brokerage firm";

  const [orders, setOrders] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ---- Load data ----
  const loadPortfolio = useCallback(
    async (isRefresh = false) => {
      if (!memberId) {
        setError("No member ID found — please log in again.");
        setLoading(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await apiPost("get_portfolio_orders.php", {
          member_id: memberId,
        });

        console.log("[Portfolio] response data:", data);

        if (!data.success) {
          setError(data.error || "Failed to load portfolio.");
          return;
        }

        setOrders(data.orders || []);
        setPortfolioValue(data.portfolio_value || 0);
        setError("");

        // Set timestamp
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Portfolio fetch error:", err);
        setError("Network error while fetching portfolio.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [memberId]
  );

  // ---- Initial Load ----
  useEffect(() => {
    loadPortfolio(false);
  }, [loadPortfolio]);

  // ---- Auto refresh every 60 seconds ----
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadPortfolio(true);
    }, 60000);
    return () => clearInterval(intervalId);
  }, [loadPortfolio]);

  // ---- Helpers ----
  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  const formatPercent = (val) => {
    const num = parseFloat(val);
    if (!Number.isFinite(num))
      return <span style={{ color: "#6b7280" }}>—</span>;

    const color = num >= 0 ? "#22c55e" : "#ef4444";
    const sign = num > 0 ? "+" : "";
    return (
      <span style={{ color, fontWeight: 500 }}>
        {`${sign}${num.toFixed(2)}%`}
      </span>
    );
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "";
    return ts.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="portfolio-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Your StockLoyal Portfolio
      </h2>

      {/* ---- Last Updated Timestamp ---- */}
      {lastUpdated && !loading && !error && (
        <p
          style={{
            textAlign: "center",
            marginTop: "-6px",
            marginBottom: "18px",
            color: "#6b7280",
            fontSize: "0.85rem",
          }}
        >
          Last updated: <strong>{formatTimestamp(lastUpdated)}</strong>
        </p>
      )}

      {/* ---- Loading / Error / Empty ---- */}
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
          {/* ==== Portfolio Value + Refresh ==== */}
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

            <div style={{ marginTop: "8px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => loadPortfolio(true)}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "Refresh Prices"}
              </button>
            </div>
          </div>

          {/* ==== Holdings Table ==== */}
          <div className="basket-table-wrapper">
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Stock Name</th>
                  <th style={{ textAlign: "right" }}>Total Shares</th>
                  <th style={{ textAlign: "right" }}>Current Price</th>
                  <th style={{ textAlign: "right" }}>
                    Current Value
                    <br />
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

      {/* ==== Buttons ==== */}
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

      {/* ==== Dynamic Disclosure (Correct Broker Displayed) ==== */}
      <p className="form-disclosure">
        <strong>Disclosure:</strong> Your <em>StockLoyal Portfolio</em> displays
        only the securities purchased through the <strong>StockLoyal app</strong>.
        These holdings are maintained directly with your brokerage firm,
        <strong> {memberBroker}</strong>. To view your full investment portfolio,
        please visit your broker’s website or app.
      </p>
    </div>
  );
}
