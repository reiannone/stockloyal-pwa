import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";
import { LineageLink } from "../components/LineagePopup";
import { CirclePlay, RefreshCw, CheckCircle2, XCircle, Trash2, AlertTriangle, ClipboardList, HelpCircle, ChevronUp, ChevronDown, Store, Building2, ShoppingBasket, Package } from "lucide-react";

/**
 * PrepareOrders — Admin page for staged order preparation
 *
 * Staging workflow:
 *   1. Preview   → Aggregate counts (read-only, nothing written)
 *   2. Prepare   → INSERT...SELECT into prepared_orders (staged)
 *   3. Review    → Hierarchy: Merchant → Broker → Basket → Orders
 *   4. Approve   → Move staged → orders table (pending)
 *   5. Discard   → Mark batch discarded
 *
 * Rules:
 *   - sweep_percentage = 0 → treated as 100%
 *   - points = 0 → member bypassed
 *   - conversion_rate from merchant tier columns (tier1–tier6)
 */

export default function PrepareOrders() {
  const [activeTab, setActiveTab] = useState("preview");

  // ── Preview state ──
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [filterMerchant, setFilterMerchant] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepareResult, setPrepareResult] = useState(null);

  // ── Batches state ──
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState(null);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [batchStats, setBatchStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Pipeline queue counts
  const [queueCounts, setQueueCounts] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const data = await apiPost("admin-queue-counts.php");
        if (data?.success) setQueueCounts(data.counts);
      } catch (err) {
        console.warn("[PrepareOrders] queue counts fetch failed:", err);
      }
    })();
  }, []);

  // ── Actions in progress ──
  const [actionLoading, setActionLoading] = useState(false);

  // ── Unified Modal State ──
  const [modal, setModal] = useState({
    show: false,
    type: null,        // 'prepare' | 'approve' | 'discard' | 'monthly-warning'
    title: "",
    message: "",
    details: null,
    confirmText: "Confirm",
    cancelText: "Cancel",
    confirmColor: "#007bff",
    icon: <HelpCircle size={20} />,
    data: null,        // Additional data (e.g., batchId)
  });

  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  // ── Helpers ──
  const fmt$ = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
  const fmtN = (v) => Number(v || 0).toLocaleString();
  const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "-");

  // ── Load preview ──
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const payload = { action: "preview" };
      if (filterMerchant) payload.merchant_id = filterMerchant;
      const res = await apiPost("prepare_orders.php", payload);
      if (res.success) {
        setPreview(res);
      } else {
        setPreviewError(res.error || "Preview failed — check PHP response.");
        console.error("Preview failed:", res);
      }
    } catch (err) {
      setPreviewError("Network/API error: " + err.message);
      console.error("Preview exception:", err);
    }
    setPreviewLoading(false);
  }, [filterMerchant]);

  // ── Load batches ──
  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const res = await apiPost("prepare_orders.php", { action: "batches", limit: 50 });
      if (res.success) {
        setBatches(res.batches || []);
      } else {
        setBatchesError(res.error || "Failed to load batches.");
        console.error("Batches failed:", res);
      }
    } catch (err) {
      setBatchesError("Network/API error: " + err.message);
      console.error("Batches exception:", err);
    }
    setBatchesLoading(false);
  }, []);

  // ── Detect existing staged batch ──
  const stagedBatch = batches.find((b) => b.status === "staged");
  const isRefreshMode = !!stagedBatch;

  // ── Prepare (stage) - show modal ──
  const showPrepareModal = () => {
    // Check if there's an approved batch for the current month
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-02"
    const approvedThisMonth = batches.filter(
      (b) => b.status === "approved" && b.batch_id?.startsWith(`PREP-${currentMonth}`)
    );

    if (approvedThisMonth.length > 0) {
      // Show monthly warning modal
      setModal({
        show: true,
        type: "monthly-warning",
        title: "Prep Already Approved This Month",
        icon: <AlertTriangle size={20} color="#f59e0b" />,
        message: (
          <>
            A preparation batch has already been <strong>approved</strong> for <strong>{currentMonth}</strong>.
            <div style={{ marginTop: "12px" }}>
              Running a new trial will create a <strong>separate</strong> batch.
            </div>
          </>
        ),
        details: (
          <div>
            <div style={{ fontWeight: 600, marginBottom: "8px", color: "#92400e" }}>Previous batch(es):</div>
            {approvedThisMonth.map((b) => (
              <div key={b.batch_id} style={{ marginBottom: "4px" }}>
                • <strong>{b.batch_id}</strong> — {fmtN(b.total_orders)} orders, {fmt$(b.total_amount)}
              </div>
            ))}
          </div>
        ),
        confirmText: "Override & Create New Trial",
        confirmColor: "#dc2626",
        data: { forceOverride: true },
      });
      return;
    }

    if (isRefreshMode) {
      // Refresh existing trial
      const rc = parseInt(stagedBatch.refresh_count || 0);
      setModal({
        show: true,
        type: "prepare",
        title: "Refresh Trial Run",
        icon: <RefreshCw size={20} color="#6366f1" />,
        message: (
          <>
            Refresh the existing staged batch with <strong>updated data</strong> (prices, member changes, basket edits)?
            <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "#6b7280" }}>
              Batch <strong style={{ fontFamily: "monospace" }}>{stagedBatch.batch_id}</strong> will be rebuilt in place.
              {rc > 0 && <> (refreshed {rc} time{rc !== 1 ? "s" : ""} so far)</>}
            </div>
          </>
        ),
        details: (
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.85rem" }}>
            <span>Current: <strong>{fmtN(stagedBatch.total_orders)}</strong> orders</span>
            <span>Amount: <strong>{fmt$(stagedBatch.total_amount)}</strong></span>
            <span>Members: <strong>{fmtN(stagedBatch.total_members)}</strong></span>
          </div>
        ),
        confirmText: "Refresh Trial",
        confirmColor: "#6366f1",
        data: { forceOverride: false },
      });
    } else {
      // New trial
      setModal({
        show: true,
        type: "prepare",
        title: "Run Trial",
        icon: <ClipboardList size={20} color="#6366f1" />,
        message: (
          <>
            Stage a <strong>trial run</strong> for all eligible members?
            <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "#6b7280" }}>
              This is a dry run for reconciliation purposes. No orders are created until the batch is <strong>approved</strong>.
            </div>
          </>
        ),
        confirmText: "Run Trial",
        confirmColor: "#6366f1",
        data: { forceOverride: false },
      });
    }
  };

  // ── Execute prepare ──
  const executePrepare = async () => {
    closeModal();
    setPreparing(true);
    setPrepareResult(null);

    try {
      const payload = { action: "prepare" };
      if (filterMerchant) payload.merchant_id = filterMerchant;
      const res = await apiPost("prepare_orders.php", payload);
      setPrepareResult(res);
      if (res.success) {
        await loadBatches();
        setActiveTab("batches");
        setActiveBatchId(res.batch_id);
        loadStats(res.batch_id);
      }
    } catch (err) {
      setPrepareResult({ success: false, error: err.message });
    }
    setPreparing(false);
  };

  // ── Load batch stats ──
  const loadStats = async (batchId) => {
    setStatsLoading(true);
    setBatchStats(null);
    try {
      const res = await apiPost("prepare_orders.php", { action: "stats", batch_id: batchId });
      if (res.success) setBatchStats(res);
    } catch (err) {
      console.error("Stats error:", err);
    }
    setStatsLoading(false);
  };

  // ── Approve - show modal ──
  const showApproveModal = (batchId) => {
    const batch = batches.find(b => b.batch_id === batchId);
    setModal({
      show: true,
      type: "approve",
      title: "Approve & Lock Batch",
      icon: <CheckCircle2 size={20} color="#10b981" />,
      message: (
        <>
          Approve batch <strong style={{ fontFamily: "monospace" }}>{batchId}</strong>?
          <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "#6b7280" }}>
            This will <strong>lock</strong> the batch and create live orders. No further refreshes will be possible.
            The pipeline advances to <strong>Payment Settlement</strong>.
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
      confirmText: "Approve & Lock",
      confirmColor: "#10b981",
      data: { batchId },
    });
  };

  // ── Execute approve ──
  const executeApprove = async (batchId) => {
    closeModal();
    setActionLoading(true);
    try {
      const res = await apiPost("prepare_orders.php", { action: "approve", batch_id: batchId });
      if (res.success) {
        const mp = res.missing_prices ? ` (Warning: ${res.missing_prices} orders had no price)` : "";
        setModal({
          show: true,
          type: "result",
          title: "Batch Approved",
          icon: <CheckCircle2 size={20} color="#10b981" />,
          message: `${fmtN(res.orders_created)} orders created in ${res.duration_seconds}s.${mp}`,
          confirmText: "OK",
          confirmColor: "#10b981",
          data: { resultOnly: true },
        });
        await loadBatches();
        setActiveBatchId(null);
        setBatchStats(null);
      } else {
        setModal({
          show: true,
          type: "result",
          title: "Approve Failed",
          icon: <XCircle size={20} color="#ef4444" />,
          message: res.error || "Unknown error occurred.",
          confirmText: "OK",
          confirmColor: "#ef4444",
          data: { resultOnly: true },
        });
      }
    } catch (err) {
      setModal({
        show: true,
        type: "result",
        title: "Error",
        icon: <XCircle size={20} color="#ef4444" />,
        message: err.message,
        confirmText: "OK",
        confirmColor: "#ef4444",
        data: { resultOnly: true },
      });
    }
    setActionLoading(false);
  };

  // ── Discard - show modal ──
  const showDiscardModal = (batchId) => {
    const batch = batches.find(b => b.batch_id === batchId);
    setModal({
      show: true,
      type: "discard",
      title: "Discard Batch",
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
      confirmText: "Discard",
      confirmColor: "#ef4444",
      data: { batchId },
    });
  };

  // ── Execute discard ──
  const executeDiscard = async (batchId) => {
    closeModal();
    setActionLoading(true);
    try {
      const res = await apiPost("prepare_orders.php", { action: "discard", batch_id: batchId });
      if (res.success) {
        await loadBatches();
        setActiveBatchId(null);
        setBatchStats(null);
      } else {
        setModal({
          show: true,
          type: "result",
          title: "Discard Failed",
          icon: <XCircle size={20} color="#ef4444" />,
          message: res.error || "Unknown error occurred.",
          confirmText: "OK",
          confirmColor: "#ef4444",
          data: { resultOnly: true },
        });
      }
    } catch (err) {
      setModal({
        show: true,
        type: "result",
        title: "Error",
        icon: <XCircle size={20} color="#ef4444" />,
        message: err.message,
        confirmText: "OK",
        confirmColor: "#ef4444",
        data: { resultOnly: true },
      });
    }
    setActionLoading(false);
  };

  // ── Handle modal confirm ──
  const handleModalConfirm = () => {
    switch (modal.type) {
      case "prepare":
      case "monthly-warning":
        executePrepare();
        break;
      case "approve":
        executeApprove(modal.data?.batchId);
        break;
      case "discard":
        executeDiscard(modal.data?.batchId);
        break;
      case "result":
        closeModal();
        break;
      default:
        closeModal();
    }
  };

  // ── Initial load ──
  useEffect(() => {
    loadPreview();
    loadBatches();
  }, [loadPreview, loadBatches]);

  // ── Batch clicked ──
  const selectBatch = (batchId) => {
    if (activeBatchId === batchId) {
      setActiveBatchId(null);
      setBatchStats(null);
      return;
    }
    setActiveBatchId(batchId);
    loadStats(batchId);
  };

  // ── Status badge ──
  const statusBadge = (status) => {
    const map = {
      staged:    { bg: "#fef3c7", text: "#92400e" },
      approved:  { bg: "#d1fae5", text: "#065f46" },
      submitted: { bg: "#dbeafe", text: "#1e40af" },
      discarded: { bg: "#f3f4f6", text: "#6b7280" },
    };
    const c = map[status] || map.staged;
    return (
      <span style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        textTransform: "uppercase",
      }}>
        {status}
      </span>
    );
  };

  return (
    <div className="app-container app-content">
      
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* UNIFIED CONFIRM MODAL                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <ConfirmModal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        details={modal.details}
        confirmText={modal.confirmText}
        cancelText={modal.data?.resultOnly ? null : modal.cancelText}
        confirmColor={modal.confirmColor}
        icon={modal.icon}
        onConfirm={handleModalConfirm}
        onCancel={closeModal}
      />

      {/* ── Header ── */}
      <h1 className="page-title">Prepare Batch Orders</h1>
      <p className="page-deck">
        Run a trial to stage orders based on each member's basket selections and investment elections.
        Refresh as many times as needed to reconcile funding requirements with merchant partners.
        Once approved, the batch is locked and advances to payment settlement.
      </p>

      {/* ── Order Pipeline ── */}
      <OrderPipeline currentStep={1} counts={queueCounts} />

      {/* ── Tabs ── */}
      <div style={{
        display: "flex",
        gap: "0.5rem",
        marginBottom: "1.5rem",
        borderBottom: "1px solid #e2e8f0",
        paddingBottom: "0.5rem",
      }}>
        {["preview", "batches"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.5rem 1rem",
              background: activeTab === tab ? "#6366f1" : "transparent",
              color: activeTab === tab ? "#fff" : "#64748b",
              border: "none",
              borderRadius: "6px",
              fontWeight: "500",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab === "batches" ? `Batches (${batches.length})` : "Preview"}
          </button>
        ))}
      </div>

      {/* ── Prepare result banner ── */}
      {prepareResult && (
        <div style={{
          padding: "1rem",
          marginBottom: "1rem",
          borderRadius: "8px",
          background: prepareResult.success ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${prepareResult.success ? "#10b981" : "#ef4444"}`,
        }}>
          <strong>{prepareResult.success ? <><CheckCircle2 size={14} style={{ verticalAlign: "middle" }} /> {prepareResult.is_refresh ? "Trial Refreshed Successfully" : "Trial Staged Successfully"}</> : <><XCircle size={14} style={{ verticalAlign: "middle" }} /> Staging Failed</>}</strong>
          {prepareResult.success && prepareResult.results && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <span>Batch: <strong style={{ fontFamily: "monospace" }}>{prepareResult.batch_id}</strong></span>
              <span>Members: <strong>{fmtN(prepareResult.results.total_members)}</strong></span>
              <span>Orders: <strong>{fmtN(prepareResult.results.total_orders)}</strong></span>
              <span>Amount: <strong>{fmt$(prepareResult.results.total_amount)}</strong></span>
              <span>Shares: <strong>{Number(prepareResult.results.total_shares || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</strong></span>
              <span>Points: <strong>{fmtN(prepareResult.results.total_points)}</strong></span>
              <span>Skipped: <strong>{fmtN(prepareResult.results.members_skipped)}</strong></span>
              <span>Time: <strong>{prepareResult.results.duration_seconds}s</strong></span>
              <span style={(prepareResult.results.capped_at_max || 0) > 0 ? { color: "#b45309" } : {}}>
                Baskets Reduced: <strong>{fmtN(prepareResult.results.capped_at_max)}</strong>
              </span>
              {(prepareResult.results.missing_prices || 0) > 0 && (
                <span style={{ color: "#dc2626" }}><AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> {prepareResult.results.missing_prices} orders missing price</span>
              )}
            </div>
          )}
          {prepareResult.error && !prepareResult.results && (
            <div style={{ marginTop: "0.5rem", color: "#dc2626" }}>{prepareResult.error}</div>
          )}
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PREVIEW TAB                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "preview" && (
        <div>
          {/* Toolbar */}
          <div style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "1.25rem",
            padding: "0.75rem 1rem",
            background: "#f8fafc",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
          }}>
            <select
              value={filterMerchant}
              onChange={(e) => setFilterMerchant(e.target.value)}
              style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.85rem" }}
            >
              <option value="">All Merchants</option>
              {(preview?.by_merchant || []).map((m) => (
                <option key={m.merchant_id} value={m.merchant_id}>
                  {m.merchant_name || m.merchant_id}
                </option>
              ))}
            </select>
            <button
              onClick={loadPreview}
              disabled={previewLoading}
              style={{
                padding: "0.5rem 1rem",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: previewLoading ? "not-allowed" : "pointer",
                opacity: previewLoading ? 0.6 : 1,
              }}
            >
              {previewLoading ? "Loading..." : <><RefreshCw size={14} style={{ verticalAlign: "middle" }} /> Refresh</>}
            </button>
            <button
              onClick={showPrepareModal}
              disabled={preparing || !preview?.eligible_members}
              style={{
                padding: "0.5rem 1.25rem",
                background: preparing ? "#94a3b8" : "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: preparing || !preview?.eligible_members ? "not-allowed" : "pointer",
              }}
            >
              {preparing ? "Staging..." : isRefreshMode
                ? <><RefreshCw size={14} style={{ verticalAlign: "middle" }} /> Refresh Trial</>
                : <><CirclePlay size={14} style={{ verticalAlign: "middle" }} /> Run Trial</>}
            </button>
          </div>

          {previewLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>Loading preview...</div>
          ) : previewError ? (
            <div style={{
              padding: "1rem",
              borderRadius: "8px",
              background: "#fee2e2",
              border: "1px solid #ef4444",
              color: "#991b1b",
              fontSize: "0.875rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}>
              <strong><XCircle size={14} style={{ verticalAlign: "middle" }} /> Preview Error</strong>
              <div style={{ marginTop: "0.5rem" }}>{previewError}</div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#6b7280" }}>
                Check: 1) prepare_staging_tables.sql was run, 2) prepare_orders.php is deployed, 3) Browser console / Network tab for details.
              </div>
            </div>
          ) : !preview ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
               <RefreshCw size={16} style={{ verticalAlign: "middle" }} /> Click Refresh to load preview counts.
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}>
                <StatCard label="Members" value={fmtN(preview.eligible_members)} color="#6366f1" />
                <StatCard label="Merchants" value={fmtN(preview.unique_merchants)} color="#8b5cf6" />
                <StatCard label="Brokers" value={fmtN(preview.unique_brokers)} color="#0ea5e9" />
                <StatCard label="Symbols" value={fmtN(preview.unique_symbols)} color="#06b6d4" />
                <StatCard label="Baskets" value={fmtN(preview.eligible_members)} color="#14b8a6" />
                <StatCard label="Total Orders" value={fmtN(preview.total_picks)} color="#0284c7" />
                <StatCard label="Est. Amount" value={fmt$(preview.est_total_amount)} color="#10b981" />
                <StatCard label="Est. Points" value={fmtN(preview.est_total_points)} color="#f59e0b" />
                {preview.bypassed_below_min > 0 && (
                  <StatCard label="Bypassed (Min)" value={fmtN(preview.bypassed_below_min)} color="#ef4444" />
                )}
                {preview.capped_at_max > 0 && (
                  <StatCard label="Capped (Max)" value={fmtN(preview.capped_at_max)} color="#f97316" />
                )}
                {preview.members_skipped > 0 && (
                  <StatCard label="Skipped (0 pts)" value={fmtN(preview.members_skipped)} color="#6b7280" />
                )}
              </div>

              {/* By merchant breakdown */}
              {preview.by_merchant?.length > 0 && (
                <div style={{
                  background: "#fff",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  overflow: "auto",
                }}>
                  <div style={{ padding: "0.75rem 1rem", background: "#f8fafc", fontWeight: 600, fontSize: "0.85rem", borderBottom: "1px solid #e2e8f0" }}>
                    By Merchant
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Merchant</th>
                        <th style={thStyle}>Members</th>
                        <th style={thStyle}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.by_merchant.map((m, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{m.merchant_name || m.merchant_id}</td>
                          <td style={tdStyle}>{fmtN(m.members)}</td>
                          <td style={tdStyle}>{fmtN(m.picks)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BATCHES TAB                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "batches" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, color: "#1e293b" }}>Preparation Batches</h3>
            <button
              onClick={loadBatches}
              disabled={batchesLoading}
              style={{
                padding: "0.375rem 0.75rem",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {batchesLoading ? "..." : "Refresh"}
            </button>
          </div>

          {batchesError && (
            <div style={{
              padding: "1rem",
              marginBottom: "1rem",
              borderRadius: "8px",
              background: "#fee2e2",
              border: "1px solid #ef4444",
              color: "#991b1b",
              fontSize: "0.875rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}>
              <strong><XCircle size={14} style={{ verticalAlign: "middle" }} /> Batches Error</strong>
              <div style={{ marginTop: "0.5rem" }}>{batchesError}</div>
            </div>
          )}

          {batches.length === 0 && !batchesError ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              No batches yet. Use the Preview tab to stage orders.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {batches.map((b) => {
                const isActive = activeBatchId === b.batch_id;

                return (
                  <div
                    key={b.batch_id}
                    style={{
                      background: "#fff",
                      borderRadius: "8px",
                      border: `1px solid ${isActive ? "#6366f1" : "#e2e8f0"}`,
                      overflow: "hidden",
                    }}
                  >
                    {/* ── Batch header ── */}
                    <div
                      onClick={() => selectBatch(b.batch_id)}
                      style={{
                        padding: "0.75rem 1rem",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: isActive ? "#f0f9ff" : "#fff",
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {/* Top row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.9rem", color: "#1e293b" }}>
                            <LineageLink id={b.batch_id} type="batch">{b.batch_id}</LineageLink>
                          </span>
                          {statusBadge(b.status)}
                          {b.filter_merchant && (
                            <span style={{ fontSize: "0.7rem", background: "#fef3c7", color: "#92400e", padding: "1px 8px", borderRadius: 4 }}>
                              merchant: {b.filter_merchant}
                            </span>
                          )}
                          {b.filter_member && (
                            <span style={{ fontSize: "0.7rem", background: "#e0e7ff", color: "#3730a3", padding: "1px 8px", borderRadius: 4 }}>
                              member: {b.filter_member}
                            </span>
                          )}
                          {parseInt(b.refresh_count || 0) > 0 && (
                            <span style={{ fontSize: "0.7rem", background: "#dbeafe", color: "#1e40af", padding: "1px 8px", borderRadius: 4 }}>
                              <RefreshCw size={10} style={{ verticalAlign: "middle" }} /> refreshed ×{b.refresh_count}
                            </span>
                          )}
                        </div>
                        {/* Stats row */}
                        <div style={{ display: "flex", gap: 16, fontSize: "0.8rem", color: "#475569", flexWrap: "wrap" }}>
                          <span>Members: <strong>{fmtN(b.total_members)}</strong></span>
                          <span>Orders: <strong>{fmtN(b.total_orders)}</strong></span>
                          <span>Amount: <strong>{fmt$(b.total_amount)}</strong></span>
                          <span>Points: <strong>{fmtN(b.total_points)}</strong></span>
                          {(b.members_skipped ?? 0) > 0 && (
                            <span style={{ color: "#ef4444" }}>Skipped: <strong>{fmtN(b.members_skipped)}</strong></span>
                          )}
                          <span style={{ color: "#94a3b8" }}>{fmtDate(b.created_at)}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {b.status === "staged" && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); showPrepareModal(); }}
                              disabled={actionLoading || preparing}
                              style={actionBtn("#6366f1")}
                              title="Rebuild this batch with fresh data"
                            >
                              <RefreshCw size={12} style={{ verticalAlign: "middle" }} /> Refresh
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); showApproveModal(b.batch_id); }}
                              disabled={actionLoading}
                              style={actionBtn("#10b981")}
                            >
                              <CheckCircle2 size={12} style={{ verticalAlign: "middle" }} /> Approve
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); showDiscardModal(b.batch_id); }}
                              disabled={actionLoading}
                              style={actionBtn("#ef4444")}
                            >
                              <Trash2 size={12} style={{ verticalAlign: "middle" }} /> Discard
                            </button>
                          </>
                        )}
                        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                          {isActive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </div>
                    </div>

                    {/* ── Expanded: batch stats ── */}
                    {isActive && (
                      <div style={{ borderTop: "1px solid #e2e8f0" }}>
                        {statsLoading ? (
                          <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Loading stats...</div>
                        ) : !batchStats ? null : (
                          <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

                            {/* ── Missing prices warning ── */}
                            {(batchStats.missing_prices || 0) > 0 && (
                              <div style={{
                                padding: "0.75rem 1rem",
                                background: "#fef3c7",
                                border: "1px solid #f59e0b",
                                borderRadius: 6,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: "0.85rem",
                                color: "#92400e",
                              }}>
                                <span style={{ fontSize: "1.1rem" }}><AlertTriangle size={18} /></span>
                                <span>
                                  <strong>{batchStats.missing_prices}</strong> orders have no price data (shares = 0).
                                  Yahoo Finance may not have returned prices for those symbols. Try refreshing the trial to re-fetch prices.
                                </span>
                              </div>
                            )}

                            {/* ── Merchant → Broker → Basket → Orders hierarchy ── */}
                            <BatchHierarchy
                              batchId={b.batch_id}
                              merchants={batchStats.by_merchant}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, color }) {
  return (
    <div style={{
      padding: "1rem 1.25rem",
      background: "#fff",
      borderRadius: "8px",
      border: "1px solid #e2e8f0",
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#1e293b", marginTop: "0.25rem" }}>
        {value}
      </div>
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

  // Expand/collapse state per level
  const [expandedMerchants, setExpandedMerchants] = useState(new Set());
  const [expandedBrokers, setExpandedBrokers] = useState(new Set());
  const [expandedBaskets, setExpandedBaskets] = useState(new Set());

  // Loaded children caches
  const [brokerData, setBrokerData] = useState({});    // { merchantId: [rows] }
  const [basketData, setBasketData] = useState({});    // { "merchantId|broker": [rows] }
  const [orderData, setOrderData] = useState({});      // { basketId: [rows] }

  // Loading flags
  const [loadingBrokers, setLoadingBrokers] = useState({});
  const [loadingBaskets, setLoadingBaskets] = useState({});
  const [loadingOrders, setLoadingOrders] = useState({});

  // ── Toggle helpers ──
  const toggleSet = (setter, key) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Load brokers for a merchant ──
  const loadBrokers = async (merchantId) => {
    if (brokerData[merchantId]) return;
    setLoadingBrokers((p) => ({ ...p, [merchantId]: true }));
    try {
      const res = await apiPost("prepare_orders.php", {
        action: "batch_brokers",
        batch_id: batchId,
        merchant_id: merchantId,
      });
      if (res.success) {
        setBrokerData((p) => ({ ...p, [merchantId]: res.brokers || [] }));
      } else {
        console.error("batch_brokers failed:", res.error || res);
        setBrokerData((p) => ({ ...p, [merchantId]: [] }));
      }
    } catch (err) {
      console.error("batch_brokers error:", err);
    }
    setLoadingBrokers((p) => ({ ...p, [merchantId]: false }));
  };

  // ── Load baskets for a merchant + broker ──
  const loadBaskets = async (merchantId, broker) => {
    const key = `${merchantId}|${broker}`;
    if (basketData[key]) return;
    setLoadingBaskets((p) => ({ ...p, [key]: true }));
    try {
      const res = await apiPost("prepare_orders.php", {
        action: "batch_baskets",
        batch_id: batchId,
        merchant_id: merchantId,
        broker,
      });
      if (res.success) {
        setBasketData((p) => ({ ...p, [key]: res.baskets || [] }));
      } else {
        console.error("batch_baskets failed:", res.error || res);
        setBasketData((p) => ({ ...p, [key]: [] }));
      }
    } catch (err) {
      console.error("batch_baskets error:", err);
    }
    setLoadingBaskets((p) => ({ ...p, [key]: false }));
  };

  // ── Load orders for a basket ──
  const loadOrders = async (basketId) => {
    if (orderData[basketId]) return;
    setLoadingOrders((p) => ({ ...p, [basketId]: true }));
    try {
      const res = await apiPost("prepare_orders.php", {
        action: "batch_orders",
        batch_id: batchId,
        basket_id: basketId,
      });
      if (res.success) {
        setOrderData((p) => ({ ...p, [basketId]: res.orders || [] }));
      } else {
        console.error("batch_orders failed:", res.error || res);
        setOrderData((p) => ({ ...p, [basketId]: [] }));
      }
    } catch (err) {
      console.error("batch_orders error:", err);
    }
    setLoadingOrders((p) => ({ ...p, [basketId]: false }));
  };

  // ── Shared row styles ──
  const rowBase = (depth) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    paddingLeft: `${12 + depth * 24}px`,
    cursor: "pointer",
    fontSize: "0.82rem",
    borderBottom: "1px solid #f1f5f9",
    transition: "background 0.1s",
  });

  const badge = (text, bg, color) => (
    <span style={{
      fontSize: "0.7rem",
      fontWeight: 600,
      padding: "1px 8px",
      borderRadius: 4,
      background: bg,
      color,
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );

  const summaryPills = (row) => (
    <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {row.members != null && badge(`${fmtN(row.members)} mbrs`, "#f0f9ff", "#0369a1")}
      {row.orders != null && badge(`${fmtN(row.orders)} orders`, "#faf5ff", "#7c3aed")}
      {row.total_amount != null && badge(fmt$(row.total_amount), "#f0fdf4", "#15803d")}
    </div>
  );

  const loadingRow = (depth) => (
    <div style={{ ...rowBase(depth), cursor: "default", color: "#94a3b8", fontStyle: "italic" }}>
      Loading...
    </div>
  );

  const emptyRow = (depth, text) => (
    <div style={{ ...rowBase(depth), cursor: "default", color: "#94a3b8" }}>
      {text}
    </div>
  );

  if (!merchants?.length) return <div style={{ padding: "1rem", color: "#94a3b8", textAlign: "center" }}>No data.</div>;

  return (
    <div style={breakdownBox}>
      <div style={breakdownHeader}>Batch Breakdown</div>

      {/* ── Level 1: Merchants ── */}
      {merchants.map((m) => {
        const mId = m.merchant_id;
        const mOpen = expandedMerchants.has(mId);

        return (
          <div key={mId}>
            <div
              onClick={() => {
                toggleSet(setExpandedMerchants, mId);
                if (!mOpen) loadBrokers(mId);
              }}
              style={{
                ...rowBase(0),
                fontWeight: 600,
                background: mOpen ? "#f8fafc" : "#fff",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = mOpen ? "#f8fafc" : "#fff")}
            >
              <Store size={14} color="#8b5cf6" />
              <span style={{ color: "#1e293b" }}>{mId}</span>
              {summaryPills(m)}
              {mOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
            </div>

            {/* ── Level 2: Brokers ── */}
            {mOpen && (
              loadingBrokers[mId]
                ? loadingRow(1)
                : !brokerData[mId]?.length
                  ? emptyRow(1, "No brokers found.")
                  : brokerData[mId].map((br) => {
                      const bKey = `${mId}|${br.broker}`;
                      const brOpen = expandedBrokers.has(bKey);

                      return (
                        <div key={bKey}>
                          <div
                            onClick={() => {
                              toggleSet(setExpandedBrokers, bKey);
                              if (!brOpen) loadBaskets(mId, br.broker);
                            }}
                            style={{
                              ...rowBase(1),
                              fontWeight: 500,
                              background: brOpen ? "#faf5ff" : "#fff",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#faf5ff")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = brOpen ? "#faf5ff" : "#fff")}
                          >
                            <Building2 size={14} color="#6366f1" />
                            <span style={{ color: "#1e293b" }}>{br.broker}</span>
                            {summaryPills(br)}
                            {brOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                          </div>

                          {/* ── Level 3: Baskets ── */}
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
                                          onClick={() => {
                                            toggleSet(setExpandedBaskets, bk.basket_id);
                                            if (!bkOpen) loadOrders(bk.basket_id);
                                          }}
                                          style={{
                                            ...rowBase(2),
                                            background: bkOpen ? "#fffbeb" : "#fff",
                                          }}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = "#fffbeb")}
                                          onMouseLeave={(e) => (e.currentTarget.style.background = bkOpen ? "#fffbeb" : "#fff")}
                                        >
                                          <ShoppingBasket size={14} color="#d97706" />
                                          <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>
                                            <LineageLink id={bk.basket_id} type="basket">{bk.basket_id}</LineageLink>
                                          </span>
                                          {bk.member_id && badge(`member: ${bk.member_id}`, "#fef3c7", "#92400e")}
                                          {summaryPills(bk)}
                                          {bkOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                                        </div>

                                        {/* ── Level 4: Orders ── */}
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
                                                        <th style={thStyleSm}>Order</th>
                                                        <th style={thStyleSm}>Symbol</th>
                                                        <th style={thStyleSm}>Amount</th>
                                                        <th style={thStyleSm}>Price</th>
                                                        <th style={thStyleSm}>Shares</th>
                                                        <th style={thStyleSm}>Points</th>
                                                        <th style={thStyleSm}>Status</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {orderData[bk.basket_id].map((o, i) => (
                                                        <tr key={o.order_id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                                          <td style={{ ...tdStyleSm, fontFamily: "monospace", fontSize: "0.75rem" }}>
                                                            {o.order_id
                                                              ? <LineageLink id={String(o.order_id)} type="order">{o.order_id}</LineageLink>
                                                              : i + 1}
                                                          </td>
                                                          <td style={{ ...tdStyleSm, fontWeight: 600 }}>{o.symbol}</td>
                                                          <td style={tdStyleSm}>{fmt$(o.amount)}</td>
                                                          <td style={tdStyleSm}>
                                                            {o.price ? fmt$(o.price) : <span style={{ color: "#ef4444", fontSize: "0.72rem" }}>—</span>}
                                                          </td>
                                                          <td style={tdStyleSm}>{fmtShares(o.shares)}</td>
                                                          <td style={tdStyleSm}>{fmtN(o.points)}</td>
                                                          <td style={tdStyleSm}>
                                                            <span style={{
                                                              fontSize: "0.7rem",
                                                              padding: "1px 8px",
                                                              borderRadius: 4,
                                                              background: o.status === "staged" ? "#fef3c7" : o.status === "pending" ? "#dbeafe" : "#f3f4f6",
                                                              color: o.status === "staged" ? "#92400e" : o.status === "pending" ? "#1e40af" : "#374151",
                                                              fontWeight: 600,
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


// ═══════════════════════════════════════════════════════════════════════════
// Shared styles
// ═══════════════════════════════════════════════════════════════════════════

const thStyle = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontWeight: "600",
  fontSize: "0.75rem",
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "0.75rem 1rem",
  fontSize: "0.875rem",
};

const thStyleSm = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontWeight: "600",
  fontSize: "0.7rem",
  color: "#64748b",
  textTransform: "uppercase",
};

const tdStyleSm = {
  padding: "0.4rem 0.75rem",
  fontSize: "0.8rem",
};

const breakdownBox = {
  background: "#fff",
  borderRadius: "6px",
  border: "1px solid #e2e8f0",
  overflow: "auto",
};

const breakdownHeader = {
  padding: "0.5rem 0.75rem",
  background: "#f8fafc",
  fontWeight: 600,
  fontSize: "0.8rem",
  borderBottom: "1px solid #e2e8f0",
  color: "#374151",
};

const actionBtn = (bg) => ({
  padding: "4px 12px",
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  fontSize: "0.75rem",
  fontWeight: 600,
  cursor: "pointer",
});
