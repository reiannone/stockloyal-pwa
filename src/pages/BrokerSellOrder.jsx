// src/pages/admin/BrokerSellOrder.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import ConfirmModal from "../components/ConfirmModal";

export default function BrokerSellOrder() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [showConfirmSell, setShowConfirmSell] = useState(false);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");

  // ── Detail slider state ────────────────────────────────────────────────────
  const [isTxOpen, setIsTxOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  // Browser-detected timezone fallback
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  // ── Load orders eligible for sell (executed, confirmed, settled statuses) ──
  const fetchOrders = async () => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiPost("get_sell_eligible_orders.php", {});
      if (!res?.success) {
        setError(res?.error || "Failed to load orders.");
      } else {
        setOrders(res.orders || []);
      }
    } catch (err) {
      console.error("Fetch sell-eligible orders error:", err);
      setError("Network error while fetching orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

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
        timeZone: detectedTz,
        timeZoneName: "short",
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  // ── Filter logic ───────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    if (!filterField || !filterValue.trim()) return orders;
    const val = filterValue.trim().toLowerCase();
    switch (filterField) {
      case "symbol":
        return orders.filter((o) => (o.symbol || "").toLowerCase().includes(val));
      case "member_id":
        return orders.filter((o) => (o.member_id || "").toLowerCase().includes(val));
      case "broker":
        return orders.filter((o) => (o.broker || "").toLowerCase().includes(val));
      case "status":
        return orders.filter((o) => (o.status || "").toLowerCase().includes(val));
      case "date": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(filterValue)) return orders;
        return orders.filter((o) => {
          if (!o.placed_at) return false;
          return o.placed_at.split(" ")[0] === filterValue;
        });
      }
      default:
        return orders;
    }
  }, [orders, filterField, filterValue]);

  // ── Checkbox handling (sold orders are not selectable) ──────────────────────
  const selectableOrders = useMemo(
    () => filteredOrders.filter((o) => o.status !== "sold"),
    [filteredOrders]
  );

  const toggleSelect = (orderId) => {
    const order = filteredOrders.find((o) => o.order_id === orderId);
    if (order?.status === "sold") return; // sold = display-only
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectableOrders.length === 0) return;
    if (selectedIds.size === selectableOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableOrders.map((o) => o.order_id)));
    }
  };

  // ── Derive what the selected orders will do ─────────────────────────────────
  const selectedSettled = useMemo(
    () => filteredOrders.filter((o) => selectedIds.has(o.order_id) && o.status === "settled"),
    [filteredOrders, selectedIds]
  );
  const selectedSell = useMemo(
    () => filteredOrders.filter((o) => selectedIds.has(o.order_id) && o.status === "sell"),
    [filteredOrders, selectedIds]
  );

  // ── Toggle selected orders: settled↔sell ───────────────────────────────────
  const handleMarkSell = () => {
    if (selectedIds.size === 0) return;
    setShowConfirmSell(true);
  };

  const confirmMarkSell = async () => {
    setShowConfirmSell(false);

    setProcessing(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await apiPost("toggle_sell_status.php", {
        to_sell: selectedSettled.map((o) => o.order_id),
        to_settled: selectedSell.map((o) => o.order_id),
      });

      if (!res?.success) {
        setError(res?.error || "Failed to toggle order statuses.");
      } else {
        const parts = [];
        if (res.marked_sell > 0)
          parts.push(`${res.marked_sell} → sell`);
        if (res.marked_settled > 0)
          parts.push(`${res.marked_settled} → settled`);
        setSuccessMsg(
          `Successfully toggled ${parts.join(", ")}.`
        );
        setSelectedIds(new Set());
        await fetchOrders();
      }
    } catch (err) {
      console.error("Toggle sell error:", err);
      setError("Network error while toggling order statuses.");
    } finally {
      setProcessing(false);
    }
  };

  // ── Detail slider ──────────────────────────────────────────────────────────
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
        Broker Sell Order
      </h2>

      {/* --- Page Notice --- */}
      <p className="form-disclosure mt-4">
        <strong>Admin Tool:</strong> Select <strong>settled</strong> orders to
        mark as <strong>"sell"</strong>, or select <strong>sell</strong> orders
        to revert back to <strong>"settled"</strong>. Orders already marked
        <strong> "sold"</strong> are display-only. The order_type will remain
        unchanged. Times are shown in <strong>{detectedTz}</strong>.
      </p>

      {/* ── Success / Error messages ── */}
      {successMsg && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "1rem",
            borderRadius: 8,
            background: "#dcfce7",
            color: "#166534",
            border: "1px solid #bbf7d0",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          ✅ {successMsg}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "1rem",
            borderRadius: 8,
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* ── Filter bar ── */}
      {!loading && orders.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
                <option value="member_id">Member ID</option>
                <option value="broker">Broker</option>
                <option value="status">Status</option>
                <option value="date">Date</option>
              </select>

              {filterField === "status" && (
                <select
                  className="form-input"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                >
                  <option value="">All Statuses</option>
                  <option value="settled">Settled</option>
                  <option value="sell">Sell</option>
                  <option value="sold">Sold</option>
                </select>
              )}

              {filterField && filterField !== "status" && (
                <input
                  className="form-input"
                  type={filterField === "date" ? "date" : "text"}
                  placeholder={
                    filterField === "symbol"
                      ? "e.g. AAPL"
                      : filterField === "member_id"
                      ? "e.g. MEM-001"
                      : filterField === "broker"
                      ? "e.g. Robinhood"
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

      {/* ── Action bar: Mark as Sell button ── */}
      {!loading && orders.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
            padding: "12px 16px",
            background: selectedIds.size > 0 ? "#eff6ff" : "#f9fafb",
            border: selectedIds.size > 0 ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
            borderRadius: 8,
            transition: "all 0.2s",
          }}
        >
          <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
            {selectedIds.size > 0
              ? (() => {
                  const parts = [];
                  if (selectedSettled.length > 0) parts.push(`${selectedSettled.length} settled → sell`);
                  if (selectedSell.length > 0) parts.push(`${selectedSell.length} sell → settled`);
                  return parts.join(" · ");
                })()
              : "Select settled or sell orders to toggle status"}
          </span>

          <button
            type="button"
            className="btn-primary"
            disabled={selectedIds.size === 0 || processing}
            onClick={handleMarkSell}
            style={{
              minWidth: 180,
              opacity: selectedIds.size === 0 || processing ? 0.5 : 1,
              cursor: selectedIds.size === 0 || processing ? "not-allowed" : "pointer",
            }}
          >
            {processing ? "Processing..." : `Toggle Status (${selectedIds.size})`}
          </button>
        </div>
      )}

      {/* ── Orders table ── */}
      {loading ? (
        <p>Loading orders...</p>
      ) : orders.length === 0 && !error ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          No orders eligible for sell simulation found.
        </p>
      ) : filteredOrders.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          No orders match the current filter.
        </p>
      ) : (
        <div className="basket-table-wrapper" style={{ overflowX: "auto" }}>
          <table
            className="basket-table"
            style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={
                      selectableOrders.length > 0 &&
                      selectedIds.size === selectableOrders.length
                    }
                    onChange={toggleSelectAll}
                    title="Select all (excludes sold)"
                    disabled={selectableOrders.length === 0}
                    style={{
                      cursor: selectableOrders.length > 0 ? "pointer" : "not-allowed",
                      width: 16,
                      height: 16,
                      opacity: selectableOrders.length > 0 ? 1 : 0.4,
                    }}
                  />
                </th>
                <th>Order ID</th>
                <th>Member</th>
                <th>Symbol</th>
                <th>Shares</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "center" }}>Order Type</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th>Broker</th>
                <th>Placed</th>
              </tr>
            </thead>

            <tbody>
              {filteredOrders.map((order) => {
                const isChecked = selectedIds.has(order.order_id);
                const isSold = order.status === "sold";
                return (
                  <tr
                    key={order.order_id}
                    style={{
                      background: isSold
                        ? "#f9fafb"
                        : isChecked
                        ? "#eff6ff"
                        : "transparent",
                      opacity: isSold ? 0.7 : 1,
                      transition: "background 0.15s",
                    }}
                  >
                    <td
                      style={{ textAlign: "center" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isSold}
                        onChange={() => toggleSelect(order.order_id)}
                        style={{
                          cursor: isSold ? "not-allowed" : "pointer",
                          width: 16,
                          height: 16,
                          opacity: isSold ? 0.35 : 1,
                        }}
                      />
                    </td>
                    <td
                      style={{ cursor: "pointer", color: "#2563eb", fontWeight: 600 }}
                      onClick={() => openTx(order)}
                      title="Click to view details"
                    >
                      {order.order_id}
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>{order.member_id}</td>
                    <td style={{ fontWeight: 600 }}>{order.symbol}</td>
                    <td>{order.shares}</td>
                    <td style={{ textAlign: "right" }}>
                      {order.amount ? formatDollars(order.amount) : "-"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          fontWeight: 600,
                          color: "#1e3a8a",
                          fontSize: "0.85rem",
                          textTransform: "uppercase",
                        }}
                      >
                        {order.order_type || "-"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={getStatusPillStyle(order.status)}>
                        {order.status || "-"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>{order.broker || "-"}</td>
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

      {/* ── Detail Slider ── */}
      {isTxOpen && selectedTx && (
        <div className="stocklist-overlay" onClick={closeTx}>
          <div className="stocklist-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="stocklist-sheet-header">
              <div className="stocklist-sheet-handle" />
              <div className="stocklist-sheet-title-row">
                <h2 className="stocklist-heading">Order Details</h2>
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
                    {selectedTx.member_timezone ?? detectedTz}
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

      {/* ── Confirm Sell Modal ── */}
      <ConfirmModal
        isOpen={showConfirmSell}
        title="Toggle Sell Status"
        message={
          (() => {
            const parts = [];
            if (selectedSettled.length > 0)
              parts.push(`${selectedSettled.length} order${selectedSettled.length !== 1 ? "s" : ""} from "settled" → "sell"`);
            if (selectedSell.length > 0)
              parts.push(`${selectedSell.length} order${selectedSell.length !== 1 ? "s" : ""} from "sell" → "settled"`);
            return `Are you sure? This will update:\n\n${parts.join("\n")}`;
          })()
        }
        confirmLabel="Confirm Toggle"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmMarkSell}
        onCancel={() => setShowConfirmSell(false)}
      />

      {/* ── Bottom navigation ── */}
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
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/admin")}
          style={{ width: "90%", maxWidth: "320px" }}
        >
          Back to Admin Dashboard
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
 * Status pill styling — includes sell/sold states
 */
function getStatusPillStyle(statusRaw) {
  const status = (statusRaw || "").toString().toLowerCase();

  let bg = "#e5e7eb";
  let color = "#374151";

  if (status === "executed" || status === "confirmed" || status === "placed") {
    bg = "#dcfce7";
    color = "#166534";
  } else if (status === "sold") {
    bg = "#dbeafe";
    color = "#1e40af";
  } else if (status === "sell") {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (status === "failed" || status === "cancelled") {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (status === "pending") {
    bg = "#fef9c3";
    color = "#854d0e";
  } else if (status === "settled") {
    bg = "#f3e8ff";
    color = "#6b21a8";
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
