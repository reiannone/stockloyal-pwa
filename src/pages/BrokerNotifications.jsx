// src/pages/BrokerNotifications.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "../api.js";

export default function BrokerNotifications() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jsonViewMode, setJsonViewMode] = useState("formatted"); // "formatted" | "raw"

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState("broker_name");
  const [filterValue, setFilterValue] = useState("");

  const editPanelRef = useRef(null);

  // Browser-detected fallback timezone
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  // --- initial load ---
  useEffect(() => {
    fetchRows({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build filters payload
  const buildFilters = () => {
    const f = { sort_by: "created_at", sort_dir: "DESC", limit: 200 };
    const v = (filterValue || "").trim();

    switch (filterField) {
      case "broker_id":
        if (v) f.broker_id = v;
        break;
      case "broker_name":
        if (v) f.broker_name = v;
        break;
      case "member_id":
        if (v) f.member_id = v;
        break;
      case "merchant_id":
        if (v) f.merchant_id = v;
        break;
      case "event_type":
        if (v) f.event_type = v;
        break;
      case "status":
        if (v) f.status = v;
        break;
      case "basket_id":
        if (v) f.basket_id = v;
        break;
      case "date": {
        // same pattern as MerchantNotifications: day filter -> start_date/end_date
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const start = `${v} 00:00:00`;
          const dt = new Date(`${v}T00:00:00Z`);
          if (!isNaN(dt.getTime())) {
            const next = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
            const yyyy = next.getUTCFullYear();
            const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(next.getUTCDate()).padStart(2, "0");
            const end = `${yyyy}-${mm}-${dd} 00:00:00`;
            f.start_date = start;
            f.end_date = end;
          }
        }
        break;
      }
      default:
        break;
    }

    return f;
  };

  const fetchRows = async (filters) => {
    setLoading(true);
    try {
      const res = await apiPost("get-broker-notifications.php", filters);
      if (res?.success && Array.isArray(res.notifications)) {
        setRows(res.notifications);
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error("[BrokerNotifications] fetchRows error:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSelected((prev) => ({ ...prev, [name]: value }));
  };

  const primaryKey = (row) => {
    if (!row) return null;
    return row.id ?? null;
  };

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

  // --- save row ---
  const saveRow = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);

    try {
      const payload = { ...selected };
      const res = await apiPost("save-broker-notification.php", payload);

      if (res?.success) {
        alert("Notification saved!");
        const currentFilters = buildFilters();
        await fetchRows(currentFilters);

        const pk = primaryKey(selected);
        const found = (rows || []).find((r) => primaryKey(r) === pk);
        if (found) setSelected(found);
      } else {
        alert("Save failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[BrokerNotifications] save failed", err);
      alert("Save failed: network/server error");
    } finally {
      setSaving(false);
    }
  };

  // --- delete row ---
  const deleteRow = async (row) => {
    const pk = primaryKey(row);
    if (!pk) {
      alert("Cannot determine primary key for this row.");
      return;
    }
    if (!window.confirm(`Delete broker notification #${pk}?`)) return;

    try {
      const res = await apiPost("delete-broker-notification.php", { id: pk });
      if (res?.success) {
        alert("Notification deleted!");
        const currentFilters = buildFilters();
        await fetchRows(currentFilters);
        if (selected && primaryKey(selected) === pk) setSelected(null);
      } else {
        alert("Delete failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[BrokerNotifications] delete failed", err);
      alert("Delete failed: network/server error");
    }
  };

  // --- retry notification ---
  const retryNotification = async (row) => {
    const pk = primaryKey(row);
    if (!pk) {
      alert("Cannot determine primary key for this row.");
      return;
    }
    if (!window.confirm(`Retry sending broker notification #${pk}?`)) return;

    try {
      const res = await apiPost("retry-broker-notification.php", { id: pk });
      if (res?.success) {
        alert("Notification retry initiated!");
        const currentFilters = buildFilters();
        await fetchRows(currentFilters);
      } else {
        alert("Retry failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[BrokerNotifications] retry failed", err);
      alert("Retry failed: network/server error");
    }
  };

  const getStatusPillStyle = (status) => {
    const baseStyle = {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 12,
      fontSize: "0.85rem",
      fontWeight: 600,
    };

    switch (status) {
      case "sent":
        return { ...baseStyle, background: "#dcfce7", color: "#166534" };
      case "failed":
        return { ...baseStyle, background: "#fee2e2", color: "#991b1b" };
      case "pending":
        return { ...baseStyle, background: "#fef3c7", color: "#92400e" };
      default:
        return { ...baseStyle, background: "#f3f4f6", color: "#374151" };
    }
  };

  // ── JSON Viewer Component ──────────────────────────────────────────────────
  const JsonViewer = ({ value, name, onChange, rows = 5 }) => {
    // Parse JSON if it's a string
    let parsed = null;
    let parseError = null;
    const rawValue = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    
    try {
      parsed = typeof value === "string" ? JSON.parse(value) : value;
    } catch (e) {
      parseError = e.message;
    }

    // Render a formatted key-value pair
    const renderValue = (val, depth = 0) => {
      if (val === null) return <span style={{ color: "#94a3b8" }}>null</span>;
      if (val === undefined) return <span style={{ color: "#94a3b8" }}>undefined</span>;
      if (typeof val === "boolean") return <span style={{ color: "#8b5cf6" }}>{val.toString()}</span>;
      if (typeof val === "number") return <span style={{ color: "#0891b2" }}>{val}</span>;
      if (typeof val === "string") {
        // Check if it's a date
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
          return <span style={{ color: "#059669" }}>{val}</span>;
        }
        return <span style={{ color: "#dc2626" }}>"{val}"</span>;
      }
      if (Array.isArray(val)) {
        if (val.length === 0) return <span style={{ color: "#64748b" }}>[]</span>;
        return (
          <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
            {val.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 4 }}>
                <span style={{ color: "#64748b" }}>[{i}]:</span>
                {renderValue(item, depth + 1)}
              </div>
            ))}
          </div>
        );
      }
      if (typeof val === "object") {
        const keys = Object.keys(val);
        if (keys.length === 0) return <span style={{ color: "#64748b" }}>{"{}"}</span>;
        return (
          <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
            {keys.map((key) => (
              <div key={key} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <span style={{ color: "#6366f1", fontWeight: 600 }}>{key}:</span>
                {renderValue(val[key], depth + 1)}
              </div>
            ))}
          </div>
        );
      }
      return <span>{String(val)}</span>;
    };

    return (
      <div>
        {/* Toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setJsonViewMode("formatted")}
            style={{
              padding: "4px 12px",
              fontSize: "0.75rem",
              fontWeight: 600,
              border: "1px solid #e2e8f0",
              borderRadius: 4,
              backgroundColor: jsonViewMode === "formatted" ? "#6366f1" : "#fff",
              color: jsonViewMode === "formatted" ? "#fff" : "#64748b",
              cursor: "pointer",
            }}
          >
            📋 Formatted
          </button>
          <button
            type="button"
            onClick={() => setJsonViewMode("raw")}
            style={{
              padding: "4px 12px",
              fontSize: "0.75rem",
              fontWeight: 600,
              border: "1px solid #e2e8f0",
              borderRadius: 4,
              backgroundColor: jsonViewMode === "raw" ? "#6366f1" : "#fff",
              color: jsonViewMode === "raw" ? "#fff" : "#64748b",
              cursor: "pointer",
            }}
          >
            {"{ }"} Raw JSON
          </button>
        </div>

        {jsonViewMode === "raw" ? (
          <textarea
            className="form-input"
            name={name}
            rows={rows}
            value={rawValue}
            onChange={onChange}
            style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
          />
        ) : (
          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: 12,
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {parseError ? (
              <div style={{ color: "#dc2626" }}>
                <strong>Parse Error:</strong> {parseError}
                <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{rawValue}</pre>
              </div>
            ) : parsed ? (
              renderValue(parsed)
            ) : (
              <span style={{ color: "#94a3b8" }}>Empty</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const inputPlaceholder =
    filterField === "date"
      ? "YYYY-MM-DD"
      : filterField === "event_type"
      ? "e.g. order_placed"
      : filterField === "status"
      ? "e.g. sent"
      : filterField === "broker_name"
      ? "e.g. Charles Schwab"
      : "";

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Broker Webhook Notifications</h1>
      <p className="page-deck">
        Review broker webhook notifications. Monitor delivery status and retry failed notifications.
      </p>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <label className="form-label">Filter:</label>

          <select
            className="form-input"
            style={{ maxWidth: 240 }}
            value={filterField}
            onChange={(e) => {
              setFilterField(e.target.value);
              setFilterValue("");
            }}
          >
            <option value="broker_name">Broker Name</option>
            <option value="broker_id">Broker ID</option>
            <option value="member_id">Member ID</option>
            <option value="merchant_id">Merchant ID</option>
            <option value="event_type">Event Type</option>
            <option value="status">Status</option>
            <option value="basket_id">Basket ID</option>
            <option value="date">Date (day)</option>
          </select>

          <input
            className="form-input"
            type={filterField === "date" ? "date" : "text"}
            placeholder={inputPlaceholder}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            style={{ maxWidth: 280 }}
          />

          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const filters = buildFilters();
              fetchRows(filters);
            }}
          >
            Filter
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFilterField("broker_name");
              setFilterValue("");
              fetchRows({});
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Edit panel */}
      <div className="card" ref={editPanelRef}>
        {selected ? (
          <form onSubmit={saveRow} className="form-grid">
            <FormRow label="Notification ID">
              <input className="form-input" type="text" value={primaryKey(selected) ?? ""} readOnly />
            </FormRow>

            <FormRow label="Broker ID">
              <input
                className="form-input"
                name="broker_id"
                type="text"
                value={selected.broker_id ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Broker Name">
              <input
                className="form-input"
                name="broker_name"
                type="text"
                value={selected.broker_name ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Member ID">
              <input
                className="form-input"
                name="member_id"
                type="text"
                value={selected.member_id ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Merchant ID">
              <input
                className="form-input"
                name="merchant_id"
                type="text"
                value={selected.merchant_id ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Basket ID">
              <input
                className="form-input"
                name="basket_id"
                type="text"
                value={selected.basket_id ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Event Type">
              <input
                className="form-input"
                name="event_type"
                type="text"
                value={selected.event_type ?? "order_placed"}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Status">
              <select
                className="form-input"
                name="status"
                value={selected.status ?? "pending"}
                onChange={handleChange}
              >
                <option value="pending">pending</option>
                <option value="sent">sent</option>
                <option value="failed">failed</option>
              </select>
            </FormRow>

            <FormRow label="Response Code">
              <input
                className="form-input"
                name="response_code"
                type="number"
                value={selected.response_code ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Error Message" fullWidth>
              <textarea
                className="form-input"
                name="error_message"
                rows={2}
                value={selected.error_message ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Payload (JSON)" fullWidth>
              <JsonViewer
                value={selected.payload}
                name="payload"
                onChange={handleChange}
                rows={6}
              />
            </FormRow>

            <FormRow label="Response Body" fullWidth>
              <JsonViewer
                value={selected.response_body}
                name="response_body"
                onChange={handleChange}
                rows={4}
              />
            </FormRow>

            <FormRow label="Created At">
              <input className="form-input" type="text" value={toLocalZonedString(selected.created_at)} readOnly />
            </FormRow>

            <FormRow label="Sent At">
              <input className="form-input" type="text" value={toLocalZonedString(selected.sent_at)} readOnly />
            </FormRow>

            <div className="card-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>

              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Cancel
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => retryNotification(selected)}
                disabled={selected.status === "sent"}
              >
                🔄 Retry Send
              </button>

              <button type="button" className="btn-danger" onClick={() => deleteRow(selected)}>
                Delete
              </button>
            </div>
          </form>
        ) : (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>
            Click a row below to view/edit details
          </p>
        )}
      </div>

      {/* Table */}
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Broker Webhook Notifications</h3>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Broker</th>
                  <th>Member</th>
                  <th>Merchant</th>
                  <th>Event Type</th>
                  <th>Basket ID</th>
                  <th>Status / Code</th>
                  <th>Created / Sent</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => {
                  const pk = primaryKey(r);
                  const isSelected = selected && primaryKey(selected) === pk;

                  return (
                    <tr
                      key={pk}
                      onClick={() => {
                        setSelected(r);
                        setTimeout(() => {
                          editPanelRef.current?.scrollIntoView({ behavior: "smooth" });
                        }, 100);
                      }}
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "#eff6ff" : undefined,
                      }}
                    >
                      <td>{pk}</td>
                      <td>{r.broker_name || "-"}</td>
                      <td>{r.member_id || "-"}</td>
                      <td>{r.merchant_id || "-"}</td>
                      <td>{r.event_type || "-"}</td>
                      <td style={{ fontSize: "0.85rem" }}>{r.basket_id || "-"}</td>
                      <td style={{ textAlign: "center", lineHeight: 1.4 }}>
                        <div>
                          <span style={getStatusPillStyle(r.status)}>{r.status || "unknown"}</span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 2 }}>
                          {r.response_code || "-"}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
                        <div>{toLocalZonedString(r.created_at)}</div>
                        <div style={{ color: "#6b7280" }}>
                          {toLocalZonedString(r.sent_at) || "-"}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "#9ca3af" }}>
                      No broker notifications found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Same FormRow wrapper pattern as MerchantNotifications (LedgerAdmin-style).
 */
function FormRow({ label, children, fullWidth = false }) {
  return (
    <div className="form-row" style={fullWidth ? { gridColumn: "1 / -1" } : undefined}>
      {label && <label className="form-label">{label}:</label>}
      {children}
    </div>
  );
}
