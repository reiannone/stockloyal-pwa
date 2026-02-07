// src/pages/TransactionsLedgerAdmin.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiPost } from "../api.js";

export default function TransactionsLedgerAdmin() {
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState("member_id"); // member_id | date | tx_type | inbound | outbound
  const [filterValue, setFilterValue] = useState("");

  // ✅ Data Quality banner state
  const [dataQualityState, setDataQualityState] = useState(null);

  const editPanelRef = useRef(null);

  // ---- timezone helpers ----
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  // Curated IANA timezone options
  const timezones = useMemo(
    () => [
      // Americas
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
      "America/Detroit", "America/Indiana/Indianapolis", "America/Kentucky/Louisville",
      "America/Toronto", "America/Vancouver", "America/Winnipeg", "America/Edmonton",
      "America/Mexico_City", "America/Cancun",
      // Europe
      "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin",
      "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels",
      // Asia
      "Asia/Tokyo", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore",
      "Asia/Taipei", "Asia/Seoul", "Asia/Kolkata", "Asia/Dubai",
      // Oceania
      "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
      "Australia/Perth", "Pacific/Auckland",
      // Fallback
      "UTC",
    ],
    []
  );

  // --- initial load (prefill member filter if available) ---
  useEffect(() => {
    // ✅ Check if coming from DataQualityCheck
    if (location.state?.fromDataQuality && location.state?.affectedRecords) {
      setDataQualityState(location.state);
      
      // Filter by tx_id if we have affected records
      const affectedIds = location.state.affectedRecords || [];
      if (affectedIds.length > 0) {
        // Fetch all records and we'll filter in the UI
        fetchRows({});
      } else {
        fetchRows({});
      }
    } else {
      // Normal flow - prefill with current member
      const myId = localStorage.getItem("memberId") || "";
      if (myId) {
        setFilterField("member_id");
        setFilterValue(myId);
        fetchRows({ member_id: myId });
      } else {
        fetchRows({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build filters payload based on field/value
  const buildFilters = () => {
    const f = { sort_by: "created_at", sort_dir: "DESC", limit: 200 };
    const v = (filterValue || "").trim();

    switch (filterField) {
      case "member_id":
        if (v) f.member_id = v;
        break;
      case "tx_type":
        // Backend expects exact enum; we pass it only if provided.
        if (v) f.tx_type = v;
        break;
      case "date": {
        // Expect YYYY-MM-DD (single day). If invalid/empty, no date filter.
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const start = `${v} 00:00:00`;
          // Compute next day safely
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
      case "inbound":
        f.direction = "inbound";
        break;
      case "outbound":
        f.direction = "outbound";
        break;
      default:
        break;
    }
    return f;
  };

  const fetchRows = async (filters) => {
    setLoading(true);
    try {
      const data = await apiPost("get-ledger.php", {
        sort_by: "created_at",
        sort_dir: "DESC",
        limit: 200,
        ...filters,
      });
      if (data?.success) {
        const list = data.rows || [];
        setRows(list);
        // Keep selection on the same PK if still present, otherwise clear
        if (selected) {
          const pk = primaryKey(selected);
          const found = list.find((r) => primaryKey(r) === pk);
          setSelected(found ? withDefaultTimezone(found, detectedTz) : null);
        }
      } else {
        console.warn("[TransactionsLedgerAdmin] fetch error:", data?.error);
        setRows([]);
        setSelected(null);
      }
    } catch (e) {
      console.error("[TransactionsLedgerAdmin] fetch failed", e);
      setRows([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  // --- utils ---
  const withDefaultTimezone = (row, fallbackTz) => {
    const r = { ...row };
    if (!r.member_timezone || String(r.member_timezone).trim() === "") {
      r.member_timezone = fallbackTz;
    }
    return r;
  };

  const primaryKey = (row) => {
    if (!row) return null;
    // get-ledger.php aliases tx_id as id
    return row.id ?? row.tx_id ?? row.record_id ?? row.ledger_id ?? null;
  };

  // ✅ Filter rows based on data quality state
  const displayRows = useMemo(() => {
    if (!dataQualityState?.affectedRecords || dataQualityState.affectedRecords.length === 0) {
      return rows; // Show all rows if no filter
    }
    
    // Filter to show only affected records
    const affectedIds = new Set(dataQualityState.affectedRecords.map(id => String(id)));
    return rows.filter(r => affectedIds.has(String(primaryKey(r))));
  }, [rows, dataQualityState]);

  const toLocalZonedString = (ts, tz) => {
    if (!ts) return "-";
    let iso = String(ts).trim();
    const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
    if (!hasZone) {
      iso = iso.replace(" ", "T") + "Z"; // treat DB "YYYY-MM-DD HH:mm:ss" as UTC
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
        timeZone: tz || detectedTz,
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
      const res = await apiPost("save-transactions-ledger.php", payload);
      if (res?.success) {
        alert("Ledger row saved!");
        const currentFilters = buildFilters();
        await fetchRows(currentFilters);
        // keep selection on the same PK if possible
        const pk = primaryKey(selected);
        const found = (rows || []).find((r) => primaryKey(r) === pk);
        if (found) setSelected(withDefaultTimezone(found, detectedTz));
      } else {
        alert("Save failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[TransactionsLedgerAdmin] save failed", err);
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
    if (!window.confirm("Delete this ledger row?")) return;

    try {
      const res = await apiPost("delete-transactions-ledger.php", {
        id: row.id,
        tx_id: row.tx_id,
        record_id: row.record_id,
        ledger_id: row.ledger_id,
      });
      if (res?.success) {
        alert("Deleted");
        const currentFilters = buildFilters();
        await fetchRows(currentFilters);
        if (selected && primaryKey(selected) === pk) setSelected(null);
      } else {
        alert("Delete failed: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error("[TransactionsLedgerAdmin] delete failed", e);
      alert("Delete failed: network/server error");
    }
  };

  // --- handle field changes ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    setSelected((prev) => ({ ...prev, [name]: value }));
  };

  // --- select row for editing ---
  const handleEditClick = (row) => {
    setSelected(withDefaultTimezone(row, detectedTz));
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Format helpers
  const fmtMoney = (n) =>
    n == null || isNaN(Number(n))
      ? "-"
      : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

  // UI helpers for filter input
  const inputPlaceholder =
    filterField === "member_id"
      ? "e.g. M-12345"
      : filterField === "date"
      ? "YYYY-MM-DD"
      : filterField === "tx_type"
      ? "e.g. points_received"
      : "";

  const inputDisabled = filterField === "inbound" || filterField === "outbound";

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Transactions Ledger Administration</h1>
      <p className="page-deck">
        Review and edit entries in <code>transactions_ledger</code>. Timestamps are stored in UTC;
        the local preview renders using <code>member_timezone</code>.
      </p>

      {/* ✅ Data Quality Banner */}
      {dataQualityState?.fromDataQuality && (
        <div className="card" style={{ 
          marginBottom: "1rem", 
          backgroundColor: "#fef3c7", 
          borderLeft: "4px solid #f59e0b",
          padding: "1rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.25rem" }}>⚠️</span>
            <strong style={{ color: "#92400e" }}>Data Quality Issue Detected</strong>
          </div>
          <p style={{ margin: 0, color: "#78350f" }}>
            Showing <strong>{dataQualityState.totalAffected}</strong> records with missing or invalid{" "}
            <code>{dataQualityState.fieldName}</code>. 
            {dataQualityState.affectedRecords?.length > 0 ? (
              <> Currently displaying <strong>{displayRows.length}</strong> affected records.</>
            ) : (
              <> Use filters to locate affected records.</>
            )}
          </p>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: "0.5rem" }}
            onClick={() => {
              setDataQualityState(null);
              setFilterField("member_id");
              setFilterValue("");
              fetchRows({});
            }}
          >
            Clear Filter & Show All Records
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <label className="form-label">Filter:</label>
          <select
            className="form-input"
            style={{ maxWidth: 220 }}
            value={filterField}
            onChange={(e) => {
              const next = e.target.value;
              setFilterField(next);
              // reset value when changing to a type that doesn't need input
              if (next === "inbound" || next === "outbound") {
                setFilterValue("");
              }
            }}
          >
            <option value="member_id">Member ID</option>
            <option value="date">Date (day)</option>
            <option value="tx_type">TX Type</option>
            <option value="inbound">Inbound (direction)</option>
            <option value="outbound">Outbound (direction)</option>
          </select>

          <input
            className="form-input"
            type={filterField === "date" ? "date" : "text"}
            placeholder={inputPlaceholder}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            disabled={inputDisabled}
            style={{ maxWidth: 260 }}
          />

          {/* Quick: use my memberId */}
          {filterField === "member_id" && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const myId = localStorage.getItem("memberId") || "";
                setFilterValue(myId);
              }}
            >
              Use my memberId
            </button>
          )}

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
              setFilterField("member_id");
              setFilterValue("");
              fetchRows({});
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Edit panel — only visible when a row is clicked */}
      {selected && (
      <div className="card" ref={editPanelRef} style={{ marginBottom: "1rem" }}>
        <h2 className="subheading" style={{ marginTop: 0 }}>
          Edit Ledger Row: {primaryKey(selected) ?? ""}
        </h2>
          <form onSubmit={saveRow} className="form-grid">
            {/* Primary Key (read-only) */}
            <FormRow label="TX ID">
              <input className="form-input" type="text" value={primaryKey(selected) ?? ""} readOnly />
            </FormRow>

            {/* Core identifiers */}
            <FormRow label="Member ID">
              <input
                className="form-input"
                name="member_id"
                type="text"
                value={selected.member_id ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Order ID">
              <input
                className="form-input"
                name="order_id"
                type="text"
                value={selected.order_id ?? ""}
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

            <FormRow label="Broker">
              <input
                className="form-input"
                name="broker"
                type="text"
                value={selected.broker ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Client TX ID">
              <input
                className="form-input"
                name="client_tx_id"
                type="text"
                value={selected.client_tx_id ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="External Ref">
              <input
                className="form-input"
                name="external_ref"
                type="text"
                value={selected.external_ref ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="TX Type">
              <input
                className="form-input"
                name="tx_type"
                type="text"
                value={selected.tx_type ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Direction">
              <input
                className="form-input"
                name="direction"
                type="text"
                value={selected.direction ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Channel">
              <input
                className="form-input"
                name="channel"
                type="text"
                value={selected.channel ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Status">
              <input
                className="form-input"
                name="status"
                type="text"
                value={selected.status ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Amount (Points)">
              <input
                className="form-input"
                name="amount_points"
                type="number"
                step="0.0001"
                value={selected.amount_points ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Amount (Cash)">
              <input
                className="form-input"
                name="amount_cash"
                type="number"
                step="0.01"
                value={selected.amount_cash ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Note">
              <input
                className="form-input"
                name="note"
                type="text"
                value={selected.note ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* Raw timestamp from API alias (event_at = created_at) */}
            <FormRow label="Event At (UTC)">
              <input
                className="form-input"
                name="event_at"
                type="text"
                placeholder="YYYY-MM-DD HH:MM:SS (UTC)"
                value={selected.event_at ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* Local preview */}
            <FormRow label="Event Time (Local Preview)">
              <input
                className="form-input"
                type="text"
                value={toLocalZonedString(selected.event_at, selected.member_timezone || detectedTz)}
                readOnly
              />
            </FormRow>

            {/* Timezone selector */}
            <FormRow label="Member Timezone">
              <div className="form-inline">
                <select
                  className="form-input"
                  name="member_timezone"
                  value={selected?.member_timezone ?? ""}
                  onChange={handleChange}
                >
                  <option value="">-- Select Timezone --</option>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <small className="subtext" style={{ marginLeft: "0.5rem" }}>
                  Detected: <strong>{detectedTz}</strong>
                </small>
              </div>
            </FormRow>

            <div className="card-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save Row"}
              </button>
              {selected && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={() => deleteRow(selected)}
                >
                  Delete Row
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </form>
      </div>
      )}

      {/* Ledger table */}
      <h2 className="subheading">Ledger Records</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card">
          <table className="basket-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Member</th>
                <th>Order</th>
                <th>Type / Dir</th>
                <th>Channel / Status</th>
                <th>Points / Cash</th>
                <th>Event (Local)</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => {
                const pk = primaryKey(r);
                const localTime = toLocalZonedString(r?.event_at, r?.member_timezone || detectedTz);
                return (
                  <tr
                    key={pk ?? Math.random()}
                    onClick={() => handleEditClick(r)}
                    style={{ cursor: 'pointer' }}
                    title="Click to edit this ledger row"
                  >
                    <td>{pk ?? "-"}</td>
                    <td>{r?.member_id ?? "-"}</td>
                    <td>{r?.order_id ?? "-"}</td>
                    <td>
                      <div>{r?.tx_type || "-"}</div>
                      <div className="subtext">{r?.direction || "-"}</div>
                    </td>
                    <td>
                      <div>{r?.channel || "-"}</div>
                      <div className="subtext">{r?.status || "-"}</div>
                    </td>
                    <td>
                      <div className="subtext">
                        Pts:&nbsp;
                        {r?.amount_points == null
                          ? "-"
                          : Number(r.amount_points).toLocaleString()}
                      </div>
                      <div>Cash: {fmtMoney(r?.amount_cash)}</div>
                    </td>
                    <td>{localTime}</td>
                  </tr>
                );
              })}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "1rem" }}>
                    No ledger records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div className="form-row">
      {label && <label className="form-label">{label}:</label>}
      {children}
    </div>
  );
}
