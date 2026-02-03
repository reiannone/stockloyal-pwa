// src/pages/Transactions.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function Transactions() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [orders, setOrders] = useState([]);
  const [memberTimezone, setMemberTimezone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState(""); // "" = all | symbol | date | status
  const [filterValue, setFilterValue] = useState("");

  // ✅ StockPicker-style slider state (NO portal)
  const [isTxOpen, setIsTxOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

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
    <div className="transactions-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Buy Order Transaction History
      </h2>

      <p className="subtext" style={{ textAlign: "center", marginTop: -6, marginBottom: 12 }}>
        Showing times in <strong>{memberTimezone || detectedTz}</strong>
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

              {filterField && (
                <input
                  className="form-input"
                  type={filterField === "date" ? "date" : "text"}
                  placeholder={
                    filterField === "symbol"
                      ? "e.g. AAPL"
                      : filterField === "date"
                      ? "Select date"
                      : filterField === "status"
                      ? "e.g. executed"
                      : filterField === "order_type"
                      ? "e.g. market, limit"
                      : ""
                  }
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                />
              )}

              <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap" }}>
                Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong> orders
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

      {loading ? (
        <p>Loading your Order transactions...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : filteredOrders.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          {orders.length === 0 ? "No Order transactions found." : "No orders match the current filter."}
        </p>
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
              {filteredOrders.map((order, idx) => {
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
                          {order.order_type ? `bought ${order.order_type}` : "bought"}
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
                    <DetailField label="Order ID">{selectedTx.order_id ?? "-"}</DetailField>
                    <DetailField label="Basket ID">{selectedTx.basket_id ?? "-"}</DetailField>
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

      {/* --- Centered Action Buttons --- */}
      <div
        className="transactions-actions"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          marginTop: "20px",
        }}
      >
        {/* Row with the two secondary buttons: Portfolio (left) + Ledger (right) */}
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

        {/* Primary button stays centered below */}
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
