// src/pages/Transactions.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { LineageLink } from "../components/LineagePopup";

export default function Transactions() {
  const navigate = useNavigate();
  const location = useLocation();
  const memberId = localStorage.getItem("memberId");
  const broker = localStorage.getItem("broker");

  const [orders, setOrders] = useState([]);
  const [memberTimezone, setMemberTimezone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState(
    location.state?.filterStatus ? "status" : ""
  );
  const [filterValue, setFilterValue] = useState(
    location.state?.filterStatus || ""
  );

  // ✅ StockPicker-style slider state (NO portal)
  const [isTxOpen, setIsTxOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  // ── View mode: "orders" (individual) or "baskets" (rollup) ──
  const [viewMode, setViewMode] = useState("baskets");
  const [expandedBaskets, setExpandedBaskets] = useState(new Set());
  const [expandedMonths, setExpandedMonths] = useState(new Set());

  // ── Infinite scroll ──
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

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
        // Fetch orders + wallet (for timezone) in parallel
        const [ordersRes, walletRes] = await Promise.all([
          apiPost("get_order_history.php", { member_id: memberId }),
          apiPost("get-wallet.php", { member_id: memberId }),
        ]);

        if (!ordersRes?.success) {
          setError(ordersRes?.error || "Failed to load Order transactions.");
        } else {
          setOrders(ordersRes.orders || []);
        }

        const tz =
          walletRes?.success &&
          walletRes?.wallet?.member_timezone &&
          String(walletRes.wallet.member_timezone).trim() !== ""
            ? walletRes.wallet.member_timezone
            : detectedTz;

        setMemberTimezone(tz);
      } catch (err) {
        console.error("Order transactions fetch error:", err);
        setError("Network error while fetching Order transactions.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, detectedTz]);

  // ── Auto-default filter to "pending" when pending orders exist ──
  useEffect(() => {
    // Skip if user already navigated with an explicit filter or manually changed it
    if (location.state?.filterStatus) return;
    if (loading || orders.length === 0) return;

    const hasPending = orders.some((o) => {
      const s = (o.status || "").toLowerCase();
      return s === "pending" || s === "queued";
    });

    if (hasPending && !filterField) {
      setFilterField("status");
      setFilterValue("pending");
    }
  }, [orders, loading]);

  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  // Filter orders based on selected filter
  const filteredOrders = useMemo(() => {
    if (!filterField || !filterValue.trim()) {
      return orders; // No filter applied
    }

    const val = filterValue.trim().toLowerCase();

    switch (filterField) {
      case "symbol":
        return orders.filter((o) => 
          (o.symbol || "").toLowerCase().includes(val)
        );
      
      case "date": {
        // Filter by date (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(filterValue)) {
          return orders;
        }
        return orders.filter((o) => {
          if (!o.placed_at) return false;
          const orderDate = o.placed_at.split(" ")[0]; // Extract YYYY-MM-DD
          return orderDate === filterValue;
        });
      }
      
      case "status":
        return orders.filter((o) => 
          (o.status || "").toLowerCase().includes(val)
        );
      
      case "order_type":
        return orders.filter((o) => 
          (o.order_type || "").toLowerCase().includes(val)
        );
      
      default:
        return orders;
    }
  }, [orders, filterField, filterValue]);

  // ── Basket rollup: group filtered orders by basket_id ──
  const basketRollup = useMemo(() => {
    const map = new Map();
    for (const o of filteredOrders) {
      const bid = o.basket_id || "unknown";
      if (!map.has(bid)) {
        map.set(bid, {
          basket_id: bid,
          orders: [],
          totalAmount: 0,
          totalPoints: 0,
          totalShares: 0,
          symbols: [],
          broker: o.broker || "-",
          merchant_id: o.merchant_id || "-",
          placed_at: o.placed_at,
          statuses: new Set(),
        });
      }
      const b = map.get(bid);
      b.orders.push(o);
      b.totalAmount += parseFloat(o.amount) || 0;
      b.totalPoints += parseInt(o.points_used) || 0;
      b.totalShares += parseFloat(o.shares) || 0;
      b.symbols.push(o.symbol);
      if (o.status) b.statuses.add(o.status.toLowerCase());
      // Use earliest placed_at
      if (o.placed_at && (!b.placed_at || o.placed_at < b.placed_at)) {
        b.placed_at = o.placed_at;
      }
    }
    // Convert to array, sorted newest first
    return Array.from(map.values()).sort((a, b) => {
      if (!a.placed_at) return 1;
      if (!b.placed_at) return -1;
      return b.placed_at.localeCompare(a.placed_at);
    });
  }, [filteredOrders]);

  // Reset visible count when filter or view mode changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterField, filterValue, viewMode]);

  // ── Visible slices for infinite scroll ──
  const visibleBaskets = useMemo(() => basketRollup.slice(0, visibleCount), [basketRollup, visibleCount]);
  const visibleOrders  = useMemo(() => filteredOrders.slice(0, visibleCount), [filteredOrders, visibleCount]);
  const totalItems     = viewMode === "baskets" ? basketRollup.length : filteredOrders.length;
  const shownItems     = viewMode === "baskets" ? visibleBaskets.length : visibleOrders.length;
  const hasMore        = visibleCount < totalItems;

  // ── IntersectionObserver for infinite scroll ──
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  // ── Group baskets by month ──
  const getMonthKey = (dateStr) => {
    if (!dateStr) return "Unknown";
    let iso = String(dateStr).trim();
    if (!/Z$|[+-]\d{2}/.test(iso)) iso = iso.replace(" ", "T") + "Z";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Unknown";
    try {
      const tz = memberTimezone || detectedTz;
      const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: tz }).formatToParts(d);
      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      return `${y}-${m}`;
    } catch {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
  };

  const getMonthLabel = (key) => {
    if (key === "Unknown") return "Unknown Date";
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  };

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    try {
      const tz = memberTimezone || detectedTz;
      const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: tz }).formatToParts(now);
      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      return `${y}-${m}`;
    } catch {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
  }, [memberTimezone, detectedTz]);

  const monthlyBaskets = useMemo(() => {
    const groups = new Map();
    for (const b of visibleBaskets) {
      const key = getMonthKey(b.placed_at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
    // Sort month keys descending (newest first)
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visibleBaskets, memberTimezone, detectedTz]);

  // Initialize expanded months — current month open by default
  useEffect(() => {
    if (monthlyBaskets.length > 0 && expandedMonths.size === 0) {
      setExpandedMonths(new Set([currentMonthKey]));
    }
  }, [monthlyBaskets]);

  const toggleMonth = (key) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleBasketExpand = (basketId) => {
    setExpandedBaskets((prev) => {
      const next = new Set(prev);
      if (next.has(basketId)) next.delete(basketId);
      else next.add(basketId);
      return next;
    });
  };

  // Derive a single status label for a basket
  const getBasketStatus = (statuses) => {
    const s = Array.from(statuses);
    if (s.length === 1) return s[0];
    if (s.includes("failed")) return "partial";
    if (s.includes("pending") || s.includes("queued")) return "pending";
    if (s.every((x) => x === "executed" || x === "confirmed")) return "executed";
    return "mixed";
  };

  // Convert UTC/MySQL-ish timestamps to member's local time string
  const toLocalZonedString = (ts) => {
    if (!ts) return "-";

    let iso = String(ts).trim();
    const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
    if (!hasZone) iso = iso.replace(" ", "T") + "Z";

    const d = new Date(iso);
    if (isNaN(d.getTime())) return ts;

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

  const openTx = (order) => {
    setSelectedTx(order);
    setIsTxOpen(true);
  };

  const closeTx = () => {
    setIsTxOpen(false);
    setTimeout(() => setSelectedTx(null), 180);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      {/* ── Scrollable content area ── */}
      <div className="transactions-container" style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
      <h2 className="page-title" style={{ textAlign: "center" }}>
        My Baskets and Buy Order Tracker
      </h2>

      {/* --- Page Notice --- */}
      <p className="form-disclosure mt-4">
        <strong>Note:</strong> This page displays trade orders submitted to and executed by your broker {broker}. To view points and cash trasnactiosn click "View Trasnactions Ledger".
      </p>

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
                <option value="">All Orders</option>
                <option value="symbol">Symbol</option>
                <option value="date">Date</option>
                <option value="status">Status</option>
                <option value="order_type">Order Type</option>
              </select>

              {filterField && filterField === "status" && (
                <select
                  className="form-input"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="placed">Placed</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="executed">Executed</option>
                  <option value="sell">Sell</option>
                  <option value="sold">Sold</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              )}

              {filterField && filterField === "order_type" && (
                <select
                  className="form-input"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                >
                  <option value="">All Order Types</option>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                  <option value="sweep">Sweep</option>
                  <option value="market">Market</option>
                  <option value="gtc">GTC</option>
                </select>
              )}

              {filterField && filterField !== "status" && filterField !== "order_type" && (
                <input
                  className="form-input"
                  type={filterField === "date" ? "date" : "text"}
                  placeholder={
                    filterField === "symbol"
                      ? "e.g. AAPL"
                      : filterField === "date"
                      ? "Select date"
                      : ""
                  }
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                />
              )}

              <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap" }}>
                Showing <strong>{shownItems}</strong> of <strong>{totalItems}</strong> {viewMode === "baskets" ? "baskets" : "orders"}
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

      {/* ── View mode toggle ── */}
      {!loading && !error && orders.length > 0 && (
        <div style={{ display: "flex", gap: 0, marginBottom: "1rem", borderRadius: 8, overflow: "hidden", border: "1px solid #d1d5db" }}>
          <button
            type="button"
            onClick={() => setViewMode("orders")}
            style={{
              flex: 1,
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: viewMode === "orders" ? "#2563eb" : "#f9fafb",
              color: viewMode === "orders" ? "#fff" : "#374151",
            }}
          >
            Individual Orders ({filteredOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("baskets")}
            style={{
              flex: 1,
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              borderLeft: "1px solid #d1d5db",
              cursor: "pointer",
              background: viewMode === "baskets" ? "#2563eb" : "#f9fafb",
              color: viewMode === "baskets" ? "#fff" : "#374151",
            }}
          >
            Basket Summary ({basketRollup.length})
          </button>
        </div>
      )}

      {loading ? (
        <p>Loading your Order transactions...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : filteredOrders.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          {orders.length === 0 ? "No Order transactions found." : "No orders match the current filter."}
        </p>
      ) : viewMode === "baskets" ? (
        /* ── BASKET ROLLUP VIEW — grouped by month ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {monthlyBaskets.map(([monthKey, baskets]) => {
            const isMonthOpen = expandedMonths.has(monthKey);
            const isCurrent = monthKey === currentMonthKey;

            return (
              <div key={monthKey}>
                {/* Month banner */}
                <div
                  onClick={() => toggleMonth(monthKey)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: isCurrent ? "#eff6ff" : "#f8fafc",
                    border: `1px solid ${isCurrent ? "#bfdbfe" : "#e2e8f0"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#1e293b" }}>
                    {getMonthLabel(monthKey)}{isCurrent ? " (Current)" : ""}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: "#64748b" }}>
                    {baskets.length} basket{baskets.length !== 1 ? "s" : ""}
                    <span style={{ fontSize: "1.1rem" }}>{isMonthOpen ? "▲" : "▼"}</span>
                  </span>
                </div>

                {/* Baskets in this month */}
                {isMonthOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                    {baskets.map((b) => {
                      const isExpanded = expandedBaskets.has(b.basket_id);
                      const status = getBasketStatus(b.statuses);

                      return (
                        <div key={b.basket_id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Basket header — clickable to expand */}
                <div
                  onClick={() => toggleBasketExpand(b.basket_id)}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    background: isExpanded ? "#f0f9ff" : "#fff",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Top row: basket ID + status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>
                        <LineageLink id={b.basket_id} type="basket" memberId={memberId}>{b.basket_id}</LineageLink>
                      </span>
                      <span style={{
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        background: "#f3f4f6",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}>
                        {b.orders.length} order{b.orders.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span style={getStatusPillStyle(status)}>{status}</span>
                  </div>

                  {/* Summary row */}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.85rem", color: "#374151" }}>
                    <span>Total: <strong>{formatDollars(b.totalAmount)}</strong></span>
                    <span>Points: <strong>{Number(b.totalPoints).toLocaleString()}</strong></span>
                    <span>Shares: <strong>{Number(b.totalShares.toFixed(6))}</strong></span>
                    <span>Broker: <strong>{b.broker}</strong></span>
                  </div>

                  {/* Date row */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#6b7280" }}>
                    <span>{b.placed_at ? toLocalZonedString(b.placed_at) : "-"}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Bottom row: symbols */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {b.symbols.map((sym, i) => (
                      <span key={i} style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "#1e40af",
                        background: "#eff6ff",
                        borderRadius: 4,
                        padding: "2px 8px",
                      }}>
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expanded: individual orders table */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #e5e7eb", overflowX: "auto" }}>
                    <table
                      className="basket-table"
                      style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", fontSize: "0.85rem" }}
                    >
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Shares</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                          <th style={{ textAlign: "right" }}>Price/Share</th>
                          <th style={{ textAlign: "center" }}>Status</th>
                          <th>Placed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.orders.map((order, idx) => {
                          const shares = parseFloat(order.shares) || 0;
                          const amount = parseFloat(order.amount) || 0;
                          const pps = shares > 0 ? amount / shares : 0;
                          return (
                            <tr
                              key={idx}
                              onClick={() => openTx(order)}
                              style={{ cursor: "pointer" }}
                              title="Click to view details"
                            >
                              <td>{order.symbol}</td>
                              <td>{order.shares}</td>
                              <td style={{ textAlign: "right" }}>{formatDollars(amount)}</td>
                              <td style={{ textAlign: "right", color: "#6b7280" }}>
                                {pps > 0 ? formatDollars(pps) : "-"}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span style={getStatusPillStyle(order.status)}>
                                  {order.status || "-"}
                                </span>
                              </td>
                              <td style={{ fontSize: "0.8rem" }}>
                                {order.placed_at ? toLocalZonedString(order.placed_at) : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="basket-table-wrapper" style={{ overflowX: "auto" }}>
          <table
            className="basket-table"
            style={{
              width: "100%",
              minWidth: "760px",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Shares</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>Price/Share</th>
                <th style={{ width: "140px" }}>Order / Status</th>
                <th>Placed (Local)</th>
              </tr>
            </thead>

            <tbody>
              {visibleOrders.map((order, idx) => {
                // Calculate price per share
                const shares = parseFloat(order.shares) || 0;
                const amount = parseFloat(order.amount) || 0;
                const pricePerShare = shares > 0 ? amount / shares : 0;

                return (
                  <tr
                    key={idx}
                    onClick={() => openTx(order)}
                    style={{ cursor: "pointer" }}
                    title="Click to view details"
                  >
                    <td>{order.symbol}</td>
                    <td>{order.shares}</td>
                    <td style={{ textAlign: "right" }}>
                      {order.amount ? formatDollars(order.amount) : "-"}
                    </td>
                    <td style={{ textAlign: "right", fontSize: "0.9rem", color: "#6b7280" }}>
                      {pricePerShare > 0 ? formatDollars(pricePerShare) : "-"}
                    </td>

                    <td style={{ textAlign: "center", lineHeight: "1.3" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span style={{ fontWeight: "600", color: "#1e3a8a", fontSize: "0.9rem" }}>
                          {order.order_type ? `buy ${order.order_type}` : "buy"}
                        </span>
                        <span style={getStatusPillStyle(order.status)}>
                          {order.status || "-"}
                        </span>
                      </div>
                    </td>

                    <td style={{ fontSize: "0.9rem" }}>
                      {order.placed_at ? toLocalZonedString(order.placed_at) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} style={{ textAlign: "center", padding: "16px 0", color: "#9ca3af", fontSize: "0.85rem" }}>
          Loading more…
        </div>
      )}
      {!hasMore && totalItems > PAGE_SIZE && (
        <div style={{ textAlign: "center", padding: "12px 0", color: "#9ca3af", fontSize: "0.8rem" }}>
          All {totalItems} {viewMode === "baskets" ? "baskets" : "orders"} loaded
        </div>
      )}

      {/* ✅ StockPicker-style slider (rendered INSIDE app; no portal) */}
      {isTxOpen && selectedTx && (
        <div className="stocklist-overlay" onClick={closeTx}>
          <div className="stocklist-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="stocklist-sheet-header">
              <div className="stocklist-sheet-handle" />
              <div className="stocklist-sheet-title-row">
                <h2 className="stocklist-heading">Order Transaction Details</h2>
                <button type="button" className="stocklist-close-btn" onClick={closeTx}>
                  ✕
                </button>
              </div>
            </div>

            <div className="stocklist-sheet-content">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* ORDER SECTION */}
                <Section title="Order">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailField label="Order ID">
                      {selectedTx.order_id
                        ? <LineageLink id={String(selectedTx.order_id)} type="order" memberId={memberId}>{selectedTx.order_id}</LineageLink>
                        : "-"}
                    </DetailField>
                    <DetailField label="Basket ID">
                      {selectedTx.basket_id
                        ? <LineageLink id={selectedTx.basket_id} type="basket" memberId={memberId}>{selectedTx.basket_id}</LineageLink>
                        : "-"}
                    </DetailField>
                    <DetailField label="Member ID">{selectedTx.member_id ?? "-"}</DetailField>
                    <DetailField label="Merchant ID">{selectedTx.merchant_id ?? "-"}</DetailField>

                    <DetailField label="Symbol">{selectedTx.symbol ?? "-"}</DetailField>
                    <DetailField label="Order Type">
                      {(selectedTx.order_type || "-").toUpperCase()}
                    </DetailField>

                    <DetailField label="Status">
                      <span style={getStatusPillStyle(selectedTx.status)}>
                        {selectedTx.status || "-"}
                      </span>
                    </DetailField>

                    <DetailField label="Broker">{selectedTx.broker ?? "-"}</DetailField>
                  </div>

                  <DetailField label="Placed (Local)">
                    {selectedTx.placed_at ? toLocalZonedString(selectedTx.placed_at) : "-"}
                  </DetailField>
                </Section>

                {/* AMOUNTS SECTION */}
                <Section title="Order Amounts">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailField label="Shares">{selectedTx.shares ?? "-"}</DetailField>
                    <DetailField label="Order Amount">
                      {selectedTx.amount ? formatDollars(selectedTx.amount) : "-"}
                    </DetailField>
                    <DetailField label="Points Used">
                      {selectedTx.points_used ?? "-"}
                    </DetailField>
                  </div>
                </Section>

                {/* EXECUTION SECTION */}
                <Section title="Execution">
                  <DetailField label="Executed At">
                    {selectedTx.executed_at ? toLocalZonedString(selectedTx.executed_at) : "-"}
                  </DetailField>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailField label="Exec. Price">
                      {selectedTx.executed_price ?? "-"}
                    </DetailField>
                    <DetailField label="Exec. Shares">
                      {selectedTx.executed_shares ?? "-"}
                    </DetailField>
                    <DetailField label="Exec. Amount">
                      {selectedTx.executed_amount
                        ? formatDollars(selectedTx.executed_amount)
                        : "-"}
                    </DetailField>
                  </div>
                </Section>

                {/* PAYMENT SECTION */}
                <Section title="Payment / Settlement">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailField label="Paid?">
                      <span style={getPaidPillStyle(selectedTx.paid_flag)}>
                        {selectedTx.paid_flag ? "Yes" : "No"}
                      </span>
                    </DetailField>
                    <DetailField label="Paid Batch ID">
                      {selectedTx.paid_batch_id ?? "-"}
                    </DetailField>
                  </div>

                  <DetailField label="Paid At">
                    {selectedTx.paid_at ? toLocalZonedString(selectedTx.paid_at) : "-"}
                  </DetailField>
                </Section>

                {/* META SECTION */}
                <Section title="Meta">
                  <DetailField label="Member Timezone">
                    {selectedTx.member_timezone ?? memberTimezone ?? detectedTz}
                  </DetailField>
                </Section>
              </div>
            </div>

            <div className="stocklist-sheet-footer">
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "100%" }}
                onClick={closeTx}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Action Buttons (always visible at bottom) --- */}
      </div>{/* ── end scrollable content ── */}

      <div
        className="transactions-actions"
        style={{
          flexShrink: 0,
          background: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
          paddingTop: 12,
          paddingBottom: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            gap: "10px",
            width: "90%",
            maxWidth: "480px",
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/portfolio")}
            style={{ flex: 1 }}
          >
            View StockLoyal Portfolio
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/ledger")}
            style={{ flex: 1 }}
          >
            View Transactions Ledger
          </button>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/wallet")}
          style={{ width: "90%", maxWidth: "320px" }}
        >
          Back to Wallet
        </button>
      </div>
    </div>
  );
}

/**
 * Small, stacked label/value field for the detail overlay
 */
function DetailField({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#6b7280",
        }}
      >
        {label}
      </span>
      <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#111827" }}>{children}</span>
    </div>
  );
}

/**
 * Section wrapper to group related fields
 */
function Section({ title, children }) {
  return (
    <section
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "#6b7280",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

/**
 * Status pill styling for table + overlay
 */
function getStatusPillStyle(statusRaw) {
  const status = (statusRaw || "").toString().toLowerCase();

  let bg = "#e5e7eb";
  let color = "#374151";

  if (status === "executed" || status === "confirmed" || status === "placed") {
    bg = "#dcfce7";
    color = "#166534";
  } else if (status === "failed" || status === "cancelled") {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (status === "sell") {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (status === "sold") {
    bg = "#dbeafe";
    color = "#1e40af";
  } else if (status === "pending") {
    bg = "#fef9c3";
    color = "#854d0e";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: bg,
    color,
    textTransform: "capitalize",
  };
}

/**
 * Paid flag pill styling
 */
function getPaidPillStyle(paidFlag) {
  const isPaid = !!paidFlag;
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: isPaid ? "#dcfce7" : "#fee2e2",
    color: isPaid ? "#166534" : "#991b1b",
  };
}
