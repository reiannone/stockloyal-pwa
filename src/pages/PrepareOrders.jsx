import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";
import { CirclePlay, RefreshCw, CheckCircle2, XCircle, Trash2, AlertTriangle, ClipboardList, HelpCircle, User, ChevronUp, ChevronDown } from "lucide-react";

/**
 * PrepareOrders — Admin page for staged order preparation
 *
 * Staging workflow:
 *   1. Preview   → Aggregate counts (read-only, nothing written)
 *   2. Prepare   → INSERT...SELECT into prepared_orders (staged)
 *   3. Review    → Stats breakdown by merchant, broker, tier, symbol
 *   4. Drilldown → Paginated member detail within a batch
 *   5. Approve   → Move staged → orders table (pending)
 *   6. Discard   → Mark batch discarded
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

  // ── Drilldown state ──
  const [drilldown, setDrilldown] = useState(null);
  const [drillPage, setDrillPage] = useState(1);
  const [drillLoading, setDrillLoading] = useState(false);
  const [showDrilldown, setShowDrilldown] = useState(false);

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
        title: "Prep Already Run This Month",
        icon: <AlertTriangle size={20} color="#f59e0b" />,
        message: (
          <>
            A preparation batch has already been <strong>approved</strong> for <strong>{currentMonth}</strong>.
            <div style={{ marginTop: "12px" }}>
              Running prep again will create <strong>additional</strong> orders.
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
        confirmText: "Override & Continue",
        confirmColor: "#dc2626",
        data: { forceOverride: true },
      });
      return;
    }

    // Normal prepare modal
    const openBatches = batches.filter((b) => b.status === "staged");
    const warnings = [];
    if (openBatches.length > 0) {
      warnings.push(`${openBatches.length} open staged batch(es) will be discarded automatically.`);
    }
    warnings.push("Any existing pending orders (not yet swept) will also be cancelled.");

    setModal({
      show: true,
      type: "prepare",
      title: "Stage Orders",
      icon: <ClipboardList size={20} color="#6366f1" />,
      message: "Stage orders for all eligible members?",
      details: warnings.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          {warnings.map((w, i) => <li key={i} style={{ marginBottom: "4px" }}>{w}</li>)}
        </ul>
      ) : null,
      confirmText: "Stage Orders",
      confirmColor: "#6366f1",
      data: { forceOverride: false },
    });
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
    setShowDrilldown(false);
    setDrilldown(null);
    try {
      const res = await apiPost("prepare_orders.php", { action: "stats", batch_id: batchId });
      if (res.success) setBatchStats(res);
    } catch (err) {
      console.error("Stats error:", err);
    }
    setStatsLoading(false);
  };

  // ── Load drilldown ──
  const loadDrilldown = async (batchId, page = 1) => {
    setDrillLoading(true);
    try {
      const res = await apiPost("prepare_orders.php", {
        action: "drilldown",
        batch_id: batchId,
        page,
        per_page: 50,
      });
      if (res.success) {
        setDrilldown(res);
        setDrillPage(page);
      }
    } catch (err) {
      console.error("Drilldown error:", err);
    }
    setDrillLoading(false);
  };

  // ── Approve - show modal ──
  const showApproveModal = (batchId) => {
    const batch = batches.find(b => b.batch_id === batchId);
    setModal({
      show: true,
      type: "approve",
      title: "Approve Batch",
      icon: <CheckCircle2 size={20} color="#10b981" />,
      message: `Approve batch "${batchId}"?`,
      details: batch ? (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span>Members: <strong>{fmtN(batch.total_members)}</strong></span>
          <span>Orders: <strong>{fmtN(batch.total_orders)}</strong></span>
          <span>Amount: <strong>{fmt$(batch.total_amount)}</strong></span>
        </div>
      ) : null,
      confirmText: "Approve",
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
        This process prepares and stages orders based on each member's basket selections and the percentage of points specified in their investment elections. 
        Minimum and maximum dollar limits may apply to each member in the batch process, as defined by their broker.
      </p>

      {/* ── Order Pipeline ── */}
      <OrderPipeline currentStep={1} />

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
          <strong>{prepareResult.success ? <><CheckCircle2 size={14} style={{ verticalAlign: "middle" }} /> Batch Staged Successfully</> : <><XCircle size={14} style={{ verticalAlign: "middle" }} /> Staging Failed</>}</strong>
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
              {preparing ? "Staging..." : <><CirclePlay size={14} style={{ verticalAlign: "middle" }} /> Prepare (Stage)</>}
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
                            {b.batch_id}
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
                                  Yahoo Finance may not have returned prices for those symbols.
                                </span>
                              </div>
                            )}

                            {/* ── Stats grids ── */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

                              {/* By Merchant */}
                              <BreakdownTable
                                title="By Merchant"
                                rows={batchStats.by_merchant}
                                labelKey="merchant_id"
                                labelName="Merchant"
                              />

                              {/* By Broker */}
                              <BreakdownTable
                                title="By Broker"
                                rows={batchStats.by_broker}
                                labelKey="broker"
                                labelName="Broker"
                              />

                              {/* Top Symbols */}
                              {batchStats.by_symbol?.length > 0 && (
                                <div style={breakdownBox}>
                                  <div style={breakdownHeader}>Top Symbols</div>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr>
                                        <th style={thStyleSm}>Symbol</th>
                                        <th style={thStyleSm}>Price</th>
                                        <th style={thStyleSm}>Orders</th>
                                        <th style={thStyleSm}>Amount</th>
                                        <th style={thStyleSm}>Shares</th>
                                        <th style={thStyleSm}>Points</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {batchStats.by_symbol.map((s, i) => (
                                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                          <td style={{ ...tdStyleSm, fontWeight: 600 }}>{s.symbol}</td>
                                          <td style={tdStyleSm}>
                                            {s.price ? fmt$(s.price) : <span style={{ color: "#ef4444", fontSize: "0.75rem" }}>No price</span>}
                                          </td>
                                          <td style={tdStyleSm}>{fmtN(s.order_count)}</td>
                                          <td style={tdStyleSm}>{fmt$(s.total_amount)}</td>
                                          <td style={tdStyleSm}>{Number(s.total_shares || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                                          <td style={tdStyleSm}>{fmtN(s.total_points)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* ── Drilldown toggle ── */}
                            <div>
                                <button
                                  onClick={() => {
                                    if (showDrilldown) {
                                      setShowDrilldown(false);
                                    } else {
                                      setShowDrilldown(true);
                                      loadDrilldown(b.batch_id, 1);
                                    }
                                  }}
                                  style={{
                                    padding: "0.5rem 1rem",
                                    background: showDrilldown ? "#64748b" : "#6366f1",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "6px",
                                    fontSize: "0.8rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {showDrilldown ? "Hide Member Detail" : <><User size={14} style={{ verticalAlign: "middle" }} /> Show Member Detail</>}
                                </button>
                              </div>

                            {/* ── Drilldown table ── */}
                            {showDrilldown && (
                              <div style={breakdownBox}>
                                <div style={breakdownHeader}>
                                  Member Detail
                                  {drilldown && (
                                    <span style={{ fontWeight: 400, fontSize: "0.75rem", marginLeft: 8, color: "#94a3b8" }}>
                                      Page {drilldown.page} of {drilldown.total_pages} · {fmtN(drilldown.total_members)} members
                                    </span>
                                  )}
                                </div>
                                {drillLoading ? (
                                  <div style={{ padding: "1.5rem", textAlign: "center", color: "#64748b" }}>Loading...</div>
                                ) : !drilldown?.members?.length ? (
                                  <div style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8" }}>No members.</div>
                                ) : (
                                  <>
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                      <thead>
                                        <tr>
                                          <th style={thStyleSm}>Member</th>
                                          <th style={thStyleSm}>Merchant</th>
                                          <th style={thStyleSm}>Broker</th>
                                          <th style={thStyleSm}>Tier</th>
                                          <th style={thStyleSm}>Rate</th>
                                          <th style={thStyleSm}>Sweep %</th>
                                          <th style={thStyleSm}>Orders</th>
                                          <th style={thStyleSm}>Amount</th>
                                          <th style={thStyleSm}>Shares</th>
                                          <th style={thStyleSm}>Points</th>
                                          <th style={thStyleSm}>Symbols</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {drilldown.members.map((m, i) => (
                                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <td style={{ ...tdStyleSm, fontWeight: 600 }}>{m.member_id}</td>
                                            <td style={tdStyleSm}>{m.merchant_id || "—"}</td>
                                            <td style={tdStyleSm}>{m.broker || "—"}</td>
                                            <td style={tdStyleSm}>{m.member_tier || "—"}</td>
                                            <td style={tdStyleSm}>{m.conversion_rate}</td>
                                            <td style={tdStyleSm}>{m.sweep_percentage}%</td>
                                            <td style={tdStyleSm}>{fmtN(m.order_count)}</td>
                                            <td style={tdStyleSm}>{fmt$(m.total_amount)}</td>
                                            <td style={tdStyleSm}>{Number(m.total_shares || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                                            <td style={tdStyleSm}>{fmtN(m.total_points)}</td>
                                            <td style={{ ...tdStyleSm, fontSize: "0.72rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                              {m.symbols}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    {/* Pagination */}
                                    {drilldown.total_pages > 1 && (
                                      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "0.75rem" }}>
                                        <button
                                          disabled={drilldown.page <= 1}
                                          onClick={() => loadDrilldown(b.batch_id, drilldown.page - 1)}
                                          style={pagBtn}
                                        >
                                          ← Prev
                                        </button>
                                        <span style={{ fontSize: "0.8rem", color: "#475569", alignSelf: "center" }}>
                                          {drilldown.page} / {drilldown.total_pages}
                                        </span>
                                        <button
                                          disabled={drilldown.page >= drilldown.total_pages}
                                          onClick={() => loadDrilldown(b.batch_id, drilldown.page + 1)}
                                          style={pagBtn}
                                        >
                                          Next →
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
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

function BreakdownTable({ title, rows, labelKey, labelName }) {
  const fmt$ = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
  const fmtN = (v) => Number(v || 0).toLocaleString();

  if (!rows?.length) return null;

  return (
    <div style={breakdownBox}>
      <div style={breakdownHeader}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyleSm}>{labelName}</th>
            <th style={thStyleSm}>Members</th>
            <th style={thStyleSm}>Orders</th>
            <th style={thStyleSm}>Amount</th>
            <th style={thStyleSm}>Shares</th>
            <th style={thStyleSm}>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ ...tdStyleSm, fontWeight: 600 }}>{r[labelKey] || "—"}</td>
              <td style={tdStyleSm}>{fmtN(r.members)}</td>
              <td style={tdStyleSm}>{fmtN(r.orders)}</td>
              <td style={tdStyleSm}>{fmt$(r.total_amount)}</td>
              <td style={tdStyleSm}>{Number(r.total_shares || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
              <td style={tdStyleSm}>{fmtN(r.total_points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

const pagBtn = {
  padding: "4px 12px",
  background: "#e2e8f0",
  border: "none",
  borderRadius: "4px",
  fontSize: "0.8rem",
  cursor: "pointer",
};
