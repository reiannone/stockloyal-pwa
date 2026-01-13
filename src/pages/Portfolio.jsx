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

  // ✅ Get broker from localStorage (brokerName may not be populated)
  const storedBroker = localStorage.getItem("broker");
  
  console.log("[Portfolio] storedBroker:", storedBroker);
  
  // ✅ Use broker directly
  const memberBroker = brokerContext?.broker?.name || storedBroker || "your brokerage firm";

  // ✅ Get broker website URL (only if actual broker is set)
  const getBrokerUrl = () => {
    if (!storedBroker) return null; // No broker selected, no link
    
    console.log("[Portfolio] Looking up URL for broker:", storedBroker);
    
    // Map broker values (handle case-insensitive matching)
    const brokerUrls = {
      // Match both display names and internal values
      "interactive brokers": "https://www.interactivebrokers.com",
      "Interactive Brokers": "https://www.interactivebrokers.com",
      "charles schwab": "https://www.schwab.com",
      "Charles Schwab": "https://www.schwab.com",
      "fidelity": "https://www.fidelity.com",
      "Fidelity": "https://www.fidelity.com",
      "td ameritrade": "https://www.tdameritrade.com",
      "TD Ameritrade": "https://www.tdameritrade.com",
      "e*trade": "https://www.etrade.com",
      "E*TRADE": "https://www.etrade.com",
      "robinhood": "https://robinhood.com",
      "Robinhood": "https://robinhood.com",
      "webull": "https://www.webull.com",
      "Webull": "https://www.webull.com",
      "vanguard": "https://www.vanguard.com",
      "Vanguard": "https://www.vanguard.com",
    };
    
    const url = brokerUrls[storedBroker] || null;
    console.log("[Portfolio] Broker URL found:", url);
    
    return url;
  };

  const brokerUrl = getBrokerUrl();

  const [orders, setOrders] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState(""); // "" = all | symbol | stock_name
  const [filterValue, setFilterValue] = useState("");

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

  // Filter orders based on selected filter
  const filteredOrders = React.useMemo(() => {
    if (!filterField || !filterValue.trim()) {
      return orders; // No filter applied
    }

    const val = filterValue.trim().toLowerCase();

    switch (filterField) {
      case "symbol":
        return orders.filter((o) => 
          (o.symbol || "").toLowerCase().includes(val)
        );
      
      case "stock_name":
        return orders.filter((o) => 
          (o.stock_name || "").toLowerCase().includes(val)
        );
      
      default:
        return orders;
    }
  }, [orders, filterField, filterValue]);

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

  // ---- NEW: click handler to launch SymbolChart ----
  const handleSymbolClick = (symbol) => {
    if (!symbol) return;
    // Route assumes: <Route path="/symbol/:symbol" element={<SymbolChart />} />
    navigate(`/symbol-chart/${encodeURIComponent(symbol)}`);
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

      {/* Filter bar */}
      {!loading && !error && orders.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Filter controls row */}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: "600", color: "#374151", minWidth: "50px" }}>
                Filter:
              </label>
              <select
                className="form-input"
                style={{ minWidth: 200, flex: "0 1 auto" }}
                value={filterField}
                onChange={(e) => {
                  setFilterField(e.target.value);
                  setFilterValue("");
                }}
              >
                <option value="">All Holdings</option>
                <option value="symbol">Symbol</option>
                <option value="stock_name">Stock Name</option>
              </select>

              {filterField && (
                <input
                  className="form-input"
                  type="text"
                  placeholder={
                    filterField === "symbol"
                      ? "e.g. AAPL"
                      : filterField === "stock_name"
                      ? "e.g. Apple Inc."
                      : ""
                  }
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                />
              )}

              <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap" }}>
                Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong> holdings
              </span>
            </div>

            {/* Clear filter button row */}
            {(filterField || filterValue) && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setFilterField("");
                    setFilterValue("");
                  }}
                  style={{ fontSize: "0.85rem", minWidth: "120px" }}
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Loading / Error / Empty ---- */}
      {loading ? (
        <p>Loading your portfolio...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : filteredOrders.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          {orders.length === 0 ? "You have no confirmed holdings yet." : "No holdings match the current filter."}
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
                {filteredOrders.map((o, idx) => (
                  <tr
                    key={idx}
                    onClick={() => handleSymbolClick(o.symbol)}
                    style={{ cursor: "pointer" }}
                    title={`View ${o.symbol} chart`}
                  >
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
          View Order History
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
        These holdings are maintained directly with your brokerage firm,{" "}
        {brokerUrl ? (
          <strong>
            <a 
              href={brokerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "#007bff", textDecoration: "underline" }}
            >
              {memberBroker}
            </a>
          </strong>
        ) : (
          <strong>{memberBroker}</strong>
        )}
        . To view your full investment portfolio, please visit your broker's website or app.
      </p>
    </div>
  );
}
