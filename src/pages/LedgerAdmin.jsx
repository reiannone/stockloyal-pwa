// src/pages/TransactionsLedgerAdmin.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { LineageLink } from "../components/LineagePopup";
import ConfirmModal from "../components/ConfirmModal";
import { Ban, Minus, Trash2 } from "lucide-react";

// ── Shared helpers ────────────────────────────────────────────────────────────

function FormRow({ label, children }) {
  return (
    <div className="form-row">
      {label && <label className="form-label">{label}:</label>}
      {children}
    </div>
  );
}

function getStatusPillStyle(statusRaw) {
  const status = (statusRaw || "").toString().toLowerCase();
  let bg = "#fef3c7", color = "#92400e";
  if (status === "executed")                            { bg = "#d1fae5"; color = "#065f46"; }
  else if (status === "confirmed")                      { bg = "#dbeafe"; color = "#1e40af"; }
  else if (status === "placed")                         { bg = "#dcfce7"; color = "#166534"; }
  else if (status === "failed" || status === "cancelled"){ bg = "#fee2e2"; color = "#991b1b"; }
  else if (status === "sell")                           { bg = "#fef3c7"; color = "#92400e"; }
  else if (status === "sold")                           { bg = "#dbeafe"; color = "#1e40af"; }
  else if (status === "pending")                        { bg = "#fef3c7"; color = "#92400e"; }
  else if (status === "settled")                        { bg = "#e0e7ff"; color = "#3730a3"; }
  else if (status === "partial" || status === "mixed")  { bg = "#f3e8ff"; color = "#6b21a8"; }
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    padding: "2px 8px", borderRadius: 999,
    fontSize: "0.75rem", fontWeight: 600,
    backgroundColor: bg, color, textTransform: "capitalize",
  };
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 20px",
        fontSize: "0.9rem",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        background: active ? "#2563eb" : "#f9fafb",
        color: active ? "#fff" : "#374151",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function TransactionsLedgerAdmin() {
  const location = useLocation();

  // ── Active tab ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("ledger"); // "ledger" | "orders"

  // ── Shared timezone helpers ─────────────────────────────────────────────────
  const detectedTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
    catch { return "America/New_York"; }
  }, []);

  const timezones = useMemo(() => [
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
    "America/Detroit", "America/Indiana/Indianapolis", "America/Kentucky/Louisville",
    "America/Toronto", "America/Vancouver", "America/Winnipeg", "America/Edmonton",
    "America/Mexico_City", "America/Cancun",
    "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin",
    "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels",
    "Asia/Tokyo", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore",
    "Asia/Taipei", "Asia/Seoul", "Asia/Kolkata", "Asia/Dubai",
    "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
    "Australia/Perth", "Pacific/Auckland",
    "UTC",
  ], []);

  // ══════════════════════════════════════════════════════════════════════════════
  // LEDGER TAB STATE
  // ══════════════════════════════════════════════════════════════════════════════

  const [ledRows, setLedRows]               = useState([]);
  const [ledSelected, setLedSelected]       = useState(null);
  const [ledLoading, setLedLoading]         = useState(true);
  const [ledSaving, setLedSaving]           = useState(false);
  const [ledFilterField, setLedFilterField] = useState("member_id");
  const [ledFilterValue, setLedFilterValue] = useState("");
  const [ledDQState, setLedDQState]         = useState(null);
  const ledEditPanelRef                     = useRef(null);
  const [ledModal, setLedModal]             = useState({
    show: false, title: "", message: "", icon: null,
    confirmText: "Confirm", confirmColor: "#007bff", data: null,
  });
  const closeLedModal = () => setLedModal(prev => ({ ...prev, show: false }));

  // ── Ledger: format helpers ──
  const fmtMoney = (n) =>
    n == null || isNaN(Number(n)) ? "-"
      : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

  const toLocalZonedString = (ts, tz) => {
    if (!ts) return "-";
    let iso = String(ts).trim();
    const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
    if (!hasZone) iso = iso.replace(" ", "T") + "Z";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return ts;
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: true, timeZone: tz || detectedTz, timeZoneName: "short",
      }).format(d);
    } catch { return d.toLocaleString(); }
  };

  const ledPrimaryKey = (row) => {
    if (!row) return null;
    return row.id ?? row.tx_id ?? row.record_id ?? row.ledger_id ?? null;
  };

  const withDefaultTimezone = (row, fallbackTz) => {
    const r = { ...row };
    if (!r.member_timezone || String(r.member_timezone).trim() === "") r.member_timezone = fallbackTz;
    return r;
  };

  const ledDisplayRows = useMemo(() => {
    if (!ledDQState?.affectedRecords || ledDQState.affectedRecords.length === 0) return ledRows;
    const ids = new Set(ledDQState.affectedRecords.map(id => String(id)));
    return ledRows.filter(r => ids.has(String(ledPrimaryKey(r))));
  }, [ledRows, ledDQState]);

  const buildLedFilters = () => {
    const f = { sort_by: "created_at", sort_dir: "DESC", limit: 200 };
    const v = (ledFilterValue || "").trim();
    switch (ledFilterField) {
      case "member_id": if (v) f.member_id = v; break;
      case "tx_type":   if (v) f.tx_type = v;   break;
      case "date": {
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const start = `${v} 00:00:00`;
          const dt = new Date(`${v}T00:00:00Z`);
          if (!isNaN(dt.getTime())) {
            const next = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
            const yyyy = next.getUTCFullYear();
            const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(next.getUTCDate()).padStart(2, "0");
            f.start_date = start;
            f.end_date = `${yyyy}-${mm}-${dd} 00:00:00`;
          }
        }
        break;
      }
      case "inbound":  f.direction = "inbound";  break;
      case "outbound": f.direction = "outbound"; break;
      default: break;
    }
    return f;
  };

  const fetchLedger = async (filters) => {
    setLedLoading(true);
    try {
      const data = await apiPost("get-ledger.php", { sort_by: "created_at", sort_dir: "DESC", limit: 200, ...filters });
      if (data?.success) {
        const list = data.rows || [];
        setLedRows(list);
        if (ledSelected) {
          const pk = ledPrimaryKey(ledSelected);
          const found = list.find(r => ledPrimaryKey(r) === pk);
          setLedSelected(found ? withDefaultTimezone(found, detectedTz) : null);
        }
      } else {
        setLedRows([]); setLedSelected(null);
      }
    } catch { setLedRows([]); setLedSelected(null); }
    finally { setLedLoading(false); }
  };

  // ── Ledger: initial load ──
  useEffect(() => {
    if (activeTab !== "ledger") return;
    if (location.state?.fromDataQuality && location.state?.affectedRecords) {
      setLedDQState(location.state);
      fetchLedger({});
    } else {
      const myId = localStorage.getItem("memberId") || "";
      if (myId) { setLedFilterField("member_id"); setLedFilterValue(myId); fetchLedger({ member_id: myId }); }
      else fetchLedger({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveLedRow = async (e) => {
    e.preventDefault();
    if (!ledSelected) return;
    setLedSaving(true);
    try {
      const res = await apiPost("save-transactions-ledger.php", { ...ledSelected });
      if (res?.success) {
        alert("Ledger row saved!");
        await fetchLedger(buildLedFilters());
        const pk = ledPrimaryKey(ledSelected);
        const found = ledRows.find(r => ledPrimaryKey(r) === pk);
        if (found) setLedSelected(withDefaultTimezone(found, detectedTz));
      } else {
        alert("Save failed: " + (res?.error || "Unknown error"));
      }
    } catch { alert("Save failed: network/server error"); }
    finally { setLedSaving(false); }
  };

  const deleteLedRow = (row) => {
    const pk = ledPrimaryKey(row);
    if (!pk) { alert("Cannot determine primary key."); return; }
    setLedModal({
      show: true, title: "Delete Ledger Row",
      message: `Delete this ledger row (#${pk})? This action cannot be undone.`,
      confirmText: "Delete", confirmColor: "#dc2626", data: { row },
    });
  };

  const executeLedDelete = async (row) => {
    closeLedModal();
    const pk = ledPrimaryKey(row);
    try {
      const res = await apiPost("delete-transactions-ledger.php", {
        id: row.id, tx_id: row.tx_id, record_id: row.record_id, ledger_id: row.ledger_id,
      });
      if (res?.success) {
        await fetchLedger(buildLedFilters());
        if (ledSelected && ledPrimaryKey(ledSelected) === pk) setLedSelected(null);
      } else {
        setLedModal({ show: true, title: "Delete Failed", message: res?.error || "Unknown error", confirmText: "OK", confirmColor: "#ef4444", data: null });
      }
    } catch {
      setLedModal({ show: true, title: "Delete Failed", message: "Network or server error.", confirmText: "OK", confirmColor: "#ef4444", data: null });
    }
  };

  const handleLedModalConfirm = () => {
    if (!ledModal.data?.row) { closeLedModal(); return; }
    executeLedDelete(ledModal.data.row);
  };

  const handleLedEditClick = (row) => {
    setLedSelected(withDefaultTimezone(row, detectedTz));
    setTimeout(() => ledEditPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const handleLedChange = (e) => {
    const { name, value } = e.target;
    setLedSelected(prev => ({ ...prev, [name]: value }));
  };

  const ledInputPlaceholder =
    ledFilterField === "member_id" ? "e.g. M-12345"
    : ledFilterField === "date"    ? "YYYY-MM-DD"
    : ledFilterField === "tx_type" ? "e.g. points_received"
    : "";

  const ledInputDisabled = ledFilterField === "inbound" || ledFilterField === "outbound";

  // ══════════════════════════════════════════════════════════════════════════════
  // ORDERS TAB STATE
  // ══════════════════════════════════════════════════════════════════════════════

  const [ordOrders, setOrdOrders]               = useState([]);
  const [ordSelected, setOrdSelected]           = useState(null);
  const [ordLoading, setOrdLoading]             = useState(false);
  const [ordSaving, setOrdSaving]               = useState(false);
  const [ordFromDQ, setOrdFromDQ]               = useState(false);
  const [ordAffected, setOrdAffected]           = useState([]);
  const [ordFieldName, setOrdFieldName]         = useState("");
  const [ordTotalAffected, setOrdTotalAffected] = useState(0);
  const [ordFilterField, setOrdFilterField]     = useState("member_id");
  const [ordFilterValue, setOrdFilterValue]     = useState("");
  const [ordFilterStatus, setOrdFilterStatus]   = useState("");
  const [ordViewMode, setOrdViewMode]           = useState("baskets");
  const [ordExpandedBaskets, setOrdExpandedBaskets] = useState(new Set());
  const ordEditPanelRef                         = useRef(null);
  const [ordModal, setOrdModal]                 = useState({ show: false, title: "", message: "", data: null, confirmText: "", confirmColor: "#ef4444" });
  const closeOrdModal = () => setOrdModal(prev => ({ ...prev, show: false }));

  const fetchOrders = useCallback(async (filters = {}) => {
    setOrdLoading(true);
    try {
      const data = await apiPost("get-orders.php", filters);
      if (data?.orders) setOrdOrders(data.orders);
      else setOrdOrders([]);
    } catch { setOrdOrders([]); }
    finally { setOrdLoading(false); }
  }, []);

  const buildOrdFilters = useCallback(() => {
    const f = { sort_by: "placed_at", sort_dir: "DESC", limit: 200 };
    const v = (ordFilterValue || "").trim();
    switch (ordFilterField) {
      case "member_id": if (v) f.member_id = v; break;
      case "order_id":  if (v) f.order_id = parseInt(v, 10); break;
      case "symbol":    if (v) f.symbol = v.toUpperCase(); break;
      case "basket_id": if (v) f.basket_id = v; break;
      case "date": {
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const start = `${v} 00:00:00`;
          const nextDay = new Date(`${v}T00:00:00Z`);
          if (!isNaN(nextDay.getTime())) {
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
            const yyyy = nextDay.getUTCFullYear();
            const mm = String(nextDay.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(nextDay.getUTCDate()).padStart(2, "0");
            f.date_start = start; f.date_end = `${yyyy}-${mm}-${dd} 00:00:00`;
          }
        }
        break;
      }
      default: break;
    }
    if (ordFilterStatus) f.status = ordFilterStatus;
    return f;
  }, [ordFilterField, ordFilterValue, ordFilterStatus]);

  // ── Orders: load when tab switches to "orders" (lazy) ──
  useEffect(() => {
    if (activeTab !== "orders") return;
    if (ordOrders.length > 0) return; // already loaded

    const dq = Boolean(location.state?.fromDataQuality);
    const idsRaw = Array.isArray(location.state?.affectedRecords) ? location.state.affectedRecords : [];
    const ids = idsRaw.map(x => parseInt(String(x), 10)).filter(n => Number.isFinite(n));

    if (dq && ids.length > 0) {
      setOrdFromDQ(true);
      setOrdAffected(ids.map(String));
      setOrdFieldName(location.state?.fieldName || "");
      setOrdTotalAffected(location.state?.totalAffected || ids.length);
      fetchOrders({ order_ids: ids, sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
    } else {
      fetchOrders({ sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOrdApplyFilter = () => {
    setOrdFromDQ(false); setOrdAffected([]); setOrdFieldName(""); setOrdTotalAffected(0);
    fetchOrders(buildOrdFilters());
    setOrdSelected(null);
  };

  const handleOrdClearDQ = () => {
    setOrdFromDQ(false); setOrdAffected([]); setOrdFieldName(""); setOrdTotalAffected(0);
    setOrdSelected(null);
    fetchOrders({ sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
  };

  const handleOrdEditClick = (order) => {
    setOrdSelected({ ...order });
    setTimeout(() => ordEditPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const saveOrder = async (e) => {
    e.preventDefault();
    if (!ordSelected) return;
    setOrdSaving(true);
    try {
      const res = await apiPost("save-order.php", ordSelected);
      if (res?.success) {
        alert("Order saved!");
        ordFromDQ && ordAffected.length > 0
          ? await fetchOrders({ order_ids: ordAffected.map(Number), sort_by: "placed_at", sort_dir: "DESC", limit: 200 })
          : await fetchOrders(buildOrdFilters());
        setOrdSelected(null);
      } else { alert("Save failed: " + (res?.error || "Unknown error")); }
    } catch { alert("Save failed: network/server error"); }
    finally { setOrdSaving(false); }
  };

  const cancelOrder = () => {
    if (!ordSelected) return;
    setOrdModal({
      show: true, title: "Cancel Order",
      message: `Cancel order #${ordSelected.order_id} for member ${ordSelected.member_id}? Status will be set to 'cancelled'.`,
      confirmText: "Cancel Order", confirmColor: "#f59e0b", data: { action: "cancel" },
    });
  };

  const deleteOrder = () => {
    if (!ordSelected) return;
    setOrdModal({
      show: true, title: "Delete Order",
      message: `Permanently delete order #${ordSelected.order_id} for member ${ordSelected.member_id}? This cannot be undone.`,
      confirmText: "Delete", confirmColor: "#ef4444", data: { action: "delete" },
    });
  };

  const doOrdCancel = async () => {
    if (!ordSelected) return;
    setOrdSaving(true);
    try {
      const res = await apiPost("cancelorder.php", { order_id: ordSelected.order_id, action: "cancel" });
      if (res?.success) {
        setOrdSelected(null);
        ordFromDQ && ordAffected.length > 0
          ? await fetchOrders({ order_ids: ordAffected.map(Number), sort_by: "placed_at", sort_dir: "DESC", limit: 200 })
          : await fetchOrders(buildOrdFilters());
      } else { alert("Cancel failed: " + (res?.error || "Unknown error")); }
    } catch { alert("Cancel failed: network/server error"); }
    finally { setOrdSaving(false); }
  };

  const doOrdDelete = async () => {
    if (!ordSelected) return;
    setOrdSaving(true);
    try {
      const res = await apiPost("cancelorder.php", { order_id: ordSelected.order_id, action: "delete" });
      if (res?.success) {
        setOrdSelected(null);
        ordFromDQ && ordAffected.length > 0
          ? await fetchOrders({ order_ids: ordAffected.map(Number), sort_by: "placed_at", sort_dir: "DESC", limit: 200 })
          : await fetchOrders(buildOrdFilters());
      } else { alert("Delete failed: " + (res?.error || "Unknown error")); }
    } catch { alert("Delete failed: network/server error"); }
    finally { setOrdSaving(false); }
  };

  const handleOrdModalConfirm = async () => {
    closeOrdModal();
    if (ordModal.data?.action === "cancel") await doOrdCancel();
    else if (ordModal.data?.action === "delete") await doOrdDelete();
  };

  const ordBasketRollup = useMemo(() => {
    const map = new Map();
    for (const o of ordOrders) {
      const bid = o.basket_id || "unknown";
      if (!map.has(bid)) {
        map.set(bid, {
          basket_id: bid, orders: [], totalAmount: 0, totalPoints: 0, totalShares: 0,
          symbols: [], members: new Set(), merchants: new Set(), broker: o.broker || "-",
          placed_at: o.placed_at, statuses: new Set(), hasAffected: false,
        });
      }
      const b = map.get(bid);
      b.orders.push(o);
      b.totalAmount += parseFloat(o.amount) || 0;
      b.totalPoints += parseInt(o.points_used) || 0;
      b.totalShares += parseFloat(o.shares) || 0;
      if (o.symbol && !b.symbols.includes(o.symbol)) b.symbols.push(o.symbol);
      if (o.member_id) b.members.add(o.member_id);
      if (o.merchant_id) b.merchants.add(o.merchant_id);
      if (o.status) b.statuses.add(o.status.toLowerCase());
      if (ordFromDQ && ordAffected.includes(String(o.order_id))) b.hasAffected = true;
      if (o.placed_at && (!b.placed_at || o.placed_at < b.placed_at)) b.placed_at = o.placed_at;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.placed_at) return 1;
      if (!b.placed_at) return -1;
      return b.placed_at.localeCompare(a.placed_at);
    });
  }, [ordOrders, ordFromDQ, ordAffected]);

  const toggleBasketExpand = (basketId) => {
    setOrdExpandedBaskets(prev => {
      const next = new Set(prev);
      if (next.has(basketId)) next.delete(basketId); else next.add(basketId);
      return next;
    });
  };

  const getBasketStatus = (statuses) => {
    const s = Array.from(statuses);
    if (s.length === 1) return s[0];
    if (s.every(x => x === "settled")) return "settled";
    if (s.includes("failed")) return "partial";
    if (s.includes("pending") || s.includes("queued")) return "pending";
    if (s.every(x => x === "executed" || x === "confirmed" || x === "settled")) return "executed";
    return "mixed";
  };

  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  const ordInputPlaceholder =
    ordFilterField === "member_id" ? "e.g. Utah1220"
    : ordFilterField === "symbol"  ? "e.g. AAPL"
    : ordFilterField === "date"    ? "YYYY-MM-DD"
    : "Enter value";

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="app-container app-content">

      {/* ── Page header ── */}
      <h1 className="page-title">Transactions &amp; Orders Administration</h1>
      <p className="page-deck">
        Review and manage ledger entries and stock orders.
      </p>

      {/* ── Tab switcher ── */}
      <div style={{
        display: "flex", borderRadius: 8, overflow: "hidden",
        border: "1px solid #d1d5db", marginBottom: "1.5rem",
      }}>
        <TabButton label="Transactions Ledger" active={activeTab === "ledger"} onClick={() => setActiveTab("ledger")} />
        <div style={{ width: 1, background: "#d1d5db" }} />
        <TabButton label="Orders" active={activeTab === "orders"} onClick={() => setActiveTab("orders")} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* LEDGER TAB                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "ledger" && (
        <>
          {/* Data Quality Banner */}
          {ledDQState?.fromDataQuality && (
            <div className="card" style={{
              marginBottom: "1rem", backgroundColor: "#fef3c7",
              borderLeft: "4px solid #f59e0b", padding: "1rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.25rem" }}>⚠️</span>
                <strong style={{ color: "#92400e" }}>Data Quality Issue Detected</strong>
              </div>
              <p style={{ margin: 0, color: "#78350f" }}>
                Showing <strong>{ledDQState.totalAffected}</strong> records with missing or invalid{" "}
                <code>{ledDQState.fieldName}</code>.
                {ledDQState.affectedRecords?.length > 0
                  ? <> Currently displaying <strong>{ledDisplayRows.length}</strong> affected records.</>
                  : <> Use filters to locate affected records.</>}
              </p>
              <button
                type="button" className="btn-secondary" style={{ marginTop: "0.5rem" }}
                onClick={() => { setLedDQState(null); setLedFilterField("member_id"); setLedFilterValue(""); fetchLedger({}); }}
              >
                Clear Filter &amp; Show All Records
              </button>
            </div>
          )}

          {/* Filter bar */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <label className="form-label">Filter:</label>
              <select
                className="form-input" style={{ maxWidth: 220 }}
                value={ledFilterField}
                onChange={(e) => {
                  const next = e.target.value;
                  setLedFilterField(next);
                  if (next === "inbound" || next === "outbound") setLedFilterValue("");
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
                type={ledFilterField === "date" ? "date" : "text"}
                placeholder={ledInputPlaceholder}
                value={ledFilterValue}
                onChange={(e) => setLedFilterValue(e.target.value)}
                disabled={ledInputDisabled}
                style={{ maxWidth: 260 }}
              />

              {ledFilterField === "member_id" && (
                <button type="button" className="btn-secondary"
                  onClick={() => setLedFilterValue(localStorage.getItem("memberId") || "")}
                >
                  Use my memberId
                </button>
              )}

              <button type="button" className="btn-primary" onClick={() => fetchLedger(buildLedFilters())}>
                Filter
              </button>
              <button type="button" className="btn-secondary" onClick={() => {
                setLedFilterField("member_id"); setLedFilterValue(""); fetchLedger({});
              }}>
                Clear
              </button>
            </div>
          </div>

          {/* Edit panel */}
          {ledSelected && (
            <div className="card" ref={ledEditPanelRef} style={{ marginBottom: "1rem" }}>
              <h2 className="subheading" style={{ marginTop: 0 }}>
                Edit Ledger Row: {ledPrimaryKey(ledSelected) ?? ""}
              </h2>
              <form onSubmit={saveLedRow} className="form-grid">
                <FormRow label="TX ID">
                  <input className="form-input" type="text" value={ledPrimaryKey(ledSelected) ?? ""} readOnly />
                </FormRow>
                <FormRow label="Member ID">
                  <input className="form-input" name="member_id" type="text" value={ledSelected.member_id ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Order ID">
                  <input className="form-input" name="order_id" type="text" value={ledSelected.order_id ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Merchant ID">
                  <input className="form-input" name="merchant_id" type="text" value={ledSelected.merchant_id ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Broker">
                  <input className="form-input" name="broker" type="text" value={ledSelected.broker ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Client TX ID">
                  <input className="form-input" name="client_tx_id" type="text" value={ledSelected.client_tx_id ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="External Ref">
                  <input className="form-input" name="external_ref" type="text" value={ledSelected.external_ref ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="TX Type">
                  <input className="form-input" name="tx_type" type="text" value={ledSelected.tx_type ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Direction">
                  <input className="form-input" name="direction" type="text" value={ledSelected.direction ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Channel">
                  <input className="form-input" name="channel" type="text" value={ledSelected.channel ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Status">
                  <input className="form-input" name="status" type="text" value={ledSelected.status ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Amount (Points)">
                  <input className="form-input" name="amount_points" type="number" step="0.0001" value={ledSelected.amount_points ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Amount (Cash)">
                  <input className="form-input" name="amount_cash" type="number" step="0.01" value={ledSelected.amount_cash ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Note">
                  <input className="form-input" name="note" type="text" value={ledSelected.note ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Event At (UTC)">
                  <input className="form-input" name="event_at" type="text" placeholder="YYYY-MM-DD HH:MM:SS (UTC)" value={ledSelected.event_at ?? ""} onChange={handleLedChange} />
                </FormRow>
                <FormRow label="Event Time (Local Preview)">
                  <input className="form-input" type="text" value={toLocalZonedString(ledSelected.event_at, ledSelected.member_timezone || detectedTz)} readOnly />
                </FormRow>
                <FormRow label="Member Timezone">
                  <div className="form-inline">
                    <select className="form-input" name="member_timezone" value={ledSelected?.member_timezone ?? ""} onChange={handleLedChange}>
                      <option value="">-- Select Timezone --</option>
                      {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                    <small className="subtext" style={{ marginLeft: "0.5rem" }}>
                      Detected: <strong>{detectedTz}</strong>
                    </small>
                  </div>
                </FormRow>

                <div className="card-actions">
                  <button type="submit" className="btn-primary" disabled={ledSaving}>
                    {ledSaving ? "Saving…" : "Save Row"}
                  </button>
                  <button type="button" className="btn-primary" style={{ background: "#dc2626" }} onClick={() => deleteLedRow(ledSelected)}>
                    Delete Row
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setLedSelected(null)}>
                    Close
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Ledger table */}
          <h2 className="subheading">Ledger Records</h2>
          {ledLoading ? (
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ledDisplayRows.map((r) => {
                    const pk = ledPrimaryKey(r);
                    const localTime = toLocalZonedString(r?.event_at, r?.member_timezone || detectedTz);
                    return (
                      <tr key={pk ?? Math.random()} onClick={() => handleLedEditClick(r)} style={{ cursor: "pointer" }} title="Click to edit this ledger row">
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
                          <div className="subtext">Pts:&nbsp;{r?.amount_points == null ? "-" : Number(r.amount_points).toLocaleString()}</div>
                          <div>Cash: {fmtMoney(r?.amount_cash)}</div>
                        </td>
                        <td>{localTime}</td>
                        <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => deleteLedRow(r)}
                            title="Delete this ledger row"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4, color: "#ef4444", lineHeight: 1 }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#fef2f2"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {ledDisplayRows.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: "1rem" }}>No ledger records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <ConfirmModal
            show={ledModal.show} title={ledModal.title} message={ledModal.message}
            icon={ledModal.icon} confirmText={ledModal.confirmText} confirmColor={ledModal.confirmColor}
            onConfirm={handleLedModalConfirm} onCancel={closeLedModal}
          />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ORDERS TAB                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "orders" && (
        <>
          <ConfirmModal
            show={ordModal.show} title={ordModal.title} message={ordModal.message}
            confirmText={ordModal.confirmText} confirmColor={ordModal.confirmColor}
            onConfirm={handleOrdModalConfirm} onCancel={closeOrdModal}
          />

          {/* DQ Banner */}
          {ordFromDQ && (
            <div className="card" style={{ marginBottom: "1rem", backgroundColor: "#fef3c7", border: "2px solid #f59e0b" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <span style={{ fontSize: "1.5rem" }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: "#92400e" }}>Data Quality Issue:</strong>{" "}
                  <span style={{ color: "#78350f" }}>
                    {ordTotalAffected} orders with missing/invalid{" "}
                    <code style={{ background: "#fde68a", padding: "2px 6px", borderRadius: "3px" }}>{ordFieldName}</code>
                  </span>
                </div>
                <button type="button" className="btn-secondary" onClick={handleOrdClearDQ} style={{ minWidth: 120 }}>
                  Clear Filter
                </button>
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <label className="form-label">Filter:</label>
              <select
                className="form-input" style={{ maxWidth: 220 }}
                value={ordFilterField}
                onChange={(e) => { setOrdFilterField(e.target.value); setOrdFilterValue(""); }}
              >
                <option value="member_id">Member ID</option>
                <option value="order_id">Order ID</option>
                <option value="symbol">Symbol</option>
                <option value="basket_id">Basket ID</option>
                <option value="date">Date (day)</option>
              </select>

              <input
                className="form-input" style={{ maxWidth: 260 }}
                type={ordFilterField === "date" ? "date" : "text"}
                placeholder={ordInputPlaceholder}
                value={ordFilterValue}
                onChange={(e) => setOrdFilterValue(e.target.value)}
              />

              <select
                className="form-input" style={{ maxWidth: 200 }}
                value={ordFilterStatus}
                onChange={(e) => setOrdFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="placed">Placed</option>
                <option value="confirmed">Confirmed</option>
                <option value="executed">Executed</option>
                <option value="settled">Settled</option>
                <option value="sell">Sell</option>
                <option value="sold">Sold</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <button type="button" className="btn-primary" onClick={handleOrdApplyFilter}>Filter</button>
              <button type="button" className="btn-secondary" onClick={() => {
                setOrdFilterField("member_id"); setOrdFilterValue(""); setOrdFilterStatus("");
                setOrdFromDQ(false); setOrdAffected([]); setOrdFieldName(""); setOrdTotalAffected(0);
                setOrdSelected(null);
                fetchOrders({ sort_by: "placed_at", sort_dir: "DESC", limit: 200 });
              }}>
                Clear
              </button>
            </div>
          </div>

          {/* Edit panel */}
          {ordSelected && (
            <div className="card" style={{ marginBottom: "1rem" }} ref={ordEditPanelRef}>
              <h2 className="subheading" style={{ marginTop: 0 }}>
                Edit Order <LineageLink id={String(ordSelected.order_id)} type="order">#{ordSelected.order_id}</LineageLink>
              </h2>
              <form onSubmit={saveOrder} className="form-grid">
                <FormRow label="Order ID">
                  <input type="text" className="form-input" value={ordSelected.order_id || ""} disabled />
                </FormRow>
                <FormRow label="Member ID">
                  <input type="text" className="form-input" value={ordSelected.member_id || ""} onChange={(e) => setOrdSelected({ ...ordSelected, member_id: e.target.value })} required />
                </FormRow>
                <FormRow label="Merchant ID">
                  <input type="text" className="form-input" value={ordSelected.merchant_id || ""} onChange={(e) => setOrdSelected({ ...ordSelected, merchant_id: e.target.value })} />
                </FormRow>
                <FormRow label="Basket ID">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="text" className="form-input" style={{ flex: 1 }} value={ordSelected.basket_id || ""} onChange={(e) => setOrdSelected({ ...ordSelected, basket_id: e.target.value })} required />
                    {ordSelected.basket_id && <LineageLink id={ordSelected.basket_id} type="basket">🔗</LineageLink>}
                  </div>
                </FormRow>
                <FormRow label="Symbol">
                  <input type="text" className="form-input" value={ordSelected.symbol || ""} onChange={(e) => setOrdSelected({ ...ordSelected, symbol: e.target.value.toUpperCase() })} required />
                </FormRow>
                <FormRow label="Shares">
                  <input type="number" step="0.0001" className="form-input" value={ordSelected.shares || ""} onChange={(e) => setOrdSelected({ ...ordSelected, shares: e.target.value })} required />
                </FormRow>
                <FormRow label="Amount ($)">
                  <input type="number" step="0.01" className="form-input" value={ordSelected.amount || ""} onChange={(e) => setOrdSelected({ ...ordSelected, amount: e.target.value })} required />
                </FormRow>
                <FormRow label="Points Used">
                  <input type="number" step="0.01" className="form-input" value={ordSelected.points_used || ""} onChange={(e) => setOrdSelected({ ...ordSelected, points_used: e.target.value })} />
                </FormRow>
                <FormRow label="Status">
                  <select className="form-input" value={ordSelected.status || "pending"} onChange={(e) => setOrdSelected({ ...ordSelected, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="placed">Placed</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="executed">Executed</option>
                    <option value="settled">Settled</option>
                    <option value="sell">Sell</option>
                    <option value="sold">Sold</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </FormRow>
                <FormRow label="Broker">
                  <input type="text" className="form-input" value={ordSelected.broker || ""} onChange={(e) => setOrdSelected({ ...ordSelected, broker: e.target.value })} />
                </FormRow>
                <FormRow label="Order Type">
                  <select className="form-input" value={ordSelected.order_type || "market"} onChange={(e) => setOrdSelected({ ...ordSelected, order_type: e.target.value })}>
                    <option value="market">Market</option>
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                    <option value="sweep">Sweep</option>
                    <option value="gtc">GTC (Good Till Cancelled)</option>
                  </select>
                </FormRow>
                <FormRow label="Member Timezone">
                  <select className="form-input" value={ordSelected.member_timezone || detectedTz} onChange={(e) => setOrdSelected({ ...ordSelected, member_timezone: e.target.value })}>
                    {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Executed Price">
                  <input type="number" step="0.0001" className="form-input" value={ordSelected.executed_price || ""} onChange={(e) => setOrdSelected({ ...ordSelected, executed_price: e.target.value })} placeholder="Fill when executed" />
                </FormRow>
                <FormRow label="Executed Shares">
                  <input type="number" step="0.0001" className="form-input" value={ordSelected.executed_shares || ""} onChange={(e) => setOrdSelected({ ...ordSelected, executed_shares: e.target.value })} placeholder="Fill when executed" />
                </FormRow>
                <FormRow label="Executed Amount ($)">
                  <input type="number" step="0.01" className="form-input" value={ordSelected.executed_amount || ""} onChange={(e) => setOrdSelected({ ...ordSelected, executed_amount: e.target.value })} placeholder="Fill when executed" />
                </FormRow>
                <FormRow label="Paid">
                  <select className="form-input" value={ordSelected.paid_flag || "0"} onChange={(e) => setOrdSelected({ ...ordSelected, paid_flag: e.target.value })}>
                    <option value="0">Not Paid</option>
                    <option value="1">Paid</option>
                  </select>
                </FormRow>
                <FormRow label="Paid Batch ID">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="text" className="form-input" style={{ flex: 1 }} value={ordSelected.paid_batch_id || ""} onChange={(e) => setOrdSelected({ ...ordSelected, paid_batch_id: e.target.value })} placeholder="Optional" />
                    {ordSelected.paid_batch_id && <LineageLink id={ordSelected.paid_batch_id} type="ach">🔗</LineageLink>}
                  </div>
                </FormRow>

                <div style={{ display: "flex", gap: "1rem", marginTop: "1.25rem", gridColumn: "1 / -1", flexWrap: "wrap" }}>
                  <button type="submit" className="btn-primary" disabled={ordSaving}>{ordSaving ? "Saving..." : "Save Order"}</button>
                  <button type="button" className="btn-secondary" onClick={() => setOrdSelected(null)}>Close</button>
                  <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem" }}>
                    <button
                      type="button"
                      disabled={ordSaving || ordSelected.status === "cancelled"}
                      onClick={cancelOrder}
                      style={{
                        padding: "0.5rem 1rem", border: "1px solid #f59e0b", borderRadius: 6,
                        background: "#fef3c7", color: "#92400e", fontWeight: 600, fontSize: "0.875rem",
                        cursor: ordSaving || ordSelected.status === "cancelled" ? "not-allowed" : "pointer",
                        opacity: ordSelected.status === "cancelled" ? 0.5 : 1,
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      <Ban size={14} /> Cancel Order
                    </button>
                    <button
                      type="button" disabled={ordSaving} onClick={deleteOrder}
                      style={{
                        padding: "0.5rem 1rem", border: "1px solid #ef4444", borderRadius: 6,
                        background: "#fef2f2", color: "#991b1b", fontWeight: 600, fontSize: "0.875rem",
                        cursor: ordSaving ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      <Trash2 size={14} /> Delete Order
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* View mode toggle */}
          {!ordLoading && ordOrders.length > 0 && (
            <div style={{ display: "flex", gap: 0, marginBottom: "1rem", borderRadius: 8, overflow: "hidden", border: "1px solid #d1d5db" }}>
              <button type="button" onClick={() => setOrdViewMode("baskets")} style={{ flex: 1, padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", cursor: "pointer", background: ordViewMode === "baskets" ? "#2563eb" : "#f9fafb", color: ordViewMode === "baskets" ? "#fff" : "#374151" }}>
                Basket Summary ({ordBasketRollup.length})
              </button>
              <button type="button" onClick={() => setOrdViewMode("orders")} style={{ flex: 1, padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600, border: "none", borderLeft: "1px solid #d1d5db", cursor: "pointer", background: ordViewMode === "orders" ? "#2563eb" : "#f9fafb", color: ordViewMode === "orders" ? "#fff" : "#374151" }}>
                Individual Orders ({ordOrders.length})
              </button>
            </div>
          )}

          <h2 className="subheading">{ordViewMode === "baskets" ? "Baskets" : "Orders List"}</h2>

          {ordLoading ? (
            <p>Loading...</p>
          ) : ordOrders.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>No orders found</div>
          ) : ordViewMode === "baskets" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ordBasketRollup.map((b) => {
                const isExpanded = ordExpandedBaskets.has(b.basket_id);
                const status = getBasketStatus(b.statuses);
                const memberList = Array.from(b.members);
                const merchantList = Array.from(b.merchants);
                return (
                  <div key={b.basket_id} className="card" style={{ padding: 0, overflow: "hidden", border: b.hasAffected ? "2px solid #f59e0b" : undefined }}>
                    <div onClick={() => toggleBasketExpand(b.basket_id)} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, background: isExpanded ? "#f0f9ff" : b.hasAffected ? "#fffbeb" : "#fff", transition: "background 0.15s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111827", fontFamily: "monospace" }}>
                            <LineageLink id={b.basket_id} type="basket">{b.basket_id}</LineageLink>
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#6b7280", background: "#f3f4f6", borderRadius: 4, padding: "1px 6px" }}>
                            {b.orders.length} order{b.orders.length !== 1 ? "s" : ""}
                          </span>
                          {b.hasAffected && <span style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 600 }}>⚠️ DQ</span>}
                        </div>
                        <span style={getStatusPillStyle(status)}>{status}</span>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.85rem", color: "#374151" }}>
                        <span>Total: <strong>{formatDollars(b.totalAmount)}</strong></span>
                        <span>Points: <strong>{Number(b.totalPoints).toLocaleString()}</strong></span>
                        <span>Shares: <strong>{Number(b.totalShares.toFixed(6))}</strong></span>
                        <span>Broker: <strong>{b.broker}</strong></span>
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.8rem", color: "#6b7280" }}>
                        <span>{memberList.length === 1 ? `Member: ${memberList[0]}` : `${memberList.length} members`}</span>
                        <span>{merchantList.length === 1 ? `Merchant: ${merchantList[0]}` : `${merchantList.length} merchants`}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#6b7280" }}>
                        <span>{b.placed_at ? new Date(b.placed_at).toLocaleString() : "-"}</span>
                        <span>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {b.symbols.map((sym, i) => (
                          <span key={i} style={{ fontSize: "0.78rem", fontWeight: 600, color: "#1e40af", background: "#eff6ff", borderRadius: 4, padding: "2px 8px" }}>{sym}</span>
                        ))}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ borderTop: "1px solid #e5e7eb", overflowX: "auto" }}>
                        <table className="basket-table" style={{ width: "100%", minWidth: "800px", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                          <thead>
                            <tr>
                              <th>Order ID</th><th>Member</th><th>Symbol</th><th>Shares</th>
                              <th style={{ textAlign: "right" }}>Amount</th>
                              <th style={{ textAlign: "right" }}>Points</th>
                              <th style={{ textAlign: "center" }}>Status</th>
                              <th>Placed</th><th>Executed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b.orders.map((order) => {
                              const isAffected = ordFromDQ && ordAffected.includes(String(order.order_id));
                              return (
                                <tr key={order.order_id} onClick={() => handleOrdEditClick(order)} style={{ cursor: "pointer", backgroundColor: isAffected ? "#fef2f2" : "transparent" }} title={isAffected ? `⚠️ Missing ${ordFieldName} - Click to fix` : "Click to edit"}>
                                  <td style={{ fontWeight: 500 }}><LineageLink id={String(order.order_id)} type="order">{order.order_id}</LineageLink></td>
                                  <td>{order.member_id}</td>
                                  <td><strong>{order.symbol}</strong></td>
                                  <td>{order.shares == null ? "-" : parseFloat(order.shares).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                  <td style={{ textAlign: "right" }}>{order.amount == null ? "-" : formatDollars(order.amount)}</td>
                                  <td style={{ textAlign: "right" }}>{order.points_used != null ? Number(order.points_used).toLocaleString() : "-"}</td>
                                  <td style={{ textAlign: "center" }}><span style={getStatusPillStyle(order.status)}>{order.status || "-"}</span></td>
                                  <td style={{ fontSize: "0.8rem" }}>{order.placed_at ? new Date(order.placed_at).toLocaleString() : "-"}</td>
                                  <td>{order.executed_at ? <span style={{ color: "#059669", fontSize: "0.8rem" }}>✓ {new Date(order.executed_at).toLocaleString()}</span> : <Minus size={14} color="#9ca3af" />}</td>
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
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="basket-table">
                <thead>
                  <tr>
                    <th>Order ID</th><th>Member ID</th><th>Symbol</th><th>Shares</th>
                    <th>Amount</th><th>Status</th><th>Placed At</th><th>Executed</th>
                  </tr>
                </thead>
                <tbody>
                  {ordOrders.map((order) => {
                    const isAffected = ordFromDQ && ordAffected.includes(String(order.order_id));
                    return (
                      <tr key={order.order_id} onClick={() => handleOrdEditClick(order)} style={{ cursor: "pointer", backgroundColor: isAffected ? "#fef2f2" : "transparent" }} title={isAffected ? `⚠️ Missing ${ordFieldName} - Click to fix` : "Click to edit"}>
                        <td>{order.order_id}</td>
                        <td>{order.member_id}</td>
                        <td><strong>{order.symbol}</strong></td>
                        <td>{order.shares == null ? "-" : parseFloat(order.shares).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>{order.amount == null ? "-" : formatDollars(order.amount)}</td>
                        <td><span style={getStatusPillStyle(order.status)}>{order.status || "-"}</span></td>
                        <td>{order.placed_at ? new Date(order.placed_at).toLocaleString() : "-"}</td>
                        <td>{order.executed_at ? <span style={{ color: "#059669", fontSize: "0.85rem" }}>✓ {new Date(order.executed_at).toLocaleString()}</span> : <Minus size={14} color="#9ca3af" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
