// src/pages/MerchantNotifications.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "../api.js";

export default function MerchantNotifications() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState("merchant_id");
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
      case "merchant_id":
        if (v) f.merchant_id = v;
        break;
      case "member_id":
        if (v) f.member_id = v;
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
      const res = await apiPost("get-merchant-notifications.php", filters);
      if (res?.success && Array.isArray(res.notifications)) {
        setRows(res.notifications);
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error("fetchRows error:", err);
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
    if (!hasZone) {
      iso = iso.replace(" ", "T") + "Z";
    }
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
      const res = await apiPost("save-merchant-notification.php", payload);
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
      console.error("[MerchantNotifications] save failed", err);
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
    if (!window.confirm(`Delete notification #${pk}?`)) return;

    try {
      const res = await apiPost("delete-merchant-notification.php", { id: pk });
      if (res?.success) {
        alert("Notification deleted!");
        const currentFilters = buildFilters();
        await fetchRows(currentFilters);
        if (selected && primaryKey(selected) === pk) setSelected(null);
      } else {
        alert("Delete failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[MerchantNotifications] delete failed", err);
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
    if (!window.confirm(`Retry sending notification #${pk}?`)) return;

    try {
      const res = await apiPost("retry-merchant-notification.php", { id: pk });
      if (res?.success) {
        alert("Notification retry initiated!");
        const currentFilters = buildFilters();
        await fetchRows(currentFilters);
      } else {
        alert("Retry failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[MerchantNotifications] retry failed", err);
      alert("Retry failed: network/server error");
    }
  };

  const formatPoints = (val) => (parseInt(val, 10) || 0).toLocaleString("en-US");
  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

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

  const inputPlaceholder =
    filterField === "date"
      ? "YYYY-MM-DD"
      : filterField === "event_type"
      ? "e.g. points_redeemed"
      : filterField === "status"
      ? "e.g. sent"
      : "";

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Merchant Notifications Administration</h1>
      <p className="page-deck">
        Review merchant webhook notifications. Monitor delivery status and retry failed notifications.
      </p>

      {/* Filter bar */}
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
            <option value="merchant_id">Merchant ID</option>
            <option value="member_id">Member ID</option>
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
            style={{ maxWidth: 260 }}
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
              setFilterField("merchant_id");
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

            <FormRow label="Merchant ID">
              <input
                className="form-input"
                name="merchant_id"
                type="text"
                value={selected.merchant_id ?? ""}
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

            <FormRow label="Event Type">
              <select
                className="form-input"
                name="event_type"
                value={selected.event_type ?? ""}
                onChange={handleChange}
              >
                <option value="">-- select --</option>
                <option value="points_received">points_received</option>
                <option value="points_redeemed">points_redeemed</option>
                <option value="points_adjusted">points_adjusted</option>
              </select>
            </FormRow>

            <FormRow label="Points Amount">
              <input
                className="form-input"
                name="points_amount"
                type="number"
                value={selected.points_amount ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Cash Amount">
              <input
                className="form-input"
                name="cash_amount"
                type="number"
                step="0.01"
                value={selected.cash_amount ?? ""}
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

            <FormRow label="Status">
              <select
                className="form-input"
                name="status"
                value={selected.status ?? ""}
                onChange={handleChange}
              >
                <option value="">-- select --</option>
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

            {/* Full-width rows to match LedgerAdmin “clean” grid behavior */}
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
              <textarea
                className="form-input"
                name="payload"
                rows={4}
                value={
                  typeof selected.payload === "string"
                    ? selected.payload
                    : JSON.stringify(selected.payload, null, 2)
                }
                onChange={handleChange}
                style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
              />
            </FormRow>

            <FormRow label="Response Body" fullWidth>
              <textarea
                className="form-input"
                name="response_body"
                rows={3}
                value={selected.response_body ?? ""}
                onChange={handleChange}
                style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
              />
            </FormRow>

            <FormRow label="Created At">
              <input className="form-input" type="text" value={toLocalZonedString(selected.created_at)} readOnly />
            </FormRow>

            <FormRow label="Sent At">
              <input className="form-input" type="text" value={toLocalZonedString(selected.sent_at)} readOnly />
            </FormRow>

            {/* LedgerAdmin-style actions */}
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
        <h3 style={{ marginBottom: "1rem" }}>Merchant Notifications</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Merchant</th>
                  <th>Member</th>
                  <th>Event Type</th>
                  <th>Points / Cash</th>
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
                      <td>{r.merchant_id || "-"}</td>
                      <td>{r.member_id || "-"}</td>
                      <td>{r.event_type || "-"}</td>
                      <td style={{ textAlign: "right", lineHeight: 1.4 }}>
                        <div>{r.points_amount != null ? formatPoints(r.points_amount) : "-"}</div>
                        <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                          {r.cash_amount != null ? formatDollars(r.cash_amount) : "-"}
                        </div>
                      </td>
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
                      No notifications found.
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
 * LedgerAdmin-style row wrapper so the form-grid aligns cleanly.
 * - label + control live together in a .form-row
 * - for big fields, fullWidth spans the whole grid (label+control in one block)
 */
function FormRow({ label, children, fullWidth = false }) {
  return (
    <div className="form-row" style={fullWidth ? { gridColumn: "1 / -1" } : undefined}>
      {label && <label className="form-label">{label}:</label>}
      {children}
    </div>
  );
}
