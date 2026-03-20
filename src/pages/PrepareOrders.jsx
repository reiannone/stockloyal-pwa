import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";
import { LineageLink } from "../components/LineagePopup";
import {
  ArrowRight, CirclePlay, RefreshCw, CheckCircle2, XCircle, Trash2, Bomb,
  AlertTriangle, HelpCircle, ChevronUp, ChevronDown, Building2, ShoppingBasket,
  Package, Loader2, Unlock, Lock, Play, Plus, CreditCard,
} from "lucide-react";

/**
 * PrepareOrders — Admin page for staged order preparation
 *
 * One card per open pipeline cycle (merchant · broker pair).
 * Each card manages its own trial run, refresh, approve, and discard.
 * "Run All Trials" runs prepare for every open cycle sequentially.
 *
 * Workflow per cycle:
 *   1. Run Trial   → INSERT into prepared_orders (staged)
 *   2. Review      → Expandable hierarchy inside card
 *   3. Approve     → Move staged → orders (approved), pipeline advances
 *   4. Discard     → Mark batch discarded (soft delete)
 */

const makeKey = (mid, bid) => (mid && bid) ? `${mid}|${bid}` : mid ? mid : "";

export default function PrepareOrders() {
  const location = useLocation();
  const navigate = useNavigate();

  const params        = new URLSearchParams(location.search);
  const urlMerchantId = params.get("merchant_id") || "";
  const urlBrokerId   = params.get("broker_id")   || "";

  const [activeTab, setActiveTab] = useState("cycles");

  // ── Pipeline cycles ──────────────────────────────────────────────────────
  const [cycleOptions,     setCycleOptions]     = useState([]);
  const [cyclesLoading,    setCyclesLoading]    = useState(true);

  const loadCycles = useCallback(() => {
    setCyclesLoading(true);
    apiPost("pipeline-cycles.php", { action: "list", limit: 100 })
      .then(res => {
        if (!res?.success) return;
        const open = (res.cycles || []).filter(c => ["open", "locked"].includes(c.status));
        setCycleOptions(open.map(c => ({
          key:           makeKey(c.merchant_id_str, c.broker_id),
          merchant_id:   c.merchant_id_str,
          broker_id:     c.broker_id,
          merchant_name: c.merchant_name || c.merchant_id_str,
          broker_name:   c.broker_name   || c.broker_id,
          funding_method: c.funding_method,
          cycle:         c,
        })));
      })
      .catch(() => {})
      .finally(() => setCyclesLoading(false));
  }, []);

  useEffect(() => { loadCycles(); }, [loadCycles]);

  // ── All available merchant-broker pairs (from get_options) ───────────────
  const [allPairs,     setAllPairs]     = useState([]); // [{ key, record_id, merchant_id, merchant_name, broker_id, broker_name, default_funding }]
  const [optLoading,   setOptLoading]   = useState(true);

  const loadOptions = useCallback(() => {
    setOptLoading(true);
    apiPost("pipeline-cycles.php", { action: "get_options" })
      .then(res => {
        if (!res?.success) return;
        const merchants       = res.merchants        || [];
        const brokers         = res.brokers          || [];
        const merchantBrokers = res.merchant_brokers || {};
        const pairs = [];
        for (const m of merchants) {
          const linkedIds = merchantBrokers[m.merchant_id] ?? null;
          const eligible  = linkedIds
            ? brokers.filter(b => linkedIds.includes(b.broker_id))
            : brokers;
          for (const b of eligible) {
            pairs.push({
              key:             makeKey(m.merchant_id, b.broker_id),
              record_id:       m.record_id,
              merchant_id:     m.merchant_id,
              merchant_name:   m.merchant_name,
              broker_id:       b.broker_id,
              broker_name:     b.broker_name,
              default_funding: "plaid",
            });
          }
        }
        setAllPairs(pairs);
      })
      .catch(() => {})
      .finally(() => setOptLoading(false));
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // ── Initiate state ───────────────────────────────────────────────────────
  const [selectedNewPair,     setSelectedNewPair]     = useState("");
  const [selectedFunding,     setSelectedFunding]     = useState("plaid");
  const [initiating,          setInitiating]          = useState(false);
  const [initiateAllLoading,  setInitiateAllLoading]  = useState(false);
  const [initiateError,       setInitiateError]       = useState(null);

  // Available pairs = allPairs that don't have an active open/locked cycle
  const activeCycleKeys = new Set(cycleOptions.map(c => c.key));
  const availablePairs  = allPairs.filter(p => !activeCycleKeys.has(p.key));

  // Open a single cycle then immediately run the trial
  const openAndRunCycle = async (pair, fundingMethod) => {
    const key = pair.key;
    setInitiateError(null);
    // Step 1: open cycle
    const openRes = await apiPost("pipeline-cycles.php", {
      action:              "open",
      merchant_record_id:  pair.record_id,
      broker_id:           pair.broker_id,
      funding_method:      fundingMethod || "plaid",
      label:               `${pair.merchant_name} – ${pair.broker_name} – ${new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' })}`,
    });
    if (!openRes?.success) throw new Error(openRes?.error || "Failed to open cycle.");

    // Step 2: reload cycles so the new one appears in cycleOptions
    await new Promise(resolve => {
      apiPost("pipeline-cycles.php", { action: "list", limit: 100 }).then(res => {
        if (res?.success) {
          const open = (res.cycles || []).filter(c => ["open", "locked"].includes(c.status));
          const opts = open.map(c => ({
            key:            makeKey(c.merchant_id_str, c.broker_id),
            merchant_id:    c.merchant_id_str,
            broker_id:      c.broker_id,
            merchant_name:  c.merchant_name || c.merchant_id_str,
            broker_name:    c.broker_name   || c.broker_id,
            funding_method: c.funding_method,
            cycle:          c,
          }));
          setCycleOptions(opts);
        }
        resolve();
      }).catch(resolve);
    });

    // Step 3: run prepare for this pair
    const cycleOpt = { key, merchant_id: pair.merchant_id, broker_id: pair.broker_id };
    await executePrepareForCycle(cycleOpt);
  };

  const handleInitiateSelected = async () => {
    const pair = availablePairs.find(p => p.key === selectedNewPair);
    if (!pair) return;
    setInitiating(true);
    try {
      await openAndRunCycle(pair, selectedFunding);
      setSelectedNewPair("");
    } catch (e) {
      setInitiateError(e.message);
    }
    setInitiating(false);
  };

  const handleInitiateAll = async () => {
    setInitiateAllLoading(true);
    setInitiateError(null);
    for (const pair of availablePairs) {
      try {
        await openAndRunCycle(pair, selectedFunding);
      } catch (e) {
        setInitiateError(`${pair.merchant_name} · ${pair.broker_name}: ${e.message}`);
      }
    }
    setInitiateAllLoading(false);
  };

  // ── Per-cycle running state & results ────────────────────────────────────
  // cycleRunning: { [key]: bool }
  // cycleResults: { [key]: last prepare api response }
  const [cycleRunning, setCycleRunning] = useState({});
  const [cycleResults, setCycleResults] = useState({});
  const [runAllLoading,     setRunAllLoading]     = useState(false);
  const [approveAllLoading, setApproveAllLoading] = useState(false);
  // Bumped after any stage update so OrderPipeline re-fetches immediately
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  // ── Batches (all, reloaded after each action) ────────────────────────────
  const [batches,       setBatches]       = useState([]);
  const [batchesLoading,setBatchesLoading]= useState(false);
  const [batchesError,  setBatchesError]  = useState(null);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [batchStats,    setBatchStats]    = useState(null);
  const [statsLoading,  setStatsLoading]  = useState(false);

  // Batches tab filter (separate from cycle cards)
  const [batchFilter, setBatchFilter] = useState(makeKey(urlMerchantId, urlBrokerId));

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const res = await apiPost("prepare_orders.php", { action: "batches", limit: 50 });
      if (res.success) setBatches(res.batches || []);
      else setBatchesError(res.error || "Failed to load batches.");
    } catch (err) {
      setBatchesError("Network/API error: " + err.message);
    }
    setBatchesLoading(false);
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // Auto-switch to batches tab if a staged batch exists on load
  useEffect(() => {
    if (batches.some(b => b.status === "staged")) setActiveTab("cycles");
  }, [batches]);

  // ── Actions in progress (approve / discard / delete) ─────────────────────
  const [actionLoading, setActionLoading] = useState(false);

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [modal, setModal] = useState({
    show: false, type: null, title: "", message: "", details: null,
    confirmText: "Confirm", cancelText: "Cancel",
    confirmColor: "#007bff", icon: <HelpCircle size={20} />, data: null,
  });
  const closeModal = () => setModal(p => ({ ...p, show: false }));

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmt$    = v => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
  const fmtN    = v => Number(v || 0).toLocaleString();
  const fmtDate = d => d ? new Date(d).toLocaleString() : "—";

  // ── Load stats for expanded batch ─────────────────────────────────────────
  const loadStats = async (batchId) => {
    setStatsLoading(true); setBatchStats(null);
    try {
      const res = await apiPost("prepare_orders.php", { action: "stats", batch_id: batchId });
      if (res.success) setBatchStats(res);
    } catch (e) { console.error("Stats error:", e); }
    setStatsLoading(false);
  };

  const selectBatch = (batchId) => {
    if (activeBatchId === batchId) { setActiveBatchId(null); setBatchStats(null); return; }
    setActiveBatchId(batchId);
    loadStats(batchId);
  };

  // ── Update pipeline_cycles stage_orders so RAG reflects reality ─────────
  // Called directly from PrepareOrders (not via orchestrator), so we must
  // keep the pipeline_cycles stage columns in sync manually.
  const updateCycleStage = useCallback(async (cycleId, stageStatus) => {
    if (!cycleId) return;
    try {
      await apiPost("pipeline-cycles.php", {
        action:       "advance_stage",
        cycle_id:     cycleId,
        stage:        "orders",
        stage_status: stageStatus,
      });
      // Trigger immediate OrderPipeline re-fetch so RAG updates without waiting 30s
      setPipelineRefreshKey(k => k + 1);
    } catch (e) {
      console.warn("[PrepareOrders] updateCycleStage failed:", e);
    }
  }, []);

  // Resolve cycle_id from a batch's filter_merchant
  const cycleIdForMerchant = useCallback((merchantId) => {
    const opt = cycleOptions.find(c =>
      String(c.merchant_id || "").toLowerCase() === String(merchantId || "").toLowerCase()
    );
    return opt?.cycle?.id ?? null;
  }, [cycleOptions]);

  // ── Execute prepare for a single cycle ───────────────────────────────────
  const executePrepareForCycle = useCallback(async (cycleOpt) => {
    const key = cycleOpt.key;
    setCycleRunning(p => ({ ...p, [key]: true }));
    setCycleResults(p => ({ ...p, [key]: null }));
    try {
      const res = await apiPost("prepare_orders.php", {
        action:      "prepare",
        merchant_id: cycleOpt.merchant_id,
        broker_id:   cycleOpt.broker_id,
      });
      setCycleResults(p => ({ ...p, [key]: res }));
      if (res.success && !res.nothing_to_stage) {
        // Mark stage_orders = 'staged' so the RAG turns green
        await updateCycleStage(cycleOpt.cycle?.id, "staged");
      }
      await loadBatches();
    } catch (err) {
      setCycleResults(p => ({ ...p, [key]: { success: false, error: err.message } }));
    }
    setCycleRunning(p => ({ ...p, [key]: false }));
  }, [loadBatches, updateCycleStage]);

  // ── Run All Trials ────────────────────────────────────────────────────────
  const executeRunAll = async () => {
    setRunAllLoading(true);
    for (const cycleOpt of cycleOptions) {
      await executePrepareForCycle(cycleOpt);
    }
    setRunAllLoading(false);
  };

  // ── Approve All Staged ───────────────────────────────────────────────────
  const executeApproveAll = async () => {
    const stagedBatches = batches.filter(b => b.status === "staged");
    if (stagedBatches.length === 0) return;
    setApproveAllLoading(true);
    for (const batch of stagedBatches) {
      try {
        const res = await apiPost("prepare_orders.php", { action: "approve", batch_id: batch.batch_id });
        if (res.success) {
          const cycleId = cycleIdForMerchant(batch.filter_merchant);
          await updateCycleStage(cycleId, "completed");
        }
      } catch (e) {
        console.error("Approve all error for", batch.batch_id, e);
      }
    }
    await loadBatches();
    setActiveBatchId(null);
    setBatchStats(null);
    setApproveAllLoading(false);
  };

  // ── Approve ───────────────────────────────────────────────────────────────
  const showApproveModal = (batchId) => {
    const batch = batches.find(b => b.batch_id === batchId);
    setModal({
      show: true, type: "approve",
      title: "Approve & Lock Batch",
      icon: <CheckCircle2 size={20} color="#10b981" />,
      message: (
        <>
          Approve batch <strong style={{ fontFamily: "monospace" }}>{batchId}</strong>?
          <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "#6b7280" }}>
            This will <strong>lock</strong> the batch and create live orders.
            The pipeline advances to <strong>Fund IB Sweep</strong>.
          </div>
        </>
      ),
      details: batch ? (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span>Members: <strong>{fmtN(batch.total_members)}</strong></span>
          <span>Orders: <strong>{fmtN(batch.total_orders)}</strong></span>
          <span>Amount: <strong>{fmt$(batch.total_amount)}</strong></span>
        </div>
      ) : null,
      confirmText: "Approve & Lock", confirmColor: "#10b981",
      data: { batchId },
    });
  };

  const executeApprove = async (batchId) => {
    closeModal(); setActionLoading(true);
    try {
      const res = await apiPost("prepare_orders.php", { action: "approve", batch_id: batchId });
      if (res.success) {
        const mp      = res.missing_prices ? ` (Warning: ${res.missing_prices} orders had no price)` : "";
        const skipped = res.orders_skipped || 0;
        const flagged = res.orders_flagged || 0;
        setModal({
          show: true, type: "result", title: "Batch Approved",
          icon: <CheckCircle2 size={20} color="#10b981" />,
          message: (
            <>
              <strong>{fmtN(res.orders_created)}</strong> orders created in {res.duration_seconds}s.{mp}
              {(skipped > 0 || flagged > 0) && (
                <div style={{ marginTop: "10px", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "0.82rem" }}>
                  <strong>Duplicate Detection:</strong>
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "6px" }}>
                    {skipped > 0 && <span>Skipped (existing active): <strong>{skipped}</strong></span>}
                    {flagged > 0 && <span style={{ color: "#dc2626" }}>Flagged (balance issue): <strong>{flagged}</strong></span>}
                  </div>
                </div>
              )}
            </>
          ),
          confirmText: "OK", confirmColor: "#10b981", data: { resultOnly: true },
        });
        // Mark stage_orders = 'completed' so the RAG turns blue
        const cycleId = cycleIdForMerchant(batches.find(b => b.batch_id === batchId)?.filter_merchant);
        await updateCycleStage(cycleId, "completed");
        await loadBatches(); setActiveBatchId(null); setBatchStats(null);
      } else {
        setModal({ show: true, type: "result", title: "Approve Failed",
          icon: <XCircle size={20} color="#ef4444" />, message: res.error || "Unknown error.",
          confirmText: "OK", confirmColor: "#ef4444", data: { resultOnly: true } });
      }
    } catch (err) {
      setModal({ show: true, type: "result", title: "Error",
        icon: <XCircle size={20} color="#ef4444" />, message: err.message,
        confirmText: "OK", confirmColor: "#ef4444", data: { resultOnly: true } });
    }
    setActionLoading(false);
  };

  // ── Discard ───────────────────────────────────────────────────────────────
  const showDiscardModal = (batchId) => {
    const batch = batches.find(b => b.batch_id === batchId);
    setModal({
      show: true, type: "discard", title: "Discard Batch",
      icon: <Trash2 size={20} color="#ef4444" />,
      message: `Discard batch "${batchId}"?`,
      details: batch ? (
        <div>
          <div style={{ marginBottom: "8px" }}>Staged orders will be marked as discarded.</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <span>Orders: <strong>{fmtN(batch.total_orders)}</strong></span>
            <span>Amount: <strong>{fmt$(batch.total_amount)}</strong></span>
          </div>
        </div>
      ) : "Staged orders will be marked as discarded.",
      confirmText: "Discard", confirmColor: "#ef4444",
      data: { batchId },
    });
  };

  const executeDiscard = async (batchId) => {
    closeModal(); setActionLoading(true);
    try {
      const res = await apiPost("prepare_orders.php", { action: "discard", batch_id: batchId });
      if (!res.success) {
        setModal({ show: true, type: "result", title: "Discard Failed",
          icon: <XCircle size={20} color="#ef4444" />, message: res.error || "Unknown error.",
          confirmText: "OK", confirmColor: "#ef4444", data: { resultOnly: true } });
      } else {
        // Reset stage_orders to 'pending' so the cycle can be re-prepared
        const cycleId = cycleIdForMerchant(batches.find(b => b.batch_id === batchId)?.filter_merchant);
        await updateCycleStage(cycleId, "pending");
        await loadBatches(); setActiveBatchId(null); setBatchStats(null);
      }
    } catch (err) {
      setModal({ show: true, type: "result", title: "Error",
        icon: <XCircle size={20} color="#ef4444" />, message: err.message,
        confirmText: "OK", confirmColor: "#ef4444", data: { resultOnly: true } });
    }
    setActionLoading(false);
  };

  // ── Delete batch ──────────────────────────────────────────────────────────
  const showDeleteBatchModal = (batchId) => {
    const batch = batches.find(b => b.batch_id === batchId);
    setModal({
      show: true, type: "delete_batch", title: "Delete Batch Permanently",
      icon: <Bomb size={20} color="#ef4444" />,
      message: (
        <>
          Permanently delete batch <strong style={{ fontFamily: "monospace" }}>{batchId}</strong>?
          <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "#ef4444", fontWeight: 600 }}>
            This will physically DELETE all orders, baskets, and the batch record. Cannot be undone.
          </div>
        </>
      ),
      details: batch ? (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.85rem" }}>
          <span>Orders: <strong>{fmtN(batch.total_orders)}</strong></span>
          <span>Amount: <strong>{fmt$(batch.total_amount)}</strong></span>
        </div>
      ) : null,
      confirmText: "Delete Everything", confirmColor: "#dc2626",
      data: { batchId },
    });
  };

  const executeDeleteBatch = async (batchId) => {
    closeModal(); setActionLoading(true);
    try {
      const res = await apiPost("prepare_orders.php", { action: "delete_batch", batch_id: batchId });
      if (!res.success) {
        setModal({ show: true, type: "result", title: "Delete Failed",
          icon: <XCircle size={20} color="#ef4444" />, message: res.error || "Unknown error.",
          confirmText: "OK", confirmColor: "#ef4444", data: { resultOnly: true } });
      } else {
        await loadBatches();
        if (activeBatchId === batchId) { setActiveBatchId(null); setBatchStats(null); }
      }
    } catch (err) {
      setModal({ show: true, type: "result", title: "Error",
        icon: <XCircle size={20} color="#ef4444" />, message: err.message,
        confirmText: "OK", confirmColor: "#ef4444", data: { resultOnly: true } });
    }
    setActionLoading(false);
  };

  // ── Modal confirm dispatch ────────────────────────────────────────────────
  const handleModalConfirm = () => {
    switch (modal.type) {
      case "approve":      executeApprove(modal.data?.batchId);     break;
      case "discard":      executeDiscard(modal.data?.batchId);     break;
      case "delete_batch": executeDeleteBatch(modal.data?.batchId); break;
      default:             closeModal();
    }
  };

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = (status) => {
    const map = {
      staged:      { bg: "#fef3c7", text: "#92400e" },
      approved:    { bg: "#d1fae5", text: "#065f46" },
      submitted:   { bg: "#dbeafe", text: "#1e40af" },
      discarded:   { bg: "#f3f4f6", text: "#6b7280" },
      skipped_dup: { bg: "#fce7f3", text: "#9d174d" },
    };
    const c = map[status] || map.staged;
    return (
      <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999,
        fontSize: "0.75rem", fontWeight: 600, background: c.bg, color: c.text, textTransform: "uppercase" }}>
        {status}
      </span>
    );
  };

  // ── Derive batch for a given cycle ────────────────────────────────────────
  const batchForCycle = (cycleOpt) =>
    batches.find(b =>
      b.status === "staged" &&
      String(b.filter_merchant || "").toLowerCase() === String(cycleOpt.merchant_id || "").toLowerCase()
    ) || null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container app-content">
      <ConfirmModal
        show={modal.show} title={modal.title} message={modal.message}
        details={modal.details} confirmText={modal.confirmText}
        cancelText={modal.data?.resultOnly ? null : modal.cancelText}
        confirmColor={modal.confirmColor} icon={modal.icon}
        onConfirm={handleModalConfirm} onCancel={closeModal}
      />

      <h1 className="page-title">Prepare Batch Orders</h1>
      <p className="page-deck">
        Stage orders for each merchant · broker pipeline cycle. Review the trial run,
        then approve to lock the batch and advance to payment settlement.
      </p>

      <OrderPipeline
        currentStep={1}
        refreshKey={pipelineRefreshKey}
        stepStatuses={{
          prepare: (() => {
            const staged   = batches.filter(b => b.status === "staged").length;
            const approved = batches.filter(b => b.status === "approved").length;
            const total    = batches.filter(b => ["staged","approved"].includes(b.status)).length;
            if (total === 0)          return "none";
            if (staged > 0 && approved === 0) return "in_progress";   // all staged → green
            if (staged > 0 && approved > 0)   return "in_progress";   // mix → green
            if (approved > 0 && staged === 0)  return "completed";     // all approved → blue
            return "none";
          })(),
        }}
      />

      {/* ── Tabs ── */}
      <div style={{
        display: "flex", gap: "0.5rem", marginBottom: "1.5rem",
        borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem",
        justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[
            { key: "cycles",  label: `Cycles (${cycleOptions.length})` },
            { key: "batches", label: `History (${batches.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: "0.5rem 1rem",
              background: activeTab === t.key ? "#6366f1" : "transparent",
              color: activeTab === t.key ? "#fff" : "#64748b",
              border: "none", borderRadius: "6px", fontWeight: "500", cursor: "pointer",
            }}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => navigate("/payments-processing")} style={{
          display: "inline-flex", alignItems: "center", gap: "0.4rem",
          padding: "0.4rem 0.75rem", background: "none",
          border: "1px solid #d1d5db", borderRadius: "6px",
          color: "#6b7280", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
        }}>
          Next: Fund IB Sweep <ArrowRight size={13} />
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CYCLES TAB — one card per open pipeline cycle                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "cycles" && (
        <div>
          {cyclesLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ marginTop: 8 }}>Loading cycles…</div>
            </div>
          ) : (
            <>
              {/* ── Initiate Panel — available pairs without an active cycle ── */}
              {availablePairs.length > 0 && (
                <div style={{
                  marginBottom: 16, padding: "16px 18px", borderRadius: 10,
                  border: "1px solid #c7d2fe",
                  background: "linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Plus size={16} color="#6366f1" />
                    <span style={{ fontWeight: 700, color: "#3730a3", fontSize: "0.9rem" }}>
                      Initiate New Cycle
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#6366f1", background: "#e0e7ff",
                      padding: "1px 8px", borderRadius: 10, fontWeight: 600 }}>
                      {availablePairs.length} available
                    </span>
                  </div>

                  {initiateError && (
                    <div style={{ marginBottom: 10, padding: "7px 12px", borderRadius: 7,
                      background: "#fef2f2", border: "1px solid #fecaca",
                      fontSize: "0.82rem", color: "#dc2626" }}>
                      {initiateError}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    {/* Merchant·Broker dropdown */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 240px" }}>
                      <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#4338ca",
                        textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Merchant · Broker
                      </label>
                      <select
                        value={selectedNewPair}
                        onChange={e => setSelectedNewPair(e.target.value)}
                        style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #c7d2fe",
                          fontSize: "0.85rem", background: "#fff", cursor: "pointer" }}
                      >
                        <option value="">— select a relationship —</option>
                        {availablePairs.map(p => (
                          <option key={p.key} value={p.key}>
                            {p.merchant_name} · {p.broker_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Funding method dropdown */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#4338ca",
                        textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Funding
                      </label>
                      <select
                        value={selectedFunding}
                        onChange={e => setSelectedFunding(e.target.value)}
                        style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #c7d2fe",
                          fontSize: "0.85rem", background: "#fff", cursor: "pointer" }}
                      >
                        <option value="plaid">Plaid ACH</option>
                        <option value="csv">CSV Upload</option>
                        <option value="manual">Manual</option>
                        <option value="wire">Wire</option>
                      </select>
                    </div>

                    {/* Open Selected button */}
                    <button
                      onClick={handleInitiateSelected}
                      disabled={!selectedNewPair || initiating || initiateAllLoading}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "8px 18px", borderRadius: 7, fontWeight: 700, fontSize: "0.85rem",
                        background: (!selectedNewPair || initiating || initiateAllLoading) ? "#e0e7ff" : "#6366f1",
                        color: (!selectedNewPair || initiating || initiateAllLoading) ? "#6366f1" : "#fff",
                        border: "none", cursor: (!selectedNewPair || initiating || initiateAllLoading) ? "not-allowed" : "pointer",
                      }}
                    >
                      {initiating
                        ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Opening…</>
                        : <><CirclePlay size={14} /> Open & Run Trial</>}
                    </button>

                    {/* Open All button — only when 2+ available pairs */}
                    {availablePairs.length > 1 && (
                      <button
                        onClick={handleInitiateAll}
                        disabled={initiating || initiateAllLoading}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "8px 18px", borderRadius: 7, fontWeight: 700, fontSize: "0.85rem",
                          background: (initiating || initiateAllLoading) ? "#e0e7ff" : "#8b5cf6",
                          color: (initiating || initiateAllLoading) ? "#6366f1" : "#fff",
                          border: "none", cursor: (initiating || initiateAllLoading) ? "not-allowed" : "pointer",
                        }}
                      >
                        {initiateAllLoading
                          ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Opening All…</>
                          : <><Play size={14} /> Open All & Run Trials</>}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Bulk action buttons — Run All Trials + Approve All Staged */}
              {cycleOptions.length > 1 && (() => {
                const stagedCount = batches.filter(b => b.status === "staged").length;
                const anyBusy = runAllLoading || approveAllLoading || Object.values(cycleRunning).some(Boolean);
                return (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
                    {/* Run All Trials */}
                    <button
                      onClick={executeRunAll}
                      disabled={anyBusy}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "8px 18px", borderRadius: 8,
                        background: anyBusy ? "#94a3b8" : "#8b5cf6",
                        color: "#fff", border: "none", fontWeight: 700, fontSize: "0.85rem",
                        cursor: anyBusy ? "not-allowed" : "pointer",
                      }}
                    >
                      {runAllLoading
                        ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Running All…</>
                        : <><Play size={14} /> Run All Trials</>}
                    </button>
                    {/* Approve All Staged — only shown when there are staged batches */}
                    {stagedCount > 0 && (
                      <button
                        onClick={executeApproveAll}
                        disabled={anyBusy}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "8px 18px", borderRadius: 8,
                          background: anyBusy ? "#94a3b8" : "#10b981",
                          color: "#fff", border: "none", fontWeight: 700, fontSize: "0.85rem",
                          cursor: anyBusy ? "not-allowed" : "pointer",
                        }}
                      >
                        {approveAllLoading
                          ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Approving All…</>
                          : <><CheckCircle2 size={14} /> Approve All Staged ({stagedCount})</>}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Per-cycle cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {cycleOptions.map(cycleOpt => {
                  const batch   = batchForCycle(cycleOpt);
                  const running = !!cycleRunning[cycleOpt.key];
                  const result  = cycleResults[cycleOpt.key];
                  return (
                    <CyclePrepareCard
                      key={cycleOpt.key}
                      cycleOpt={cycleOpt}
                      batch={batch}
                      running={running}
                      result={result}
                      anyRunning={Object.values(cycleRunning).some(Boolean) || runAllLoading}
                      actionLoading={actionLoading}
                      activeBatchId={activeBatchId}
                      batchStats={batchStats}
                      statsLoading={statsLoading}
                      onPrepare={() => executePrepareForCycle(cycleOpt)}
                      onApprove={showApproveModal}
                      onDiscard={showDiscardModal}
                      onDelete={showDeleteBatchModal}
                      onSelectBatch={selectBatch}
                      fmt$={fmt$}
                      fmtN={fmtN}
                      fmtDate={fmtDate}
                    />
                  );
                })}
              </div>
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HISTORY TAB — all batches with filter                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "batches" && (
        <div>
          {/* Filter toolbar */}
          <div style={{
            display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap",
            marginBottom: "1.25rem", padding: "0.75rem 1rem",
            background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748b",
                textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Merchant · Broker
              </label>
              <select
                value={batchFilter}
                onChange={e => setBatchFilter(e.target.value)}
                style={{ padding: "0.4rem 0.75rem", borderRadius: "6px",
                  border: "1px solid #d1d5db", fontSize: "0.85rem", minWidth: 260 }}
              >
                <option value="">All Batches</option>
                {cycleOptions.map(opt => (
                  <option key={opt.key} value={opt.key}>
                    {opt.merchant_name} · {opt.broker_name}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={loadBatches} disabled={batchesLoading} style={{
              padding: "0.375rem 0.75rem", background: "#6366f1", color: "#fff",
              border: "none", borderRadius: "4px", fontSize: "0.75rem",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            }}>
              <RefreshCw size={12} style={{ animation: batchesLoading ? "spin 1s linear infinite" : "none" }} />
              {batchesLoading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {batchesError && (
            <div style={{ padding: "1rem", marginBottom: "1rem", borderRadius: "8px",
              background: "#fee2e2", border: "1px solid #ef4444", color: "#991b1b",
              fontSize: "0.875rem" }}>
              <strong><XCircle size={14} style={{ verticalAlign: "middle" }} /> Error:</strong>{" "}
              {batchesError}
            </div>
          )}

          {(() => {
            const filterMerchant = batchFilter.includes("|") ? batchFilter.split("|")[0] : batchFilter;
            const visible = filterMerchant
              ? batches.filter(b => String(b.filter_merchant || "").toLowerCase() === filterMerchant.toLowerCase())
              : batches;

            if (batches.length === 0 && !batchesError)
              return <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>No batches yet.</div>;
            if (visible.length === 0)
              return <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>No batches for selected filter.</div>;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {visible.map(b => {
                  const isActive = activeBatchId === b.batch_id;
                  return (
                    <div key={b.batch_id} style={{ background: "#fff", borderRadius: "8px",
                      border: `1px solid ${isActive ? "#6366f1" : "#e2e8f0"}`, overflow: "hidden" }}>
                      {/* Header row */}
                      <div onClick={() => selectBatch(b.batch_id)} style={{
                        padding: "0.75rem 1rem", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: isActive ? "#f0f9ff" : "#fff",
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.9rem", color: "#1e293b" }}>
                              <LineageLink id={b.batch_id} type="batch">{b.batch_id}</LineageLink>
                            </span>
                            {statusBadge(b.status)}
                            {b.filter_merchant && (
                              <span style={{ fontSize: "0.7rem", background: "#fef3c7", color: "#92400e", padding: "1px 8px", borderRadius: 4 }}>
                                {b.filter_merchant}
                              </span>
                            )}
                            {parseInt(b.refresh_count || 0) > 0 && (
                              <span style={{ fontSize: "0.7rem", background: "#dbeafe", color: "#1e40af", padding: "1px 8px", borderRadius: 4 }}>
                                <RefreshCw size={10} style={{ verticalAlign: "middle" }} /> ×{b.refresh_count}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 16, fontSize: "0.8rem", color: "#475569", flexWrap: "wrap" }}>
                            <span>Members: <strong>{fmtN(b.total_members)}</strong></span>
                            <span>Orders: <strong>{fmtN(b.total_orders)}</strong></span>
                            <span>Amount: <strong>{fmt$(b.total_amount)}</strong></span>
                            <span>Points: <strong>{fmtN(b.total_points)}</strong></span>
                            <span style={{ color: "#94a3b8" }}>{fmtDate(b.created_at)}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {b.status === "staged" && (
                            <>
                              <button onClick={e => { e.stopPropagation(); showApproveModal(b.batch_id); }}
                                disabled={actionLoading} style={actionBtn("#10b981")}>
                                <CheckCircle2 size={12} style={{ verticalAlign: "middle" }} /> Approve
                              </button>
                              <button onClick={e => { e.stopPropagation(); showDiscardModal(b.batch_id); }}
                                disabled={actionLoading} style={actionBtn("#ef4444")}>
                                <Trash2 size={12} style={{ verticalAlign: "middle" }} /> Discard
                              </button>
                            </>
                          )}
                          <button onClick={e => { e.stopPropagation(); showDeleteBatchModal(b.batch_id); }}
                            disabled={actionLoading}
                            style={{ ...actionBtn("#7f1d1d"), background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" }}>
                            <Bomb size={12} style={{ verticalAlign: "middle" }} /> Delete
                          </button>
                          {isActive ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                        </div>
                      </div>
                      {/* Expanded stats */}
                      {isActive && (
                        <div style={{ borderTop: "1px solid #e2e8f0" }}>
                          {statsLoading ? (
                            <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Loading stats...</div>
                          ) : batchStats ? (
                            <div style={{ padding: "1rem" }}>
                              {(batchStats.missing_prices || 0) > 0 && (
                                <div style={{ padding: "0.75rem 1rem", background: "#fef3c7", border: "1px solid #f59e0b",
                                  borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                                  fontSize: "0.85rem", color: "#92400e", marginBottom: "1rem" }}>
                                  <AlertTriangle size={16} />
                                  <span><strong>{batchStats.missing_prices}</strong> orders missing price — refresh trial to re-fetch.</span>
                                </div>
                              )}
                              <BatchHierarchy batchId={b.batch_id} merchants={batchStats.by_merchant} />
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// CyclePrepareCard — one card per open pipeline cycle
// ═══════════════════════════════════════════════════════════════════════════

function CyclePrepareCard({
  cycleOpt, batch, running, result, anyRunning, actionLoading,
  activeBatchId, batchStats, statsLoading,
  onPrepare, onApprove, onDiscard, onDelete, onSelectBatch,
  fmt$, fmtN, fmtDate,
}) {
  const [expanded, setExpanded] = useState(false);

  const hasStagedBatch = !!batch;
  const isApprovedExpanded = activeBatchId === batch?.batch_id;

  // Header color: amber if staged batch waiting, green if no batch yet
  const headerBg = hasStagedBatch
    ? "linear-gradient(135deg, #78350f 0%, #92400e 100%)"
    : "linear-gradient(135deg, #064e3b 0%, #065f46 100%)";

  const FUNDING_LABELS = { plaid: "Plaid ACH", csv: "CSV", manual: "Manual", wire: "Wire" };

  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      border: `2px solid ${hasStagedBatch ? "#fde68a" : "#6ee7b7"}`,
      background: "#fff",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      {/* ── Card header ── */}
      <div style={{
        padding: "14px 16px", background: headerBg,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10,
      }}>
        {/* Left: merchant + broker */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: "rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {hasStagedBatch
              ? <Lock size={20} color="#fbbf24" />
              : <Unlock size={20} color="#86efac" />}
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff" }}>
              {cycleOpt.merchant_name}
            </div>
            <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)", marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
              <Building2 size={11} color="rgba(255,255,255,0.5)" />
              {cycleOpt.broker_name}
              {cycleOpt.funding_method && (
                <span style={{ padding: "1px 6px", borderRadius: 6,
                  background: "rgba(255,255,255,0.15)", fontSize: "0.65rem" }}>
                  {FUNDING_LABELS[cycleOpt.funding_method] ?? cycleOpt.funding_method}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: batch status + expand */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {batch && (
            <div style={{ padding: "5px 10px", borderRadius: 7,
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <div style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Batch</div>
              <div style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "#fff", fontWeight: 700 }}>{batch.batch_id}</div>
            </div>
          )}
          <button
            onClick={() => setExpanded(x => !x)}
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
              color: "#fff", borderRadius: 7, padding: "5px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem" }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "Collapse" : "Details"}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 18,
        background: "#fafafa",
      }}>
        {batch ? (
          <>
            {/* Status badge */}
            {(() => {
              const S = {
                staged:    { bg: "#d1fae5", text: "#065f46" },
                approved:  { bg: "#dbeafe", text: "#1e40af" },
                discarded: { bg: "#f3f4f6", text: "#6b7280" },
              };
              const s = S[batch.status] || S.staged;
              return (
                <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: "0.72rem",
                  fontWeight: 700, background: s.bg, color: s.text,
                  letterSpacing: "0.05em", alignSelf: "center", flexShrink: 0 }}>
                  {(batch.status || "staged").toUpperCase()}
                </span>
              );
            })()}
            {[
              { label: "Members", value: fmtN(batch.total_members), color: "#374151" },
              { label: "Orders",  value: fmtN(batch.total_orders),  color: "#374151" },
              { label: "Amount",  value: fmt$(batch.total_amount),  color: "#1d4ed8" },
              { label: "Points",  value: fmtN(batch.total_points),  color: "#374151" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: "0.6rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
            {parseInt(batch.refresh_count || 0) > 0 && (
              <span style={{ fontSize: "0.7rem", background: "#dbeafe", color: "#1e40af",
                padding: "2px 8px", borderRadius: 4, alignSelf: "center" }}>
                <RefreshCw size={10} style={{ verticalAlign: "middle" }} /> refreshed ×{batch.refresh_count}
              </span>
            )}
            <span style={{ fontSize: "0.72rem", color: "#94a3b8", alignSelf: "center" }}>
              {fmtDate(batch.created_at)}
            </span>
          </>
        ) : (
          <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontStyle: "italic" }}>
            No staged batch — run a trial to begin
          </span>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {hasStagedBatch ? (
          <>
            {/* Refresh Trial */}
            <button
              onClick={onPrepare}
              disabled={running || anyRunning}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 16px", borderRadius: 7, fontSize: "0.82rem", fontWeight: 600,
                background: (running || anyRunning) ? "#e0e7ff" : "transparent",
                color: (running || anyRunning) ? "#4338ca" : "#6366f1",
                border: "1px solid #c7d2fe",
                cursor: (running || anyRunning) ? "not-allowed" : "pointer",
              }}
            >
              {running
                ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Refreshing…</>
                : <><RefreshCw size={13} /> Refresh Trial</>}
            </button>
            {/* Approve */}
            <button
              onClick={() => onApprove(batch.batch_id)}
              disabled={running || anyRunning || actionLoading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 18px", borderRadius: 7, fontSize: "0.82rem", fontWeight: 700,
                background: (running || anyRunning || actionLoading) ? "#d1fae5" : "#10b981",
                color: (running || anyRunning || actionLoading) ? "#065f46" : "#fff",
                border: "none", cursor: (running || anyRunning || actionLoading) ? "not-allowed" : "pointer",
              }}
            >
              <CheckCircle2 size={13} /> Approve & Lock
            </button>
            {/* Discard */}
            <button
              onClick={() => onDiscard(batch.batch_id)}
              disabled={running || actionLoading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 7, fontSize: "0.82rem", fontWeight: 600,
                background: "transparent", color: "#dc2626",
                border: "1px solid #fca5a5",
                cursor: (running || actionLoading) ? "not-allowed" : "pointer",
              }}
            >
              <Trash2 size={13} /> Discard
            </button>
          </>
        ) : (
          /* Run Trial */
          <button
            onClick={onPrepare}
            disabled={running || anyRunning}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 18px", borderRadius: 7, fontSize: "0.82rem", fontWeight: 700,
              background: (running || anyRunning) ? "#e0e7ff" : "#8b5cf6",
              color: (running || anyRunning) ? "#4338ca" : "#fff",
              border: "none", cursor: (running || anyRunning) ? "not-allowed" : "pointer",
            }}
          >
            {running
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Running Trial…</>
              : <><CirclePlay size={13} /> Run Trial</>}
          </button>
        )}

        {/* Delete batch (always visible when batch exists) */}
        {batch && (
          <button
            onClick={() => onDelete(batch.batch_id)}
            disabled={actionLoading}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 7, fontSize: "0.78rem", fontWeight: 600,
              background: "#fef2f2", color: "#991b1b",
              border: "1px solid #fca5a5",
              cursor: actionLoading ? "not-allowed" : "pointer",
              marginLeft: "auto",
            }}
          >
            <Bomb size={12} /> Delete Batch
          </button>
        )}
      </div>

      {/* ── Prepare result ── */}
      {result && (
        <div style={{
          margin: "0 16px 12px",
          padding: "8px 12px", borderRadius: 7,
          background: result.success ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${result.success ? "#bbf7d0" : "#fecaca"}`,
          fontSize: "0.82rem",
          color: result.success ? "#15803d" : "#dc2626",
        }}>
          {result.success ? (
            result.nothing_to_stage
              ? "Nothing to stage — all picks are already covered by active orders."
              : `Trial ${result.is_refresh ? "refreshed" : "staged"}: ${fmtN(result.results?.total_orders)} orders for ${fmtN(result.results?.total_members)} members — ${fmt$(result.results?.total_amount)}`
          ) : (
            result.error || "Prepare failed."
          )}
        </div>
      )}

      {/* ── Expanded: batch hierarchy ── */}
      {expanded && batch && (
        <div style={{ borderTop: "1px solid #e2e8f0" }}>
          <div
            onClick={() => onSelectBatch(batch.batch_id)}
            style={{ padding: "8px 16px", background: "#f8fafc", cursor: "pointer",
              fontSize: "0.78rem", color: "#6366f1", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
              borderBottom: isApprovedExpanded ? "1px solid #e2e8f0" : "none" }}
          >
            <ShoppingBasket size={13} />
            {isApprovedExpanded ? "Hide order breakdown" : "Show order breakdown"}
            {isApprovedExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
          {isApprovedExpanded && (
            statsLoading ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle" }} /> Loading…
              </div>
            ) : batchStats ? (
              <div style={{ padding: "1rem" }}>
                {(batchStats.missing_prices || 0) > 0 && (
                  <div style={{ padding: "0.75rem 1rem", background: "#fef3c7", border: "1px solid #f59e0b",
                    borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                    fontSize: "0.85rem", color: "#92400e", marginBottom: "1rem" }}>
                    <AlertTriangle size={16} />
                    <span><strong>{batchStats.missing_prices}</strong> orders missing price — refresh trial to re-fetch.</span>
                  </div>
                )}
                <BatchHierarchy batchId={batch.batch_id} merchants={batchStats.by_merchant} />
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// BatchHierarchy — Merchant → Broker → Basket → Orders tree
// ═══════════════════════════════════════════════════════════════════════════

function BatchHierarchy({ batchId, merchants }) {
  const fmt$ = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
  const fmtN = (v) => Number(v || 0).toLocaleString();
  const fmtShares = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  const [expandedMerchants, setExpandedMerchants] = useState(new Set());
  const [expandedBrokers,   setExpandedBrokers]   = useState(new Set());
  const [expandedBaskets,   setExpandedBaskets]   = useState(new Set());

  const [brokerData,  setBrokerData]  = useState({});
  const [basketData,  setBasketData]  = useState({});
  const [orderData,   setOrderData]   = useState({});

  const [loadingBrokers, setLoadingBrokers] = useState({});
  const [loadingBaskets, setLoadingBaskets] = useState({});
  const [loadingOrders,  setLoadingOrders]  = useState({});

  const toggleSet = (setter, key) => {
    setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const loadBrokers = async (merchantId) => {
    if (brokerData[merchantId]) return;
    setLoadingBrokers(p => ({ ...p, [merchantId]: true }));
    try {
      const res = await apiPost("prepare_orders.php", { action: "batch_brokers", batch_id: batchId, merchant_id: merchantId });
      setBrokerData(p => ({ ...p, [merchantId]: res.success ? (res.brokers || []) : [] }));
    } catch (e) { setBrokerData(p => ({ ...p, [merchantId]: [] })); }
    setLoadingBrokers(p => ({ ...p, [merchantId]: false }));
  };

  const loadBaskets = async (merchantId, broker) => {
    const key = `${merchantId}|${broker}`;
    if (basketData[key]) return;
    setLoadingBaskets(p => ({ ...p, [key]: true }));
    try {
      const res = await apiPost("prepare_orders.php", { action: "batch_baskets", batch_id: batchId, merchant_id: merchantId, broker });
      setBasketData(p => ({ ...p, [key]: res.success ? (res.baskets || []) : [] }));
    } catch (e) { setBasketData(p => ({ ...p, [key]: [] })); }
    setLoadingBaskets(p => ({ ...p, [key]: false }));
  };

  const loadOrders = async (basketId) => {
    if (orderData[basketId]) return;
    setLoadingOrders(p => ({ ...p, [basketId]: true }));
    try {
      const res = await apiPost("prepare_orders.php", { action: "batch_orders", batch_id: batchId, basket_id: basketId });
      setOrderData(p => ({ ...p, [basketId]: res.success ? (res.orders || []) : [] }));
    } catch (e) { setOrderData(p => ({ ...p, [basketId]: [] })); }
    setLoadingOrders(p => ({ ...p, [basketId]: false }));
  };

  const rowBase = (depth) => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", paddingLeft: `${12 + depth * 24}px`,
    cursor: "pointer", fontSize: "0.82rem",
    borderBottom: "1px solid #f1f5f9", transition: "background 0.1s",
  });

  const badge = (text, bg, color) => (
    <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: 4, background: bg, color, fontWeight: 600 }}>{text}</span>
  );

  const summaryPills = (row) => (
    <>
      {row.members   && badge(`${fmtN(row.members)} mbrs`,   "#f0f9ff", "#0369a1")}
      {row.orders    && badge(`${fmtN(row.orders)} orders`,  "#f5f3ff", "#6d28d9")}
      {row.total_amount && badge(fmt$(row.total_amount),     "#f0fdf4", "#15803d")}
    </>
  );

  const loadingRow = (depth) => (
    <div style={{ ...rowBase(depth), color: "#94a3b8" }}>
      <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Loading…
    </div>
  );

  const emptyRow = (depth, msg) => (
    <div style={{ ...rowBase(depth), color: "#94a3b8", fontStyle: "italic" }}>{msg}</div>
  );

  if (!merchants || merchants.length === 0)
    return <div style={{ padding: "1rem", color: "#94a3b8", textAlign: "center" }}>No merchant data.</div>;

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
      {merchants.map((m) => {
        const mId    = m.merchant_id;
        const mOpen  = expandedMerchants.has(mId);
        return (
          <div key={mId}>
            <div
              onClick={() => { toggleSet(setExpandedMerchants, mId); if (!mOpen) loadBrokers(mId); }}
              style={{ ...rowBase(0), background: mOpen ? "#f5f3ff" : "#fafafa", fontWeight: 600 }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f5f3ff")}
              onMouseLeave={e => (e.currentTarget.style.background = mOpen ? "#f5f3ff" : "#fafafa")}
            >
              <Package size={14} color="#8b5cf6" />
              <span style={{ color: "#1e293b" }}>{m.merchant_id}</span>
              {summaryPills(m)}
              {mOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
            </div>
            {mOpen && (
              loadingBrokers[mId]
                ? loadingRow(1)
                : !brokerData[mId]?.length
                  ? emptyRow(1, "No brokers found.")
                  : brokerData[mId].map((br) => {
                      const bKey  = `${mId}|${br.broker}`;
                      const brOpen = expandedBrokers.has(bKey);
                      return (
                        <div key={bKey}>
                          <div
                            onClick={() => { toggleSet(setExpandedBrokers, bKey); if (!brOpen) loadBaskets(mId, br.broker); }}
                            style={{ ...rowBase(1), fontWeight: 500, background: brOpen ? "#faf5ff" : "#fff" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#faf5ff")}
                            onMouseLeave={e => (e.currentTarget.style.background = brOpen ? "#faf5ff" : "#fff")}
                          >
                            <Building2 size={14} color="#6366f1" />
                            <span style={{ color: "#1e293b" }}>{br.broker}</span>
                            {summaryPills(br)}
                            {brOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                          </div>
                          {brOpen && (
                            loadingBaskets[bKey]
                              ? loadingRow(2)
                              : !basketData[bKey]?.length
                                ? emptyRow(2, "No baskets found.")
                                : basketData[bKey].map((bk) => {
                                    const bkOpen = expandedBaskets.has(bk.basket_id);
                                    return (
                                      <div key={bk.basket_id}>
                                        <div
                                          onClick={() => { toggleSet(setExpandedBaskets, bk.basket_id); if (!bkOpen) loadOrders(bk.basket_id); }}
                                          style={{ ...rowBase(2), background: bkOpen ? "#fffbeb" : "#fff" }}
                                          onMouseEnter={e => (e.currentTarget.style.background = "#fffbeb")}
                                          onMouseLeave={e => (e.currentTarget.style.background = bkOpen ? "#fffbeb" : "#fff")}
                                        >
                                          <ShoppingBasket size={14} color="#d97706" />
                                          <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>
                                            <LineageLink id={bk.basket_id} type="basket">{bk.basket_id}</LineageLink>
                                          </span>
                                          {bk.member_id && badge(`member: ${bk.member_id}`, "#fef3c7", "#92400e")}
                                          {summaryPills(bk)}
                                          {bkOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                                        </div>
                                        {bkOpen && (
                                          loadingOrders[bk.basket_id]
                                            ? loadingRow(3)
                                            : !orderData[bk.basket_id]?.length
                                              ? emptyRow(3, "No orders found.")
                                              : (
                                                <div style={{ paddingLeft: `${12 + 3 * 24}px`, paddingRight: 12, paddingBottom: 4 }}>
                                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                                    <thead>
                                                      <tr style={{ background: "#f8fafc" }}>
                                                        {["Order","Symbol","Amount","Price","Shares","Points","Status"].map(h => (
                                                          <th key={h} style={thStyleSm}>{h}</th>
                                                        ))}
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {orderData[bk.basket_id].map((o, i) => (
                                                        <tr key={o.order_id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                          <td style={{ ...tdStyleSm, fontFamily: "monospace", fontSize: "0.75rem" }}>
                                                            {o.order_id ? <LineageLink id={String(o.order_id)} type="order">{o.order_id}</LineageLink> : i + 1}
                                                          </td>
                                                          <td style={{ ...tdStyleSm, fontWeight: 600 }}>{o.symbol}</td>
                                                          <td style={tdStyleSm}>{fmt$(o.amount)}</td>
                                                          <td style={tdStyleSm}>{o.price ? fmt$(o.price) : <span style={{ color: "#ef4444", fontSize: "0.72rem" }}>—</span>}</td>
                                                          <td style={tdStyleSm}>{fmtShares(o.shares)}</td>
                                                          <td style={tdStyleSm}>{fmtN(o.points)}</td>
                                                          <td style={tdStyleSm}>
                                                            <span style={{
                                                              fontSize: "0.7rem", padding: "1px 8px", borderRadius: 4, fontWeight: 600,
                                                              background: o.status === "staged" ? "#fef3c7" : o.status === "pending" ? "#dbeafe" : o.status === "skipped_dup" ? "#fce7f3" : "#f3f4f6",
                                                              color:      o.status === "staged" ? "#92400e" : o.status === "pending" ? "#1e40af"  : o.status === "skipped_dup" ? "#9d174d"  : "#374151",
                                                            }}>
                                                              {o.status || "—"}
                                                            </span>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              )
                                        )}
                                      </div>
                                    );
                                  })
                          )}
                        </div>
                      );
                    })
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const thStyleSm = {
  padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: "600",
  fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase",
};

const tdStyleSm = { padding: "0.4rem 0.75rem", fontSize: "0.8rem" };

const actionBtn = (bg) => ({
  padding: "4px 12px", background: bg, color: "#fff",
  border: "none", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
});
