// src/pages/AlpacaTransactions.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function AlpacaTransactions() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");
  const storedBroker = localStorage.getItem("broker");

  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterSide, setFilterSide] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSymbol, setFilterSymbol] = useState("");
  const [days, setDays] = useState(90);

  const loadTransactions = useCallback(async () => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await apiPost("alpaca-get-transactions.php", {
        member_id: memberId,
        days,
        side: filterSide,
        status: filterStatus,
        symbol: filterSymbol,
      });

      if (!data.success) {
        setError(data.error || "Failed to load transactions.");
        return;
      }

      setOrders(data.orders || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error("Transactions fetch error:", err);
      setError("Network error while fetching transactions.");
    } finally {
      setLoading(false);
    }
  }, [memberId, days, filterSide, filterStatus, filterSymbol]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // ── Helpers ──
  const fmt = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  const fmtDate = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const statusColor = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "filled") return "#059669";
    if (s === "partially_filled") return "#d97706";
    if (s === "canceled" || s === "cancelled" || s === "expired") return "#9ca3af";
    if (s === "new" || s === "accepted" || s === "pending_new") return "#3b82f6";
    if (s === "rejected" || s === "failed") return "#dc2626";
    if (s === "approved") return "#059669";
    if (s === "funded" || s === "placed" || s === "settled") return "#059669";
    return "#6b7280";
  };

  const statusBg = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "filled" || s === "settled") return "#ecfdf5";
    if (s === "partially_filled") return "#fffbeb";
    if (s === "canceled" || s === "cancelled" || s === "expired") return "#f3f4f6";
    if (s === "new" || s === "accepted" || s === "pending_new") return "#eff6ff";
    if (s === "rejected" || s === "failed") return "#fef2f2";
    if (s === "approved" || s === "funded" || s === "placed") return "#ecfdf5";
    return "#f9fafb";
  };

  const sideStyle = (side) => {
    const s = (side || "").toLowerCase();
    if (s === "buy") return { color: "#059669", label: "BUY" };
    if (s === "sell") return { color: "#dc2626", label: "SELL" };
    return { color: "#6b7280", label: side?.toUpperCase() || "—" };
  };

  // ── Unique symbols for filter dropdown ──
  const uniqueSymbols = useMemo(() => {
    const syms = new Set(orders.map((o) => o.symbol).filter(Boolean));
    return [...syms].sort();
  }, [orders]);

  // ── Card style ──
  const cardStyle = {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: "14px 16px",
    marginBottom: 10,
  };

  const labelStyle = {
    fontSize: "0.75rem",
    color: "#9ca3af",
    fontWeight: 500,
    marginBottom: 2,
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================
  return (
    <div style={{ paddingBottom: 120, maxWidth: 600, margin: "0 auto", padding: "0 16px" }}>
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Transaction History (Alpaca)
      </h2>

      {/* ── Summary Cards ── */}
      {summary && !loading && !error && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          marginBottom: 20,
        }}>
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <div style={labelStyle}>Total Orders</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#111827" }}>
              {summary.total_orders}
            </div>
          </div>
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <div style={labelStyle}>Invested</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#059669" }}>
              {fmt(summary.buy_amount)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{summary.filled_buys} fills</div>
          </div>
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <div style={labelStyle}>Sold</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#dc2626" }}>
              {fmt(summary.sell_amount)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{summary.filled_sells} fills</div>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{
        ...cardStyle,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "flex-end",
        marginBottom: 16,
      }}>
        <div style={{ flex: "1 1 80px", minWidth: 80 }}>
          <div style={labelStyle}>Side</div>
          <select
            className="form-input"
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value)}
            style={{ width: "100%", fontSize: "0.85rem", padding: "6px 8px" }}
          >
            <option value="">All</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div style={{ flex: "1 1 100px", minWidth: 100 }}>
          <div style={labelStyle}>Status</div>
          <select
            className="form-input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ width: "100%", fontSize: "0.85rem", padding: "6px 8px" }}
          >
            <option value="">All</option>
            <option value="filled">Filled</option>
            <option value="partially_filled">Partial</option>
            <option value="new">New</option>
            <option value="canceled">Canceled</option>
            <option value="expired">Expired</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div style={{ flex: "1 1 100px", minWidth: 100 }}>
          <div style={labelStyle}>Symbol</div>
          <select
            className="form-input"
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            style={{ width: "100%", fontSize: "0.85rem", padding: "6px 8px" }}
          >
            <option value="">All</option>
            {uniqueSymbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 80px", minWidth: 80 }}>
          <div style={labelStyle}>Period</div>
          <select
            className="form-input"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            style={{ width: "100%", fontSize: "0.85rem", padding: "6px 8px" }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>6 months</option>
            <option value={365}>1 year</option>
          </select>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>Loading transactions...</div>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: 12,
          padding: 16,
          color: "#dc2626",
          fontSize: "0.9rem",
          textAlign: "center",
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* ── Broker Orders ── */}
      {!loading && !error && (
        <>
          {orders.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 600, fontSize: "1rem" }}>No orders found</div>
              <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
                Try expanding the date range or clearing filters.
              </div>
            </div>
          ) : (
            orders.map((o) => {
              const side = sideStyle(o.side);
              return (
                <div key={o.order_id} style={cardStyle}>
                  {/* Row 1: Symbol, Side, Status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        color: side.color,
                        background: side.color + "15",
                        padding: "2px 8px",
                        borderRadius: 6,
                      }}>
                        {side.label}
                      </span>
                      <span
                        onClick={() => navigate(`/symbol-chart/${encodeURIComponent(o.symbol)}`)}
                        style={{ fontWeight: 700, fontSize: "1.05rem", color: "#111827", cursor: "pointer" }}
                      >
                        {o.symbol}
                      </span>
                    </div>
                    <span style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: statusColor(o.status),
                      background: statusBg(o.status),
                      padding: "2px 10px",
                      borderRadius: 20,
                    }}>
                      {(o.status || "").replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>

                  {/* Row 2: Details */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#374151" }}>
                    <div>
                      <span style={{ color: "#6b7280" }}>Qty: </span>
                      <strong>{o.filled_qty > 0 ? o.filled_qty : o.qty}</strong>
                      {o.filled_qty > 0 && o.filled_qty < o.qty && (
                        <span style={{ color: "#d97706", fontSize: "0.75rem" }}> / {o.qty}</span>
                      )}
                    </div>
                    <div>
                      <span style={{ color: "#6b7280" }}>Type: </span>
                      {o.type}
                      {o.limit_price && <span> @ {fmt(o.limit_price)}</span>}
                    </div>
                  </div>

                  {/* Row 3: Price & Amount (if filled) */}
                  {o.filled_avg_price > 0 && (
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.85rem",
                      marginTop: 6,
                      color: "#374151",
                    }}>
                      <div>
                        <span style={{ color: "#6b7280" }}>Avg Price: </span>
                        <strong>{fmt(o.filled_avg_price)}</strong>
                      </div>
                      <div>
                        <span style={{ color: "#6b7280" }}>Total: </span>
                        <strong style={{ color: o.side === "sell" ? "#dc2626" : "#059669" }}>
                          {fmt(o.filled_amount)}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Row 4: Date */}
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 6 }}>
                    {o.filled_at
                      ? `Filled: ${fmtDate(o.filled_at)}`
                      : o.canceled_at
                      ? `Canceled: ${fmtDate(o.canceled_at)}`
                      : `Submitted: ${fmtDate(o.submitted_at || o.created_at)}`}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* ── Back button ── */}
      <div style={{ textAlign: "center", marginTop: 20, paddingBottom: 20 }}>
        <button
          className="btn-primary"
          onClick={() => navigate("/portfolio")}
          style={{ width: "90%", maxWidth: 320 }}
        >
          Back to Portfolio
        </button>
      </div>
    </div>
  );
}
