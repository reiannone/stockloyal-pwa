// src/pages/Portfolio.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

import { useBroker } from "../context/BrokerContext";

export default function Portfolio() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  let brokerContext = null;
  try {
    brokerContext = useBroker();
  } catch (_) {
    brokerContext = null;
  }

  const storedBroker = localStorage.getItem("broker");
  const isAlpaca = storedBroker?.toLowerCase() === "alpaca";

  console.log("[Portfolio] storedBroker:", storedBroker, "isAlpaca:", isAlpaca);

  const memberBroker = brokerContext?.broker?.name || storedBroker || "your brokerage firm";

  const getBrokerUrl = () => {
    if (!storedBroker) return null;
    const brokerUrls = {
      "alpaca": "https://app.alpaca.markets",
      "interactive brokers": "https://www.interactivebrokers.com",
      "charles schwab": "https://www.schwab.com",
      "fidelity": "https://www.fidelity.com",
      "td ameritrade": "https://www.tdameritrade.com",
      "e*trade": "https://www.etrade.com",
      "robinhood": "https://robinhood.com",
      "webull": "https://www.webull.com",
      "vanguard": "https://www.vanguard.com",
    };
    return brokerUrls[storedBroker.toLowerCase()] || null;
  };

  const brokerUrl = getBrokerUrl();

  const [orders, setOrders] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [accountInfo, setAccountInfo] = useState(null);
  const [totalCostBasis, setTotalCostBasis] = useState(0);
  const [totalUnrealizedPL, setTotalUnrealizedPL] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [priceUpdateMsg, setPriceUpdateMsg] = useState(null);

  // Filter state
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");

  // ── Sell modal state ──
  const [sellModal, setSellModal] = useState(null);     // position object or null
  const [sellQty, setSellQty] = useState("");
  const [sellAll, setSellAll] = useState(false);
  const [sellOrderType, setSellOrderType] = useState("market");
  const [sellLimitPrice, setSellLimitPrice] = useState("");
  const [sellSubmitting, setSellSubmitting] = useState(false);
  const [sellResult, setSellResult] = useState(null);    // { success, message, order }
  const [sellError, setSellError] = useState("");

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
        const endpoint = isAlpaca
          ? "alpaca-get-portfolio.php"
          : "get_portfolio_orders.php";

        const data = await apiPost(endpoint, { member_id: memberId });
        console.log("[Portfolio] response:", data);

        if (!data.success) {
          setError(data.error || "Failed to load portfolio.");
          return;
        }

        setOrders(data.orders || []);
        setPortfolioValue(data.portfolio_value || 0);
        setTotalCostBasis(data.total_cost_basis || 0);
        setTotalUnrealizedPL(data.total_unrealized_pl || 0);
        setError("");

        if (data.account) setAccountInfo(data.account);

        setLastUpdated(new Date());

        if (isRefresh) {
          setPriceUpdateMsg("✓ Prices updated with latest market data");
          setTimeout(() => setPriceUpdateMsg(null), 3000);
        }
      } catch (err) {
        console.error("Portfolio fetch error:", err);
        setError("Network error while fetching portfolio.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [memberId, isAlpaca]
  );

  useEffect(() => {
    loadPortfolio(false);
  }, [loadPortfolio]);

  useEffect(() => {
    const interval = isAlpaca ? 30000 : 60000;
    const id = setInterval(() => loadPortfolio(true), interval);
    return () => clearInterval(id);
  }, [loadPortfolio, isAlpaca]);

  // ---- Filtered orders ----
  const filteredOrders = React.useMemo(() => {
    if (!filterField || !filterValue.trim()) return orders;
    const val = filterValue.trim().toLowerCase();
    if (filterField === "symbol")
      return orders.filter((o) => (o.symbol || "").toLowerCase().includes(val));
    if (filterField === "stock_name")
      return orders.filter((o) => (o.stock_name || "").toLowerCase().includes(val));
    return orders;
  }, [orders, filterField, filterValue]);

  // ---- Helpers ----
  const fmt = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  const fmtPL = (val) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return <span style={{ color: "#6b7280" }}>—</span>;
    const color = n >= 0 ? "#22c55e" : "#ef4444";
    const sign = n > 0 ? "+" : "";
    return <span style={{ color, fontWeight: 500 }}>{sign}{fmt(n)}</span>;
  };

  const fmtPct = (val) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return <span style={{ color: "#6b7280" }}>—</span>;
    const color = n >= 0 ? "#22c55e" : "#ef4444";
    const sign = n > 0 ? "+" : "";
    return <span style={{ color, fontWeight: 500 }}>{`${sign}${n.toFixed(2)}%`}</span>;
  };

  const fmtTime = (ts) => {
    if (!ts) return "";
    return ts.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  };

  const handleSymbolClick = (symbol) => {
    if (!symbol) return;
    navigate(`/symbol-chart/${encodeURIComponent(symbol)}`);
  };

  // ── Sell handlers ──
  const openSellModal = (position) => {
    setSellModal(position);
    setSellQty("");
    setSellAll(false);
    setSellOrderType("market");
    setSellLimitPrice("");
    setSellSubmitting(false);
    setSellResult(null);
    setSellError("");
  };

  const closeSellModal = () => {
    setSellModal(null);
    setSellResult(null);
    setSellError("");
  };

  const handleSellSubmit = async () => {
    if (!sellModal) return;

    const qtyToSell = sellAll ? sellModal.total_shares : parseFloat(sellQty);

    if (!sellAll && (!qtyToSell || qtyToSell <= 0)) {
      setSellError("Enter a valid quantity.");
      return;
    }
    if (!sellAll && qtyToSell > sellModal.total_shares) {
      setSellError(`You only hold ${sellModal.total_shares.toLocaleString(undefined, { maximumFractionDigits: 6 })} shares.`);
      return;
    }
    if (sellOrderType === "limit" && (!sellLimitPrice || parseFloat(sellLimitPrice) <= 0)) {
      setSellError("Enter a valid limit price.");
      return;
    }

    setSellSubmitting(true);
    setSellError("");

    try {
      const payload = {
        member_id: memberId,
        symbol: sellModal.symbol,
        sell_all: sellAll,
        order_type: sellOrderType,
        time_in_force: "day",
      };

      if (!sellAll) {
        payload.qty = qtyToSell;
      }
      if (sellOrderType === "limit") {
        payload.limit_price = parseFloat(sellLimitPrice);
      }

      const data = await apiPost("alpaca-sell-order.php", payload);

      if (data.success) {
        setSellResult({
          success: true,
          message: `Sell order ${data.order?.status || "submitted"} for ${sellModal.symbol}`,
          order: data.order,
        });
        // Refresh portfolio after short delay to reflect changes
        setTimeout(() => loadPortfolio(true), 2000);
      } else {
        setSellError(data.error || "Sell order failed.");
      }
    } catch (err) {
      console.error("Sell order error:", err);
      setSellError("Network error submitting sell order.");
    } finally {
      setSellSubmitting(false);
    }
  };

  // Estimated proceeds
  const estimatedProceeds = sellModal
    ? (sellAll ? sellModal.total_shares : (parseFloat(sellQty) || 0)) *
      (sellOrderType === "limit" ? (parseFloat(sellLimitPrice) || 0) : sellModal.current_price)
    : 0;

  // ===========================================================================
  // RENDER
  // ===========================================================================
  return (
    <div className="portfolio-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        My StockLoyal Portfolio
      </h2>

      {/* ---- Timestamp ---- */}
      {lastUpdated && !loading && !error && (
        <div style={{ textAlign: "center", marginTop: "-6px", marginBottom: "18px" }}>
          <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: 0 }}>
            Last updated: <strong>{fmtTime(lastUpdated)}</strong>
          </p>
          <p style={{ color: "#9ca3af", fontSize: "0.75rem", margin: "4px 0 0 0", fontStyle: "italic" }}>
            {isAlpaca
              ? "Real-time market data from Alpaca"
              : "Market prices are delayed by 15 minutes"}
          </p>
        </div>
      )}

      {/* ---- Loading / Error ---- */}
      {loading ? (
        <p>Loading your portfolio…</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : (
        <>
          {/* ==== Account Summary Card (Alpaca only) ==== */}
          {accountInfo && (
            <div
              className="card"
              style={{
                marginBottom: "1.25rem",
                padding: "1.25rem",
                background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
                borderRadius: "12px",
                border: "1px solid #bae6fd",
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "#0369a1" }}>
                Brokerage Account Summary
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Equity</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0c4a6e" }}>{fmt(accountInfo.equity)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Positions Value</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0c4a6e" }}>{fmt(accountInfo.portfolio_value)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Cash Balance</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0c4a6e" }}>{fmt(accountInfo.cash)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Buying Power</div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0c4a6e" }}>{fmt(accountInfo.buying_power)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Today's P&L</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>{fmtPL(accountInfo.day_pl)}</div>
                  <div style={{ fontSize: "0.85rem" }}>{fmtPct(accountInfo.day_pl_pct)}</div>
                </div>
                {totalUnrealizedPL !== 0 && (
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Unrealized P&L</div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>{fmtPL(totalUnrealizedPL)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==== Portfolio Value (non-Alpaca fallback) ==== */}
          {!accountInfo && orders.length > 0 && (
            <div className="portfolio-total" style={{ textAlign: "center", marginBottom: "20px" }}>
              <strong>Total Portfolio Value:</strong>{" "}
              <span style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#007bff" }}>{fmt(portfolioValue)}</span>
            </div>
          )}

          {/* Refresh button */}
          <div style={{ textAlign: "center", marginBottom: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <button type="button" className="btn-secondary" onClick={() => loadPortfolio(true)} disabled={refreshing} style={{ minWidth: "160px" }}>
              {refreshing ? "Updating…" : "🔄 Refresh Prices"}
            </button>
            {priceUpdateMsg && (
              <span style={{ fontSize: "0.85rem", color: "#22c55e", fontWeight: 500 }}>{priceUpdateMsg}</span>
            )}
          </div>

          {/* ==== Filter Bar ==== */}
          {orders.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.9rem", fontWeight: "600", color: "#374151", minWidth: "50px" }}>Filter:</label>
                  <select
                    className="form-input"
                    style={{ minWidth: 200, flex: "0 1 auto" }}
                    value={filterField}
                    onChange={(e) => { setFilterField(e.target.value); setFilterValue(""); }}
                  >
                    <option value="">All Holdings</option>
                    <option value="symbol">Symbol</option>
                    <option value="stock_name">Stock Name</option>
                  </select>
                  {filterField && (
                    <input
                      className="form-input" type="text"
                      placeholder={filterField === "symbol" ? "e.g. AAPL" : "e.g. Apple Inc."}
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                    />
                  )}
                  <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap" }}>
                    Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong> holdings
                  </span>
                </div>
                {(filterField || filterValue) && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <button type="button" className="btn-secondary" onClick={() => { setFilterField(""); setFilterValue(""); }} style={{ fontSize: "0.85rem", minWidth: "120px" }}>Clear Filter</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==== Holdings Table ==== */}
          {filteredOrders.length === 0 ? (
            <p className="portfolio-subtext" style={{ textAlign: "center" }}>
              {orders.length === 0 ? "You have no confirmed holdings yet." : "No holdings match the current filter."}
            </p>
          ) : (
            <div className="basket-table-wrapper">
              <table className="basket-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th style={{ textAlign: "right" }}>Shares</th>
                    <th style={{ textAlign: "right" }}>Avg Cost</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                    <th style={{ textAlign: "right" }}>Market Value</th>
                    <th style={{ textAlign: "right" }}>
                      P&L
                      <br /><small style={{ fontWeight: 400, color: "#666" }}>(Total / Today)</small>
                    </th>
                    {isAlpaca && <th style={{ textAlign: "center" }}>Trade</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o, idx) => (
                    <tr key={idx}>
                      {/* Symbol (clickable for chart) */}
                      <td
                        onClick={() => handleSymbolClick(o.symbol)}
                        style={{ cursor: "pointer" }}
                        title={`View ${o.symbol} chart`}
                      >
                        <div style={{ fontWeight: 600, color: "#2563eb" }}>{o.symbol}</div>
                        {o.stock_name && o.stock_name !== o.symbol && (
                          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{o.stock_name}</div>
                        )}
                      </td>

                      {/* Shares */}
                      <td style={{ textAlign: "right" }}>
                        {o.total_shares?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      </td>

                      {/* Avg Entry Price */}
                      <td style={{ textAlign: "right" }}>{o.avg_entry_price ? fmt(o.avg_entry_price) : "—"}</td>

                      {/* Current Price */}
                      <td style={{ textAlign: "right" }}>{fmt(o.current_price)}</td>

                      {/* Market Value */}
                      <td style={{ textAlign: "right" }}>{fmt(o.current_value)}</td>

                      {/* P&L column */}
                      <td style={{ textAlign: "right" }}>
                        {o.unrealized_pl !== undefined && o.unrealized_pl !== null ? (
                          <div>
                            {fmtPL(o.unrealized_pl)}{" "}
                            <span style={{ fontSize: "0.8rem" }}>({fmtPct(o.unrealized_pl_pct)})</span>
                          </div>
                        ) : (
                          <div style={{ color: "#6b7280" }}>—</div>
                        )}
                        <div style={{ fontSize: "0.8rem", marginTop: "2px" }}>
                          {o.intraday_pl !== undefined && o.intraday_pl !== null ? (
                            <>Today: {fmtPL(o.intraday_pl)} <span>({fmtPct(o.daily_change)})</span></>
                          ) : (
                            <>Today: {fmtPct(o.daily_change)}</>
                          )}
                        </div>
                      </td>

                      {/* Sell button (Alpaca only) */}
                      {isAlpaca && (
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openSellModal(o); }}
                            style={{
                              background: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fca5a5",
                              borderRadius: "6px",
                              padding: "4px 12px",
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { e.target.style.background = "#dc2626"; e.target.style.color = "#fff"; }}
                            onMouseLeave={(e) => { e.target.style.background = "#fef2f2"; e.target.style.color = "#dc2626"; }}
                          >
                            Sell
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>

                {isAlpaca && orders.length > 1 && (
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: "2px solid #d1d5db" }}>
                      <td>TOTAL</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td style={{ textAlign: "right" }}>{fmt(portfolioValue)}</td>
                      <td style={{ textAlign: "right" }}>{fmtPL(totalUnrealizedPL)}</td>
                      {isAlpaca && <td></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}

      {/* ==== SELL MODAL ==== */}
      {sellModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: "16px",
          }}
          onClick={closeSellModal}
        >
          <div
            className="card"
            style={{
              maxWidth: 460, width: "100%",
              border: "2px solid #fca5a5", background: "#fff",
              padding: "1.5rem", position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close X */}
            <button
              onClick={closeSellModal}
              style={{
                position: "absolute", top: 10, right: 14,
                background: "none", border: "none", fontSize: "1.3rem",
                cursor: "pointer", color: "#6b7280",
              }}
            >✕</button>

            <h3 style={{ margin: "0 0 4px 0", color: "#dc2626" }}>
              Sell {sellModal.symbol}
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#6b7280" }}>
              You hold <strong>{sellModal.total_shares.toLocaleString(undefined, { maximumFractionDigits: 6 })}</strong> shares
              @ <strong>{fmt(sellModal.current_price)}</strong> = {fmt(sellModal.current_value)}
            </p>

            {/* ---- Success Result ---- */}
            {sellResult?.success ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#059669", marginBottom: 8 }}>
                  Sell Order Submitted
                </div>
                <div style={{ fontSize: "0.9rem", color: "#374151", marginBottom: 4 }}>
                  <strong>{sellModal.symbol}</strong> — {sellResult.order?.status?.toUpperCase() || "SUBMITTED"}
                </div>
                {sellResult.order?.qty && (
                  <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                    Qty: {sellResult.order.qty} shares · Type: {sellResult.order.type}
                  </div>
                )}
                <button
                  type="button" className="btn-primary"
                  onClick={closeSellModal}
                  style={{ marginTop: 16 }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* ---- Sell All toggle ---- */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={sellAll}
                      onChange={(e) => {
                        setSellAll(e.target.checked);
                        if (e.target.checked) setSellQty("");
                      }}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontWeight: 600 }}>Sell entire position</span>
                  </label>
                </div>

                {/* ---- Quantity ---- */}
                {!sellAll && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 4 }}>
                      Quantity (shares)
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="form-input"
                        type="number"
                        step="0.000001"
                        min="0"
                        max={sellModal.total_shares}
                        value={sellQty}
                        onChange={(e) => setSellQty(e.target.value)}
                        placeholder="0.00"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button" className="btn-secondary"
                        onClick={() => setSellQty(String(sellModal.total_shares))}
                        style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}
                      >
                        Max
                      </button>
                    </div>
                  </div>
                )}

                {/* ---- Order Type ---- */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Order Type</label>
                  <select
                    className="form-input"
                    value={sellOrderType}
                    onChange={(e) => setSellOrderType(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="market">Market Order (sell now at best price)</option>
                    <option value="limit">Limit Order (set minimum price)</option>
                  </select>
                </div>

                {/* ---- Limit Price ---- */}
                {sellOrderType === "limit" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 4 }}>
                      Limit Price (minimum per share)
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={sellLimitPrice}
                      onChange={(e) => setSellLimitPrice(e.target.value)}
                      placeholder={sellModal.current_price?.toFixed(2)}
                      style={{ width: "100%" }}
                    />
                  </div>
                )}

                {/* ---- Estimated proceeds ---- */}
                {estimatedProceeds > 0 && (
                  <div style={{
                    background: "#f9fafb", borderRadius: 8, padding: "10px 14px",
                    marginBottom: 14, border: "1px solid #e5e7eb",
                  }}>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Estimated Proceeds</div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#059669" }}>{fmt(estimatedProceeds)}</div>
                    <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                      {sellOrderType === "market" ? "Based on current market price" : "If limit price is met"}
                    </div>
                  </div>
                )}

                {/* ---- Error ---- */}
                {sellError && (
                  <div style={{
                    background: "#fef2f2", border: "1px solid #fca5a5",
                    borderRadius: 8, padding: "8px 12px", marginBottom: 14,
                    color: "#dc2626", fontSize: "0.85rem", fontWeight: 500,
                  }}>
                    {sellError}
                  </div>
                )}

                {/* ---- Confirm / Cancel buttons ---- */}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn-secondary" onClick={closeSellModal} disabled={sellSubmitting}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSellSubmit}
                    disabled={sellSubmitting}
                    style={{
                      background: sellSubmitting ? "#f87171" : "#dc2626",
                      color: "#fff", border: "none", borderRadius: 8,
                      padding: "10px 24px", fontWeight: 700, fontSize: "0.95rem",
                      cursor: sellSubmitting ? "not-allowed" : "pointer",
                      opacity: sellSubmitting ? 0.7 : 1,
                    }}
                  >
                    {sellSubmitting ? "Submitting…" : sellAll ? `Sell All ${sellModal.symbol}` : `Sell ${sellModal.symbol}`}
                  </button>
                </div>

                {/* ---- Disclosure ---- */}
                <p style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 12, marginBottom: 0 }}>
                  Market orders execute at the next available price. Limit orders execute only at your specified price or better.
                  Fractional shares are supported. All trades are executed by Alpaca Securities LLC.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==== Navigation Buttons ==== */}
      <div
        className="portfolio-actions"
        style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "20px" }}
      >
        <button type="button" className="btn-secondary" onClick={() => navigate("/ledger")}>View Transactions Ledger</button>
        <button type="button" className="btn-secondary" onClick={() => navigate("/transactions")}>View Order History</button>
      </div>
      <div>
        <button type="button" className="btn-primary" onClick={() => navigate("/wallet")}>Back to Wallet</button>
      </div>

      {/* ==== Disclosure ==== */}
      <p className="form-disclosure">
        <strong>Disclosure:</strong> <em>StockLoyal Portfolio</em> displays
        only the securities purchased through the <strong>StockLoyal app</strong>.
        These holdings are maintained directly with your brokerage firm,{" "}
        {brokerUrl ? (
          <strong>
            <a href={brokerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#007bff", textDecoration: "underline" }}>
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
