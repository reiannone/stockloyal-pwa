// src/pages/PaymentsProcessing.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";
import {
  CheckCircle, AlertCircle, Loader2, CreditCard, Building2, Store,
  XCircle, History, RotateCcw, RefreshCw, ChevronUp, ChevronDown,
  ShoppingBasket, FileSpreadsheet, Download, Info, GitBranch,
  ArrowLeft,
} from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function fmtMoney(v) { return `$${safeNum(v).toFixed(2)}`; }
const makeKey = (mid, bid) => (mid && bid) ? `${mid}|${bid}` : mid ? mid : "";

export default function PaymentsProcessing() {
  const location = useLocation();
  const navigate = useNavigate();

  // ── URL params (navigated from Pipeline Cycles) ───────────────────────────
  const params = new URLSearchParams(location.search);
  const urlMerchantId = params.get("merchant_id") || "";
  const urlBrokerId   = params.get("broker_id")   || "";

  // Selected merchant-broker pair
  const [selectedPair, setSelectedPair] = useState(makeKey(urlMerchantId, urlBrokerId));

  // ── Pipeline cycle pairs (for dropdown) ──────────────────────────────────
  const [cycleOptions, setCycleOptions] = useState([]);
  const [cyclesLoading, setCyclesLoading] = useState(false);

  const loadCycles = useCallback(async () => {
    setCyclesLoading(true);
    try {
      const res = await apiPost("pipeline-cycles.php", { action: "list", limit: 100 });
      if (res?.success) {
        const open = (res.cycles || []).filter(c => ["open", "locked"].includes(c.status));
        setCycleOptions(open.map(c => ({
          key:           makeKey(c.merchant_id_str || c.merchant_id, c.broker_id),
          merchant_id:   c.merchant_id_str || c.merchant_id,
          broker_id:     c.broker_id,
          merchant_name: c.merchant_name || c.merchant_id_str || c.merchant_id,
          broker_name:   c.broker_name   || c.broker_id,
          cycle:         c,
        })));
      }
    } catch { /* silent */ }
    finally { setCyclesLoading(false); }
  }, []);

  useEffect(() => { loadCycles(); }, [loadCycles]);

  // ── Funding methods map ───────────────────────────────────────────────────
  const [fundingMethods, setFundingMethods] = useState({});
  useEffect(() => {
    apiGet("get-merchants.php").then(res => {
      const fm = {};
      for (const m of res?.merchants || []) fm[m.merchant_id] = m.funding_method || "manual_ach";
      setFundingMethods(fm);
    }).catch(() => {});
  }, []);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab]   = useState("active");

  const [modal, setModal] = useState({
    show: false, title: "", message: "", details: null,
    icon: null, confirmText: "Confirm", confirmColor: "#3b82f6", onConfirm: null,
  });
  const closeModal         = () => setModal(p => ({ ...p, show: false }));
  const handleModalConfirm = () => { const fn = modal.onConfirm; closeModal(); if (fn) fn(); };

  // ── History ───────────────────────────────────────────────────────────────
  const [history, setHistory]          = useState([]);
  const [historyLoading, setHLoading]  = useState(false);
  const [historyHasMore, setHMore]     = useState(false);
  const [historyTotal, setHTotal]      = useState(0);
  const [cancelProcessing, setCancelP] = useState(false);
  const [cancelResults, setCancelR]    = useState(null);

  const loadHistory = useCallback(async (loadMore = false) => {
    setHLoading(true);
    try {
      const offset = loadMore ? history.length : 0;
      const res = await apiPost("get-approved-batches.php", { limit: 25, offset });
      if (res?.success && Array.isArray(res.batches)) {
        if (loadMore) setHistory(p => [...p, ...res.batches]);
        else setHistory(res.batches);
        setHMore(res.has_more || false);
        setHTotal(res.total || 0);
      } else { if (!loadMore) setHistory([]); setHMore(false); }
    } catch { if (!loadMore) setHistory([]); }
    finally { setHLoading(false); }
  }, [history.length]); // eslint-disable-line

  useEffect(() => { if (activeTab === "history") loadHistory(); }, [activeTab]); // eslint-disable-line

  const handleCancelFunding = async (batchId) => {
    setCancelP(true); setCancelR(null);
    try {
      const res = await apiPost("cancel-payment.php", { batch_id: batchId, remove_ledger: true });
      setCancelR({ success: res?.success || false, batch_id: batchId, orders_cancelled: res?.orders_cancelled || 0, ledger_entries_removed: res?.ledger_entries_removed || 0, error: res?.error || null });
      if (activeTab === "history") loadHistory();
    } catch (err) { setCancelR({ success: false, batch_id: batchId, error: err.message }); }
    finally { setCancelP(false); }
  };

  const confirmCancelBatch = (batch) => setModal({
    show: true, title: "Cancel Funding Batch",
    message: `Reverse batch "${batch.batch_id}"? This will restore ${batch.order_count || "?"} orders back to "approved" status.`,
    details: <div style={{ fontSize: "0.82rem", color: "#991b1b", background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}><strong>This will:</strong> Revert orders to approved, clear funding flags, remove ledger entries.</div>,
    icon: <XCircle size={20} color="#ef4444" />,
    confirmText: "Confirm Cancel", confirmColor: "#ef4444",
    onConfirm: () => handleCancelFunding(batch.batch_id),
  });

  // ── Visible cycles (filtered by selected pair) ────────────────────────────
  const visibleCycles = useMemo(() => {
    if (!selectedPair) return cycleOptions;
    return cycleOptions.filter(o => o.key === selectedPair);
  }, [cycleOptions, selectedPair]);

  const loading = cyclesLoading && cycleOptions.length === 0;

  return (
    <div className="app-container app-content">
      <ConfirmModal
        show={modal.show} title={modal.title} message={modal.message}
        details={modal.details} icon={modal.icon}
        confirmText={modal.confirmText} confirmColor={modal.confirmColor}
        onConfirm={handleModalConfirm} onCancel={closeModal}
      />

      <h1 className="page-title">Fund IB Sweep Account</h1>
      <p className="page-deck">
        Merchant → SL Sweep. One panel per active pipeline cycle, by merchant · broker relationship.
      </p>
      <OrderPipeline currentStep={2} />

      {/* ── Tabs + back button ── */}
      <div style={{
        display: "flex", gap: "0.5rem", marginBottom: "1.5rem",
        borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem",
        justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[
            { key: "active",  label: <><CreditCard size={12} style={{ verticalAlign: "middle" }} /> Active</> },
            { key: "history", label: <><History    size={12} style={{ verticalAlign: "middle" }} /> History</> },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: "0.5rem 1rem",
              background: activeTab === t.key ? "#3b82f6" : "transparent",
              color: activeTab === t.key ? "#fff" : "#64748b",
              border: "none", borderRadius: "6px", fontWeight: "500", cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
        <button onClick={() => navigate("/pipeline-cycles")} style={{
          display: "inline-flex", alignItems: "center", gap: "0.4rem",
          padding: "0.4rem 0.75rem", background: "none",
          border: "1px solid #d1d5db", borderRadius: "6px",
          color: "#6b7280", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
        }}>
          <ArrowLeft size={13} /> Pipeline Cycle Control Panel
        </button>
      </div>

      {/* ── Cancel results banner ── */}
      {cancelResults && (
        <div style={{ background: cancelResults.success ? "#fef3c7" : "#fef2f2", border: `2px solid ${cancelResults.success ? "#f59e0b" : "#ef4444"}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            {cancelResults.success ? <RotateCcw size={20} color="#f59e0b" /> : <AlertCircle size={20} color="#ef4444" />}
            <strong style={{ color: cancelResults.success ? "#92400e" : "#991b1b" }}>{cancelResults.success ? "Funding Cancelled" : "Cancel Failed"}</strong>
          </div>
          {cancelResults.success
            ? <div style={{ fontSize: "0.85rem", color: "#78350f" }}>Batch: <code>{cancelResults.batch_id}</code> · Orders reverted: <strong>{cancelResults.orders_cancelled}</strong> · Ledger removed: <strong>{cancelResults.ledger_entries_removed}</strong></div>
            : <div style={{ color: "#991b1b" }}>{cancelResults.error}</div>}
          <button onClick={() => setCancelR(null)} style={{ marginTop: 8, padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", fontSize: "0.8rem" }}>Dismiss</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ACTIVE TAB                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "active" && (
        <>
          {/* Toolbar */}
          <div style={{
            display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap",
            marginBottom: "1.25rem", padding: "0.75rem 1rem",
            background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Merchant · Broker
              </label>
              <select
                value={selectedPair}
                onChange={e => setSelectedPair(e.target.value)}
                style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.85rem", minWidth: 260 }}
              >
                <option value="">All Active Cycles</option>
                {cycleOptions.map(opt => (
                  <option key={opt.key} value={opt.key}>
                    {opt.merchant_name} · {opt.broker_name}
                  </option>
                ))}
                {urlMerchantId && !cycleOptions.find(o => o.merchant_id === urlMerchantId) && (
                  <option value={makeKey(urlMerchantId, urlBrokerId)}>
                    {urlMerchantId}{urlBrokerId ? ` · ${urlBrokerId}` : ""}
                  </option>
                )}
              </select>
            </div>
            <button onClick={loadCycles} disabled={cyclesLoading} style={{
              padding: "0.5rem 1rem", background: "#3b82f6", color: "#fff",
              border: "none", borderRadius: "6px", fontWeight: 600,
              fontSize: "0.85rem", cursor: cyclesLoading ? "not-allowed" : "pointer",
              opacity: cyclesLoading ? 0.6 : 1,
            }}>
              {cyclesLoading ? "Loading..." : <><RefreshCw size={14} style={{ verticalAlign: "middle" }} /> Refresh</>}
            </button>
          </div>

          {/* Cycle panels */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ marginTop: 8 }}>Loading pipeline cycles…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : cycleOptions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", background: "#f8fafc", borderRadius: 8, border: "2px dashed #cbd5e1" }}>
              <GitBranch size={32} color="#94a3b8" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "#64748b" }}>No active pipeline cycles</div>
              <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: 4 }}>Open a cycle in Pipeline Management first.</div>
              <button onClick={() => navigate("/pipeline-cycles")} style={{ marginTop: 12, padding: "8px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.85rem" }}>Pipeline Management</button>
            </div>
          ) : visibleCycles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              No active cycle for the selected merchant · broker pair.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {visibleCycles.map(opt => (
                <CyclePaymentPanel
                  key={opt.key}
                  cycleOpt={opt}
                  fundingMethod={fundingMethods[opt.merchant_id] || "manual_ach"}
                  processing={processing}
                  setProcessing={setProcessing}
                  setModal={setModal}
                  closeModal={closeModal}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HISTORY TAB                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {historyLoading && history.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading funding history...</div>
          ) : history.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>No funding batches found.</div>
          ) : (
            <>
              <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Showing {history.length} of {historyTotal} batch(es)</div>
              {history.map(batch => <PaymentHistoryCard key={batch.batch_id} batch={batch} processing={cancelProcessing} onCancel={() => confirmCancelBatch(batch)} />)}
              {historyHasMore && <button onClick={() => loadHistory(true)} disabled={historyLoading} style={{ padding: "0.75rem", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontSize: "0.85rem" }}>{historyLoading ? "Loading..." : "Load More"}</button>}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, fontSize: "0.8rem", color: "#1e40af" }}>
        <strong><Info size={14} style={{ verticalAlign: "middle" }} /> IB Sweep Funding:</strong> One panel per active pipeline cycle. <strong>Plaid merchants</strong> debit via ACH automatically. <strong>Manual ACH merchants</strong> export XLSX + CSV files. Orders marked <code>funded</code> after processing.
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// CyclePaymentPanel — one card per pipeline cycle (merchant × broker)
// ═══════════════════════════════════════════════════════════════════════════

function CyclePaymentPanel({ cycleOpt, fundingMethod, processing, setProcessing, setModal, closeModal }) {
  const [orders, setOrders]                 = useState([]);
  const [summary, setSummary]               = useState([]);
  const [loading, setLoading]               = useState(false);
  const [expanded, setExpanded]             = useState(true);
  const [processResults, setProcessResults] = useState([]);

  const mid    = cycleOpt.merchant_id;
  const bid    = cycleOpt.broker_id;
  const isPlaid = fundingMethod === "plaid";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("get-payments.php", { merchant_id: mid });
      if (res?.success) {
        const allOrders = res.orders || [];
        // Scope to this cycle's broker client-side
        const filtered = bid
          ? allOrders.filter(o => {
              const obroker = (o.broker || "").toLowerCase();
              return obroker === bid.toLowerCase() || (o.broker_id || "") === bid;
            })
          : allOrders;
        setOrders(filtered.map(o => ({ ...o, merchant_name: cycleOpt.merchant_name })));
        setSummary(Array.isArray(res.summary) ? res.summary : []);
      } else { setOrders([]); setSummary([]); }
    } catch { setOrders([]); setSummary([]); }
    finally { setLoading(false); }
  }, [mid, bid, cycleOpt.merchant_name]);

  useEffect(() => { load(); }, [load]);

  const totalAmount     = useMemo(() => orders.reduce((s, o) => s + safeNum(o?.payment_amount ?? o?.executed_amount ?? o?.amount ?? 0), 0), [orders]);
  const memberCount     = useMemo(() => new Set(orders.map(o => o.member_id).filter(Boolean)).size, [orders]);
  const brokerDetailsMap = useMemo(() => {
    const map = {};
    for (const s of summary) { const b = (s?.broker || "Unknown").trim(); if (!map[b]) map[b] = { ach_bank_name: s.ach_bank_name || "", ach_routing_num: s.ach_routing_num || "", ach_account_num: s.ach_account_num || "", ach_account_type: s.ach_account_type || "" }; }
    return map;
  }, [summary]);

  const processBroker = async (broker) => {
    if (!orders.filter(o => o.broker === broker).length) return { merchant_id: mid, broker, success: false, skipped: true, error: "No orders" };
    try {
      if (isPlaid) {
        const res = await apiPost("plaid-initiate-funding.php", { merchant_id: mid, broker });
        return { merchant_id: mid, broker, funding_method: "plaid", success: res?.success || false, ...res };
      } else {
        const res = await apiPost("export-payments-file.php", { merchant_id: mid, broker });
        return { merchant_id: mid, broker, funding_method: "manual_ach", success: res?.success || false, ...res };
      }
    } catch (err) { return { merchant_id: mid, broker, success: false, error: err.message }; }
  };

  const doProcess = async (brokerFilter = null) => {
    setProcessing(true); setProcessResults([]);
    try {
      const brokers = brokerFilter ? [brokerFilter] : Array.from(new Set(orders.map(o => o.broker).filter(Boolean)));
      const results = [];
      for (const br of brokers) results.push(await processBroker(br));
      setProcessResults(results);
      await load();
    } finally { setProcessing(false); }
  };

  const confirmAll    = () => setModal({ show: true, title: isPlaid ? "Plaid ACH Debit" : "Fund Merchant to IB Sweep", message: `Process IB sweep funding for ${cycleOpt.merchant_name}: ${orders.length} orders totaling ${fmtMoney(totalAmount)}.`, icon: isPlaid ? <Zap size={20} color="#8b5cf6" /> : <Store size={20} color="#8b5cf6" />, confirmText: "Confirm & Process", confirmColor: "#10b981", onConfirm: () => doProcess() });
  const confirmBroker = (broker, count, amount) => setModal({ show: true, title: isPlaid ? "Plaid ACH Debit — Broker" : "Fund Broker to IB Sweep", message: `Process ${count} orders (${fmtMoney(amount)}) for broker "${broker}" under ${cycleOpt.merchant_name}.`, icon: isPlaid ? <Zap size={20} color="#f59e0b" /> : <Building2 size={20} color="#f59e0b" />, confirmText: "Confirm & Process", confirmColor: "#f59e0b", onConfirm: () => doProcess(broker) });

  // Stage status pills from cycle data
  const cycle         = cycleOpt.cycle;
  const isFundingDone = cycle?.stage_payment === "completed" && cycle?.stage_funding === "completed";
  const stageBadge    = (label, status) => {
    const c = { pending: { bg: "#f8fafc", fg: "#94a3b8", bd: "#e2e8f0" }, in_progress: { bg: "#eff6ff", fg: "#2563eb", bd: "#bfdbfe" }, completed: { bg: "#f0fdf4", fg: "#16a34a", bd: "#bbf7d0" }, failed: { bg: "#fef2f2", fg: "#dc2626", bd: "#fecaca" } }[status] || { bg: "#f8fafc", fg: "#94a3b8", bd: "#e2e8f0" };
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: "0.68rem", fontWeight: 700, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, whiteSpace: "nowrap" }}>{label}: {status}</span>;
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      {/* Header */}
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "12px 16px", background: expanded ? "#f8fafc" : "#fff", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderBottom: expanded ? "1px solid #e2e8f0" : "none" }}>
        <Store size={18} color="#8b5cf6" />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>{cycleOpt.merchant_name}</span>
            <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>·</span>
            <Building2 size={13} color="#6366f1" />
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#4338ca" }}>{cycleOpt.broker_name}</span>
            {isPlaid && <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#ede9fe", color: "#7c3aed" }}>⚡ Plaid</span>}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {loading ? "Loading…" : <><span>{orders.length} orders · {memberCount} members · {fmtMoney(totalAmount)}</span></>}
            {cycle && stageBadge("Payment", cycle.stage_payment || "pending")}
            {cycle && stageBadge("Funding", cycle.stage_funding  || "pending")}
          </div>
        </div>

        {loading ? (
          <Loader2 size={16} color="#94a3b8" style={{ animation: "spin 1s linear infinite" }} />
        ) : isFundingDone ? (
          <span style={{ fontSize: "0.72rem", color: "#16a34a", fontWeight: 600 }}>✓ Funded</span>
        ) : orders.length > 0 ? (
          <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
            <button onClick={confirmAll} disabled={processing} style={fundBtn(processing ? "#94a3b8" : "#10b981")}><CreditCard size={12} style={{ verticalAlign: "middle" }} /> Fund</button>
            <button onClick={e => { e.stopPropagation(); load(); }} disabled={loading} style={{ padding: "6px 10px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: "0.8rem", cursor: "pointer" }}><RefreshCw size={12} /></button>
          </div>
        ) : !loading ? (
          <span style={{ fontSize: "0.72rem", color: "#16a34a", fontWeight: 600 }}>✓ All funded</span>
        ) : null}
        {expanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: "12px" }}>
          <ResultsBanner results={processResults} onDismiss={() => setProcessResults([])} />
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /></div>
          ) : orders.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#16a34a", background: "#f0fdf4", borderRadius: 6 }}>
              <CheckCircle size={20} color="#10b981" style={{ marginBottom: 4 }} /><br />No in-flight orders for this cycle.
            </div>
          ) : (
            <PaymentsHierarchy
              orders={orders}
              brokerDetailsMap={brokerDetailsMap}
              processing={processing}
              onProcessAll={confirmAll}
              onProcessBroker={(broker, count, amount) => confirmBroker(broker, count, amount)}
            />
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// PaymentsHierarchy — Broker → Basket → Orders (merchant already scoped by panel)
// ═══════════════════════════════════════════════════════════════════════════

function PaymentsHierarchy({ orders, brokerDetailsMap = {}, processing, onProcessAll, onProcessBroker }) {
  const [expandedBrokers, setExpandedBrokers] = useState(new Set());
  const [expandedBaskets, setExpandedBaskets] = useState(new Set());
  const [showAch, setShowAch]                 = useState(new Set());

  const toggle = (setter, key) => setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const getAmt = o => safeNum(o?.payment_amount ?? o?.executed_amount ?? o?.amount ?? 0);

  const badge = (text, bg, color) => (
    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: bg, color, whiteSpace: "nowrap" }}>{text}</span>
  );
  const rowBase = depth => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", paddingLeft: `${12 + depth * 24}px`,
    cursor: "pointer", fontSize: "0.82rem", borderBottom: "1px solid #f1f5f9",
  });
  const statusColor = status => ({ approved: { bg: "#dbeafe", fg: "#1d4ed8" }, funded: { bg: "#d1fae5", fg: "#065f46" }, placed: { bg: "#ede9fe", fg: "#5b21b6" }, submitted: { bg: "#e0f2fe", fg: "#0369a1" }, confirmed: { bg: "#f0fdf4", fg: "#15803d" } }[status] || { bg: "#f3f4f6", fg: "#374151" });

  // Build broker → basket → orders hierarchy
  const hierarchy = {};
  for (const o of orders) {
    const br = o.broker || "Unknown";
    const bk = o.basket_id || "no-basket";
    if (!hierarchy[br]) hierarchy[br] = { broker: br, baskets: {}, orders: [], totalAmount: 0, memberSet: new Set() };
    hierarchy[br].orders.push(o); hierarchy[br].totalAmount += getAmt(o); hierarchy[br].memberSet.add(o.member_id);
    if (!hierarchy[br].baskets[bk]) hierarchy[br].baskets[bk] = { basket_id: bk, member_id: o.member_id, orders: [], totalAmount: 0 };
    hierarchy[br].baskets[bk].orders.push(o); hierarchy[br].baskets[bk].totalAmount += getAmt(o);
  }

  const pills = row => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {row.memberSet && badge(`${row.memberSet.size} mbrs`, "#f0f9ff", "#0369a1")}
      {badge(`${row.orders.length} orders`, "#faf5ff", "#7c3aed")}
      {badge(fmtMoney(row.totalAmount), "#f0fdf4", "#15803d")}
    </div>
  );

  return (
    <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "0.5rem 0.75rem", background: "#f8fafc", fontWeight: 600, fontSize: "0.8rem", borderBottom: "1px solid #e2e8f0", color: "#374151", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{Object.keys(hierarchy).length} broker(s) · {orders.length} orders</span>
        <button onClick={onProcessAll} disabled={processing} style={{ ...smallBtnStyle, background: "#10b981", padding: "3px 12px" }}>
          <CreditCard size={11} style={{ verticalAlign: "middle" }} /> Fund All
        </button>
      </div>

      {Object.keys(hierarchy).sort().map(brKey => {
        const br = hierarchy[brKey];
        const brOpen  = expandedBrokers.has(brKey);
        const achOpen = showAch.has(brKey);
        const achDets = brokerDetailsMap[brKey];

        return (
          <div key={brKey}>
            {/* Broker row */}
            <div onClick={() => toggle(setExpandedBrokers, brKey)} style={{ ...rowBase(0), fontWeight: 600, background: brOpen ? "#faf5ff" : "#fff" }} onMouseEnter={e => (e.currentTarget.style.background = "#faf5ff")} onMouseLeave={e => (e.currentTarget.style.background = brOpen ? "#faf5ff" : "#fff")}>
              <Building2 size={14} color="#6366f1" />
              <span style={{ color: "#1e293b" }}>{brKey}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                {pills(br)}
                {achDets && <button onClick={e => { e.stopPropagation(); toggle(setShowAch, brKey); }} style={{ ...smallBtnStyle, background: achOpen ? "#dbeafe" : "#f1f5f9", color: achOpen ? "#1d4ed8" : "#475569", border: `1px solid ${achOpen ? "#93c5fd" : "#cbd5e1"}` }}>ACH</button>}
                <button onClick={e => { e.stopPropagation(); onProcessBroker(brKey, br.orders.length, br.totalAmount); }} disabled={processing} style={{ ...smallBtnStyle, background: "#f59e0b", color: "#fff" }}><CreditCard size={11} style={{ verticalAlign: "middle" }} /> Process</button>
                {brOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
              </div>
            </div>

            {/* ACH strip */}
            {achOpen && achDets && (
              <div style={{ paddingLeft: "36px", paddingRight: 12, paddingTop: 6, paddingBottom: 6, background: "#eff6ff", borderBottom: "1px solid #dbeafe", fontSize: "0.78rem", display: "flex", gap: 24, flexWrap: "wrap" }}>
                <span>Bank: <strong>{achDets.ach_bank_name || "-"}</strong></span>
                <span>Routing: <strong>{achDets.ach_routing_num || "-"}</strong></span>
                <span>Account: <strong>{achDets.ach_account_num || "-"}</strong></span>
                <span>Type: <strong>{achDets.ach_account_type || "-"}</strong></span>
              </div>
            )}

            {/* Baskets */}
            {brOpen && Object.keys(br.baskets).sort().map(bkId => {
              const bk    = br.baskets[bkId];
              const bkOpen = expandedBaskets.has(bkId);
              return (
                <div key={bkId}>
                  <div onClick={() => toggle(setExpandedBaskets, bkId)} style={{ ...rowBase(1), background: bkOpen ? "#fffbeb" : "#fff" }} onMouseEnter={e => (e.currentTarget.style.background = "#fffbeb")} onMouseLeave={e => (e.currentTarget.style.background = bkOpen ? "#fffbeb" : "#fff")}>
                    <ShoppingBasket size={14} color="#d97706" />
                    <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>{bkId}</span>
                    {bk.member_id && badge(`member: ${bk.member_id}`, "#fef3c7", "#92400e")}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      {badge(`${bk.orders.length} orders`, "#faf5ff", "#7c3aed")}
                      {badge(fmtMoney(bk.totalAmount), "#f0fdf4", "#15803d")}
                      {bkOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                    </div>
                  </div>

                  {/* Orders table */}
                  {bkOpen && (
                    <div style={{ paddingLeft: `${12 + 2 * 24}px`, paddingRight: 12, paddingBottom: 4 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={thStyle}>Order</th><th style={thStyle}>Symbol</th><th style={thStyle}>Amount</th><th style={thStyle}>Exec</th><th style={thStyle}>Shares</th><th style={thStyle}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bk.orders.map((o, i) => {
                            const sc = statusColor(o.status);
                            return (
                              <tr key={o.order_id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>#{o.order_id}</td>
                                <td style={{ ...tdStyle, fontWeight: 600 }}>{o.symbol}</td>
                                <td style={tdStyle}>{fmtMoney(o.amount)}</td>
                                <td style={{ ...tdStyle, fontWeight: 600 }}>{o.executed_amount != null ? fmtMoney(o.executed_amount) : "—"}</td>
                                <td style={tdStyle}>{safeNum(o.shares).toFixed(4)}</td>
                                <td style={tdStyle}><span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: sc.bg, color: sc.fg }}>{o.status}</span></td>
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
        );
      })}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// PaymentHistoryCard
// ═══════════════════════════════════════════════════════════════════════════

function PaymentHistoryCard({ batch, processing, onCancel }) {
  const [expanded, setExpanded] = useState(false);
  const b = batch;
  return (
    <div style={{ background: "#fff", borderRadius: 8, border: `1px solid ${expanded ? "#3b82f6" : "#e2e8f0"}`, overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "0.75rem 1rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: expanded ? "#eff6ff" : "#fff" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>{b.batch_id}</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#d1fae5", color: "#059669" }}>{b.order_count || 0} orders</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#f0fdf4", color: "#15803d" }}>{fmtMoney(b.total_amount)}</span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "#64748b" }}>
            <span>{b.merchant_id}</span><span>Broker: <strong>{b.broker}</strong></span><span>{b.paid_at}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={e => { e.stopPropagation(); onCancel(); }} disabled={processing} style={{ padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 4, cursor: "pointer", fontSize: "0.7rem", fontWeight: 600 }}><RotateCcw size={11} style={{ verticalAlign: "middle" }} /> Cancel</button>
          {expanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem 1rem", fontSize: "0.82rem" }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", color: "#475569" }}>
            <span>Batch: <code style={{ fontSize: "0.75rem" }}>{b.batch_id}</code></span>
            <span>Merchant: <strong>{b.merchant_id}</strong></span>
            <span>Broker: <strong>{b.broker}</strong></span>
            <span>Orders: <strong>{b.order_count}</strong></span>
            <span>Amount: <strong>{fmtMoney(b.total_amount)}</strong></span>
            <span>Paid: <strong>{b.paid_at}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// ResultsBanner
// ═══════════════════════════════════════════════════════════════════════════

function ResultsBanner({ results, onDismiss }) {
  if (!results || results.length === 0) return null;
  const successful  = results.filter(r => r.success);
  const failed      = results.filter(r => !r.success && !r.skipped);
  const totalAmount = successful.reduce((s, r) => s + safeNum(r.total_amount), 0);
  const totalOrders = successful.reduce((s, r) => s + safeNum(r.order_count), 0);

  const handleDownload = (fileObj) => {
    if (!fileObj?.url) return;
    let url = fileObj.url;
    if (!url.startsWith("http")) { const base = window.__VITE_API_BASE__ || "https://api.stockloyal.com/api"; url = `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "").replace(/^api\/+/, "")}`; }
    const a = document.createElement("a"); a.href = url; a.download = fileObj.filename || "download"; a.style.display = "none"; document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100);
  };

  return (
    <div style={{ background: successful.length > 0 ? "#ecfdf5" : "#fef2f2", border: `2px solid ${successful.length > 0 ? "#10b981" : "#ef4444"}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {successful.length > 0 ? <CheckCircle size={20} color="#10b981" /> : <AlertCircle size={20} color="#ef4444" />}
        <span style={{ fontWeight: 700, color: successful.length > 0 ? "#065f46" : "#991b1b" }}>Complete — {successful.length} OK · {failed.length} failed · {fmtMoney(totalAmount)} · {totalOrders} orders</span>
      </div>
      {results.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: "0.82rem", flexWrap: "wrap" }}>
          {r.success ? <CheckCircle size={14} color="#10b981" /> : <AlertCircle size={14} color="#ef4444" />}
          <span style={{ fontWeight: 600 }}>{r.broker}</span>
          {r.success ? (
            <>
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{r.order_count} orders · {fmtMoney(r.total_amount)}</span>
              {r.funding_method === "plaid" && r.transfer_id && <span style={{ fontSize: "0.7rem", padding: "1px 8px", borderRadius: 4, background: "#ede9fe", color: "#7c3aed" }}>⚡ {r.transfer_id.slice(0, 12)}…</span>}
              {r.funding_method !== "plaid" && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {r.xlsx?.url && <button onClick={() => handleDownload(r.xlsx)} style={{ ...dlBtnStyle, background: "#059669" }}><FileSpreadsheet size={11} style={{ verticalAlign: "middle" }} /> XLSX</button>}
                  {r.ach_csv?.url && <button onClick={() => handleDownload(r.ach_csv)} style={{ ...dlBtnStyle, background: "#64748b" }}><Download size={11} style={{ verticalAlign: "middle" }} /> ACH</button>}
                </div>
              )}
            </>
          ) : (
            <span style={{ color: "#991b1b", fontSize: "0.78rem" }}>{r.error}</span>
          )}
        </div>
      ))}
      <button onClick={onDismiss} style={{ marginTop: 8, padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", fontSize: "0.8rem" }}>Dismiss</button>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Shared styles
// ═══════════════════════════════════════════════════════════════════════════

const thStyle      = { padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1px solid #e2e8f0" };
const tdStyle      = { padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "#334155" };
const smallBtnStyle = { padding: "2px 10px", color: "#fff", border: "none", borderRadius: 4, fontSize: "0.68rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
const dlBtnStyle   = { padding: "3px 10px", color: "#fff", border: "none", borderRadius: 4, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
const fundBtn      = bg => ({ padding: "6px 14px", background: bg, color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" });
