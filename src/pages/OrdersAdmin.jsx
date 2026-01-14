// src/pages/OrdersAdmin.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiPost } from "../api.js";

// Match LedgerAdmin: inline label + control
function FormRow({ label, children }) {
  return (
    <div className="form-row">
      {label && <label className="form-label">{label}:</label>}
      {children}
    </div>
  );
}

export default function OrdersAdmin() {
  const location = useLocation();

  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Data Quality state ────────────────────────────────────────────────────
  const [fromDataQuality, setFromDataQuality] = useState(false);
  const [affectedRecords, setAffectedRecords] = useState([]); // order_ids
  const [fieldName, setFieldName] = useState("");
  const [totalAffected, setTotalAffected] = useState(0);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState("member_id");
  const [filterValue, setFilterValue] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const editPanelRef = useRef(null);

  // ---- timezone helpers ----
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  const timezones = useMemo(
    () => [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Hong_Kong",
      "Asia/Singapore",
      "Australia/Sydney",
      "Pacific/Auckland",
      "UTC",
    ],
    []
  );

  const fetchOrders = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const data = await apiPost("get-orders.php", filters);
      if (data?.orders) setOrders(data.orders);
      else setOrders([]);
    } catch (err) {
      console.error("Error fetching orders:", err);
      alert("Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Build filters payload (normal mode)
  const buildFilters = useCallback(() => {
    const f = { sort_by: "placed_at", sort_dir: "DESC", limit: 200 };
    const v = (filterValue || "").trim();

    switch (filterField) {
      case "member_id":
        if (v) f.member_id = v;
        break;
      case "order_id":
        if (v) f.order_id = parseInt(v, 10);
        break;
      case "symbol":
        if (v) f.symbol = v.toUpperCase();
        break;
      case "basket_id":
        if (v) f.basket_id = v;
        break;
      case "date": {
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const start = `${v} 00:00:00`;
          const nextDay = new Date(`${v}T00:00:00Z`);
          if (!isNaN(nextDay.getTime())) {
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
            const yyyy = nextDay.getUTCFullYear();
            const mm = String(nextDay.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(nextDay.getUTCDate()).padStart(2, "0");
            const end = `${yyyy}-${mm}-${dd} 00:00:00`;
            f.date_start = start;
            f.date_end = end;
          }
        }
        break;
      }
      default:
        break;
    }

    if (filterStatus) f.status = filterStatus;
    return f;
  }, [filterField, filterValue, filterStatus]);

  // ✅ Single “source of truth” load:
  // If navigated from DQ with order_ids, fetch only those. Otherwise normal load.
  useEffect(() => {
    const dq = Boolean(location.state?.fromDataQuality);
    const idsRaw = Array.isArray(location.state?.affectedRecords)
      ? location.state.affectedRecords
      : [];

    const ids = idsRaw
      .map((x) => parseInt(String(x), 10))
      .filter((n) => Number.isFinite(n));

    if (dq && ids.length > 0) {
      setFromDataQuality(true);
      setAffectedRecords(ids.map(String));
      setFieldName(location.state?.fieldName || "");
      setTotalAffected(location.state?.totalAffected || ids.length);

      // DQ fetch
      fetchOrders({ order_ids: ids, sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
    } else {
      // Normal fetch
      setFromDataQuality(false);
      setAffectedRecords([]);
      setFieldName("");
      setTotalAffected(0);

      fetchOrders({ sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
    }

    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, fetchOrders]);

  const handleApplyFilter = () => {
    // ✅ Applying user filters should exit DQ mode
    setFromDataQuality(false);
    setAffectedRecords([]);
    setFieldName("");
    setTotalAffected(0);

    const filters = buildFilters();
    fetchOrders(filters);
    setSelected(null);
  };

  const handleClearDQBanner = () => {
    // ✅ FIX: setAffectedRecords (not setAffectedMembers)
    setFromDataQuality(false);
    setAffectedRecords([]);
    setFieldName("");
    setTotalAffected(0);
    setSelected(null);

    // Return to normal list
    fetchOrders({ sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
  };

  const handleEditClick = (order) => {
    setSelected({ ...order });
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const saveOrder = async (e) => {
    e.preventDefault();
    if (!selected) return;

    setSaving(true);
    try {
      const res = await apiPost("save-order.php", selected);
      if (res?.success) {
        alert("Order saved!");

        // Refresh list based on current mode
        if (fromDataQuality && affectedRecords.length > 0) {
          const orderIds = affectedRecords
            .map((x) => parseInt(String(x), 10))
            .filter((n) => Number.isFinite(n));
          await fetchOrders({ order_ids: orderIds, sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
        } else {
          const filters = buildFilters();
          await fetchOrders(filters);
        }

        setSelected(null);
      } else {
        alert("Save failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Save failed:", err);
      alert("Save failed: network/server error");
    } finally {
      setSaving(false);
    }
  };

  // UI helpers for filter input (match Ledger style)
  const inputPlaceholder =
    filterField === "member_id"
      ? "e.g. Utah1220"
      : filterField === "symbol"
      ? "e.g. AAPL"
      : filterField === "date"
      ? "YYYY-MM-DD"
      : "Enter value";

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Orders Administration</h1>
      <p className="page-deck">View and manage stock orders. Filter by member, symbol, status, or date.</p>

      {/* Data Quality Banner */}
      {fromDataQuality && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            backgroundColor: "#fef3c7",
            border: "2px solid #f59e0b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: "1.5rem" }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: "#92400e" }}>Data Quality Issue:</strong>{" "}
              <span style={{ color: "#78350f" }}>
                {totalAffected} orders with missing/invalid{" "}
                <code style={{ background: "#fde68a", padding: "2px 6px", borderRadius: "3px" }}>
                  {fieldName}
                </code>
              </span>
            </div>
            <button type="button" className="btn-secondary" onClick={handleClearDQBanner} style={{ minWidth: 120 }}>
              Clear Filter
            </button>
          </div>
        </div>
      )}

      {/* ✅ Filter bar styled like LedgerAdmin */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <label className="form-label">Filter:</label>

          <select
            className="form-input"
            style={{ maxWidth: 220 }}
            value={filterField}
            onChange={(e) => {
              setFilterField(e.target.value);
              setFilterValue("");
            }}
          >
            <option value="member_id">Member ID</option>
            <option value="order_id">Order ID</option>
            <option value="symbol">Symbol</option>
            <option value="basket_id">Basket ID</option>
            <option value="date">Date (day)</option>
          </select>

          <input
            className="form-input"
            style={{ maxWidth: 260 }}
            type={filterField === "date" ? "date" : "text"}
            placeholder={inputPlaceholder}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
          />

          <select
            className="form-input"
            style={{ maxWidth: 200 }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="placed">Placed</option>
            <option value="confirmed">Confirmed</option>
            <option value="executed">Executed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <button type="button" className="btn-primary" onClick={handleApplyFilter}>
            Filter
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFilterField("member_id");
              setFilterValue("");
              setFilterStatus("");
              setFromDataQuality(false);
              setAffectedRecords([]);
              setFieldName("");
              setTotalAffected(0);
              setSelected(null);
              fetchOrders({ sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Edit Panel */}
      {selected && (
        <div className="card" style={{ marginBottom: "1rem" }} ref={editPanelRef}>
          <h2 className="subheading" style={{ marginTop: 0 }}>
            Edit Order #{selected.order_id}
          </h2>

          <form onSubmit={saveOrder} className="form-grid">
            <FormRow label="Order ID">
              <input type="text" className="form-input" value={selected.order_id || ""} disabled />
            </FormRow>

            <FormRow label="Member ID">
              <input
                type="text"
                className="form-input"
                value={selected.member_id || ""}
                onChange={(e) => setSelected({ ...selected, member_id: e.target.value })}
                required
              />
            </FormRow>

            <FormRow label="Merchant ID">
              <input
                type="text"
                className="form-input"
                value={selected.merchant_id || ""}
                onChange={(e) => setSelected({ ...selected, merchant_id: e.target.value })}
              />
            </FormRow>

            <FormRow label="Basket ID">
              <input
                type="text"
                className="form-input"
                value={selected.basket_id || ""}
                onChange={(e) => setSelected({ ...selected, basket_id: e.target.value })}
                required
              />
            </FormRow>

            <FormRow label="Symbol">
              <input
                type="text"
                className="form-input"
                value={selected.symbol || ""}
                onChange={(e) => setSelected({ ...selected, symbol: e.target.value.toUpperCase() })}
                required
              />
            </FormRow>

            <FormRow label="Shares">
              <input
                type="number"
                step="0.0001"
                className="form-input"
                value={selected.shares || ""}
                onChange={(e) => setSelected({ ...selected, shares: e.target.value })}
                required
              />
            </FormRow>

            <FormRow label="Amount ($)">
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={selected.amount || ""}
                onChange={(e) => setSelected({ ...selected, amount: e.target.value })}
                required
              />
            </FormRow>

            <FormRow label="Points Used">
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={selected.points_used || ""}
                onChange={(e) => setSelected({ ...selected, points_used: e.target.value })}
              />
            </FormRow>

            <FormRow label="Status">
              <select
                className="form-input"
                value={selected.status || "pending"}
                onChange={(e) => setSelected({ ...selected, status: e.target.value })}
              >
                <option value="pending">Pending</option>
                <option value="placed">Placed</option>
                <option value="confirmed">Confirmed</option>
                <option value="executed">Executed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FormRow>

            <FormRow label="Broker">
              <input
                type="text"
                className="form-input"
                value={selected.broker || ""}
                onChange={(e) => setSelected({ ...selected, broker: e.target.value })}
              />
            </FormRow>

            <FormRow label="Order Type">
              <select
                className="form-input"
                value={selected.order_type || "market"}
                onChange={(e) => setSelected({ ...selected, order_type: e.target.value })}
              >
                <option value="market">Market</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="sweep">Sweep</option>
                <option value="gtc">GTC (Good Till Cancelled)</option>
              </select>
            </FormRow>

            <FormRow label="Member Timezone">
              <select
                className="form-input"
                value={selected.member_timezone || detectedTz}
                onChange={(e) => setSelected({ ...selected, member_timezone: e.target.value })}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </FormRow>

            <FormRow label="Executed Price">
              <input
                type="number"
                step="0.0001"
                className="form-input"
                value={selected.executed_price || ""}
                onChange={(e) => setSelected({ ...selected, executed_price: e.target.value })}
                placeholder="Fill when executed"
              />
            </FormRow>

            <FormRow label="Executed Shares">
              <input
                type="number"
                step="0.0001"
                className="form-input"
                value={selected.executed_shares || ""}
                onChange={(e) => setSelected({ ...selected, executed_shares: e.target.value })}
                placeholder="Fill when executed"
              />
            </FormRow>

            <FormRow label="Executed Amount ($)">
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={selected.executed_amount || ""}
                onChange={(e) => setSelected({ ...selected, executed_amount: e.target.value })}
                placeholder="Fill when executed"
              />
            </FormRow>

            <FormRow label="Paid">
              <select
                className="form-input"
                value={selected.paid_flag || "0"}
                onChange={(e) => setSelected({ ...selected, paid_flag: e.target.value })}
              >
                <option value="0">Not Paid</option>
                <option value="1">Paid</option>
              </select>
            </FormRow>

            <FormRow label="Paid Batch ID">
              <input
                type="text"
                className="form-input"
                value={selected.paid_batch_id || ""}
                onChange={(e) => setSelected({ ...selected, paid_batch_id: e.target.value })}
                placeholder="Optional"
              />
            </FormRow>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1.25rem", gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Order"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Orders Table */}
      <h2 className="subheading">Orders List</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Member ID</th>
                <th>Symbol</th>
                <th>Shares</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Placed At</th>
                <th>Executed</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "2rem" }}>
                    No orders found
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isAffected =
                    fromDataQuality && affectedRecords.includes(String(order.order_id));
                  return (
                    <tr
                      key={order.order_id}
                      onClick={() => handleEditClick(order)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isAffected ? "#fef2f2" : "transparent",
                      }}
                      title={isAffected ? `⚠️ Missing ${fieldName} - Click to fix` : "Click to edit"}
                    >
                      <td>{order.order_id}</td>
                      <td>{order.member_id}</td>
                      <td>
                        <strong>{order.symbol}</strong>
                      </td>
                      <td>
                        {order.shares == null
                          ? "-"
                          : parseFloat(order.shares).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        {order.amount == null ? "-" : `$${parseFloat(order.amount).toFixed(2)}`}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            backgroundColor:
                              order.status === "executed"
                                ? "#d1fae5"
                                : order.status === "failed" || order.status === "cancelled"
                                ? "#fee2e2"
                                : order.status === "confirmed"
                                ? "#dbeafe"
                                : "#fef3c7",
                            color:
                              order.status === "executed"
                                ? "#065f46"
                                : order.status === "failed" || order.status === "cancelled"
                                ? "#991b1b"
                                : order.status === "confirmed"
                                ? "#1e40af"
                                : "#92400e",
                          }}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td>{order.placed_at ? new Date(order.placed_at).toLocaleString() : "-"}</td>
                      <td>
                        {order.executed_at ? (
                          <span style={{ color: "#059669", fontSize: "0.85rem" }}>
                            ✓ {new Date(order.executed_at).toLocaleString()}
                          </span>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
