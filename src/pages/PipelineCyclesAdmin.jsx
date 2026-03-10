// src/pages/PipelineCyclesAdmin.jsx
//
// Admin panel for pipeline_cycles table.
// Route: /pipeline-cycles
// Add to App.jsx: <Route path="/pipeline-cycles" element={<PipelineCyclesAdmin />} />
//
// Shows:
//   • Active cycles (open / locked) as cards
//   • History table (completed / cancelled / failed)
//   • Open-new-cycle modal (pick merchant + broker + funding method)
//   • Per-cycle stage-advance controls + close button

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import {
  Activity, AlertCircle, AlertTriangle, ArrowRightLeft, CheckCircle2,
  ChevronDown, ChevronRight, Clock, CreditCard, ExternalLink, Filter,
  Lock, Plus, RefreshCw, ShoppingBasket, TrendingUp, Unlock, X,
  Zap, ClipboardCheck, Repeat2, Building2, Landmark,
} from "lucide-react";

// ── Shared helpers ────────────────────────────────────────────────────────────
const fmt$ = v => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
}).format(v || 0);
const fmtN = v => Number(v || 0).toLocaleString();
const fmtAgo = d => {
  if (!d) return "—";
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const fmtDate = d => d ? new Date(d).toLocaleString() : "—";

// ── Stage definitions ─────────────────────────────────────────────────────────
const STAGES = [
  { key: "baskets",    label: "Baskets",    icon: ShoppingBasket,  color: "#10b981", desc: "Loyalty point collection & basket build" },
  { key: "orders",     label: "Orders",     icon: ClipboardCheck,  color: "#f59e0b", desc: "Order prepare & approval batch" },
  { key: "payment",    label: "Payment",    icon: CreditCard,      color: "#06b6d4", desc: "Merchant ACH / bank payment initiated" },
  { key: "funding",    label: "Funding",    icon: Landmark,        color: "#8b5cf6", desc: "StockLoyal journal funding to member accounts" },
  { key: "journal",    label: "Journal",    icon: ArrowRightLeft,  color: "#ec4899", desc: "Journal entries recorded & reconciled" },
  { key: "placement",  label: "Placement",  icon: Repeat2,         color: "#3b82f6", desc: "Orders placed with broker" },
  { key: "submission", label: "Submission", icon: Zap,             color: "#a855f7", desc: "Broker submission acknowledged" },
  { key: "execution",  label: "Execution",  icon: Activity,        color: "#f97316", desc: "Market orders filled by broker" },
  { key: "settlement", label: "Settlement", icon: CheckCircle2,    color: "#14b8a6", desc: "Trade settlement complete (T+1 / T+2)" },
];

const STAGE_STATUS_COLORS = {
  pending:     { bg: "#f8fafc", fg: "#94a3b8", border: "#e2e8f0" },
  in_progress: { bg: "#eff6ff", fg: "#2563eb", border: "#bfdbfe" },
  completed:   { bg: "#f0fdf4", fg: "#16a34a", border: "#bbf7d0" },
  skipped:     { bg: "#f9fafb", fg: "#9ca3af", border: "#e5e7eb" },
  failed:      { bg: "#fef2f2", fg: "#dc2626", border: "#fecaca" },
  blocked:     { bg: "#fffbeb", fg: "#d97706", border: "#fde68a" },
};

const CYCLE_STATUS_COLORS = {
  open:      { bg: "#ecfdf5", fg: "#059669", border: "#6ee7b7" },
  locked:    { bg: "#fffbeb", fg: "#d97706", border: "#fde68a" },
  completed: { bg: "#f0fdf4", fg: "#16a34a", border: "#bbf7d0" },
  cancelled: { bg: "#f3f4f6", fg: "#6b7280", border: "#d1d5db" },
  failed:    { bg: "#fef2f2", fg: "#dc2626", border: "#fecaca" },
};

const FUNDING_LABELS = {
  plaid:  "Plaid ACH",
  csv:    "CSV Upload",
  manual: "Manual",
  wire:   "Wire",
};

// ── Stage pill ────────────────────────────────────────────────────────────────
function StagePill({ stageKey, status }) {
  const stg  = STAGES.find(s => s.key === stageKey);
  const col  = STAGE_STATUS_COLORS[status] || STAGE_STATUS_COLORS.pending;
  const Icon = stg?.icon || Activity;
  return (
    <span title={stg?.desc} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 12, fontSize: "0.68rem", fontWeight: 700,
      background: col.bg, color: col.fg, border: `1px solid ${col.border}`,
      whiteSpace: "nowrap",
    }}>
      <Icon size={10} />
      {status}
    </span>
  );
}

// ── Stage progress bar ────────────────────────────────────────────────────────
function StageProgressBar({ cycle }) {
  const statusWeight = { completed: 1, skipped: 1, in_progress: 0.5, blocked: 0, failed: 0, pending: 0 };
  const done = STAGES.reduce((sum, s) => sum + (statusWeight[cycle[`stage_${s.key}`]] ?? 0), 0);
  const pct  = Math.round((done / STAGES.length) * 100);

  return (
    <div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#e5e7eb", marginBottom: 4 }}>
        {STAGES.map(s => {
          const st  = cycle[`stage_${s.key}`] || 'pending';
          const col = st === 'completed' ? s.color
                    : st === 'in_progress' ? s.color + "99"
                    : st === 'skipped'     ? "#d1d5db"
                    : null;
          return col
            ? <div key={s.key} style={{ flex: 1, background: col }} title={`${s.label}: ${st}`} />
            : <div key={s.key} style={{ flex: 1, background: "#f1f5f9" }} title={`${s.label}: ${st}`} />;
        })}
      </div>
      <div style={{ fontSize: "0.65rem", color: "#64748b" }}>{pct}% complete</div>
    </div>
  );
}

// ── Cycle card (open / locked) ────────────────────────────────────────────────
function CycleCard({ cycle, onAdvance, onClose, onRefreshCounts }) {
  const [expanded, setExpanded] = useState(false);
  const [advancing, setAdvancing] = useState(null);

  const statusCol = CYCLE_STATUS_COLORS[cycle.status] || CYCLE_STATUS_COLORS.open;

  const handleAdvance = async (stageKey, stageStatus) => {
    setAdvancing(stageKey);
    try {
      await onAdvance(cycle.id, stageKey, stageStatus);
    } finally {
      setAdvancing(null);
    }
  };

  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      border: `2px solid ${statusCol.border}`,
      background: "#fff",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>

      {/* Card header */}
      <div style={{
        padding: "14px 16px",
        background: cycle.status === 'open'
          ? "linear-gradient(135deg, #064e3b 0%, #065f46 100%)"
          : "linear-gradient(135deg, #78350f 0%, #92400e 100%)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        {/* Left: merchant + broker */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: "rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {cycle.status === 'open'
              ? <Unlock size={20} color="#86efac" />
              : <Lock    size={20} color="#fbbf24" />}
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff" }}>
              {cycle.merchant_name || cycle.merchant_id_str || `Merchant #${cycle.merchant_record_id}`}
            </div>
            <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
              {cycle.broker_name || `Broker #${cycle.broker_id}`}
              {cycle.funding_method && (
                <span style={{ marginLeft: 8, padding: "1px 6px", borderRadius: 6,
                               background: "rgba(255,255,255,0.15)", fontSize: "0.65rem" }}>
                  {FUNDING_LABELS[cycle.funding_method] ?? cycle.funding_method}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: cycle ID + status + age */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <div style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Cycle</div>
            <div style={{ fontSize: "0.8rem", fontFamily: "monospace", color: "#fff", fontWeight: 700 }}>#{cycle.id}</div>
          </div>
          {cycle.batch_id && (
            <div style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <div style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Batch</div>
              <div style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "#fff", fontWeight: 700 }}>{cycle.batch_id}</div>
            </div>
          )}
          <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} /> {fmtAgo(cycle.created_at)}
          </span>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(x => !x)}
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
                     color: "#fff", borderRadius: 7, padding: "5px 10px", cursor: "pointer",
                     display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem" }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {expanded ? "Collapse" : "Manage"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 18,
        background: "#fafafa",
      }}>
        {[
          { label: "Total Orders", value: fmtN(cycle.orders_total), color: "#374151" },
          { label: "Settled",      value: fmtN(cycle.orders_settled), color: "#059669" },
          { label: "In Flight",    value: fmtN((+cycle.orders_approved||0) + (+cycle.orders_funded||0) + (+cycle.orders_placed||0) + (+cycle.orders_submitted||0)), color: "#d97706" },
          { label: "Failed",       value: fmtN(cycle.orders_failed), color: cycle.orders_failed > 0 ? "#dc2626" : "#94a3b8" },
          { label: "Amount",       value: fmt$(cycle.amount_total), color: "#1d4ed8" },
          { label: "Settled $",    value: fmt$(cycle.amount_settled), color: "#059669" },
        ].map(stat => (
          <div key={stat.label}>
            <div style={{ fontSize: "0.6rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
        <div style={{ marginLeft: "auto", flex: "0 0 160px" }}>
          <StageProgressBar cycle={cycle} />
        </div>
        <button
          onClick={() => onRefreshCounts(cycle.id)}
          title="Sync counts from orders table"
          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0",
                   background: "#fff", cursor: "pointer", color: "#64748b", fontSize: "0.7rem",
                   display: "flex", alignItems: "center", gap: 4 }}
        >
          <RefreshCw size={11} /> Sync
        </button>
      </div>

      {/* Stage grid — only when expanded */}
      {expanded && (
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            Stage Control
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
            {STAGES.map(stg => {
              const stageStatus = cycle[`stage_${stg.key}`] || 'pending';
              const col   = STAGE_STATUS_COLORS[stageStatus];
              const Icon  = stg.icon;
              const isAdv = advancing === stg.key;

              const NEXT_ACTIONS = {
                pending:     [['in_progress', 'Start'], ['skipped', 'Skip']],
                in_progress: [['completed', 'Complete'], ['failed', 'Mark Failed'], ['blocked', 'Block']],
                blocked:     [['in_progress', 'Unblock'], ['failed', 'Mark Failed']],
                failed:      [['in_progress', 'Retry'], ['skipped', 'Skip']],
                completed:   [],
                skipped:     [['pending', 'Reset']],
              };
              const actions = NEXT_ACTIONS[stageStatus] || [];

              return (
                <div key={stg.key} style={{
                  borderRadius: 9, border: `1px solid ${col.border}`,
                  background: col.bg, padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon size={13} color={stg.color} />
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#374151" }}>{stg.label}</span>
                    </div>
                    <StagePill stageKey={stg.key} status={stageStatus} />
                  </div>
                  <div style={{ fontSize: "0.63rem", color: "#6b7280", marginBottom: 8, lineHeight: 1.4 }}>{stg.desc}</div>

                  {/* Timestamp */}
                  {(cycle[`${stg.key}_started_at`] || cycle[`${stg.key}_completed_at`]) && (
                    <div style={{ fontSize: "0.62rem", color: "#94a3b8", marginBottom: 6 }}>
                      {cycle[`${stg.key}_started_at`] && <div>▶ {fmtDate(cycle[`${stg.key}_started_at`])}</div>}
                      {cycle[`${stg.key}_completed_at`] && <div>✓ {fmtDate(cycle[`${stg.key}_completed_at`])}</div>}
                    </div>
                  )}

                  {/* Action buttons */}
                  {actions.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {actions.map(([nextStatus, btnLabel]) => (
                        <button
                          key={nextStatus}
                          disabled={isAdv}
                          onClick={() => handleAdvance(stg.key, nextStatus)}
                          style={{
                            padding: "3px 9px", borderRadius: 6, fontSize: "0.68rem", fontWeight: 600,
                            cursor: isAdv ? "not-allowed" : "pointer",
                            border: `1px solid ${stg.color}40`,
                            background: stg.color + "15",
                            color: stg.color,
                          }}
                        >
                          {isAdv ? "…" : btnLabel}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Notes */}
          {cycle.notes && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 7, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "0.78rem", color: "#475569" }}>
              <strong style={{ color: "#374151" }}>Notes:</strong> {cycle.notes}
            </div>
          )}
          {cycle.last_error && (
            <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 7, background: "#fef2f2", border: "1px solid #fecaca", fontSize: "0.78rem", color: "#dc2626" }}>
              <AlertCircle size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
              <strong>Last Error ({fmtAgo(cycle.last_error_at)}):</strong> {cycle.last_error}
            </div>
          )}

          {/* Close cycle */}
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => onClose(cycle.id, 'completed')}
              style={{ padding: "6px 14px", borderRadius: 7, fontSize: "0.78rem", fontWeight: 700,
                       background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer" }}
            >
              ✓ Mark Completed
            </button>
            <button
              onClick={() => onClose(cycle.id, 'cancelled')}
              style={{ padding: "6px 14px", borderRadius: 7, fontSize: "0.78rem", fontWeight: 700,
                       background: "#f3f4f6", color: "#6b7280", border: "1px solid #d1d5db", cursor: "pointer" }}
            >
              Cancel Cycle
            </button>
            <button
              onClick={() => onClose(cycle.id, 'failed')}
              style={{ padding: "6px 14px", borderRadius: 7, fontSize: "0.78rem", fontWeight: 700,
                       background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer" }}
            >
              Mark Failed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Open-cycle modal ──────────────────────────────────────────────────────────
function OpenCycleModal({ onOpen, onClose }) {
  // merchant_record_id = merchant.record_id (INT)
  // broker_id          = broker_master.broker_id (VARCHAR)
  const [merchantRecordId, setMerchantRecordId] = useState('');
  const [brokerId,         setBrokerId]         = useState('');
  const [fundingMethod,    setFundingMethod]    = useState('plaid');
  const [label,            setLabel]            = useState('');
  const [busy,             setBusy]             = useState(false);
  const [err,              setErr]              = useState(null);

  const handleSubmit = async () => {
    if (!merchantRecordId || !brokerId.trim()) return setErr("Merchant record_id and Broker ID are required.");
    setBusy(true); setErr(null);
    try {
      await onOpen({ merchantRecordId, brokerId: brokerId.trim(), fundingMethod, label });
      onClose();
    } catch (e) {
      setErr(e.message || "Failed to open cycle.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d1d5db",
    fontSize: "0.85rem", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, width: "100%", maxWidth: 440,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Plus size={18} color="#059669" />
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#1e293b" }}>Open New Pipeline Cycle</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {err && (
            <div style={{ padding: "8px 12px", borderRadius: 7, background: "#fef2f2", border: "1px solid #fecaca",
                          color: "#dc2626", fontSize: "0.8rem", marginBottom: 14 }}>
              <AlertCircle size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{err}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                Merchant record_id <span style={{ color: "#94a3b8", fontWeight: 400 }}>(merchant.record_id INT)</span> *
              </label>
              <input
                type="number"
                value={merchantRecordId}
                onChange={e => setMerchantRecordId(e.target.value)}
                placeholder="e.g. 3"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                Broker ID <span style={{ color: "#94a3b8", fontWeight: 400 }}>(broker_master.broker_id VARCHAR)</span> *
              </label>
              <input
                type="text"
                value={brokerId}
                onChange={e => setBrokerId(e.target.value)}
                placeholder="e.g. alpaca"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                Funding Method
              </label>
              <select value={fundingMethod} onChange={e => setFundingMethod(e.target.value)} style={inputStyle}>
                <option value="plaid">Plaid ACH</option>
                <option value="csv">CSV Upload</option>
                <option value="manual">Manual</option>
                <option value="wire">Wire Transfer</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
                Cycle Label <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. March W1 2026"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{ padding: "8px 16px", borderRadius: 8, fontSize: "0.82rem",
                       background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={busy}
              style={{ padding: "8px 18px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 700,
                       background: busy ? "#d1fae5" : "#059669", color: "#fff",
                       border: "none", cursor: busy ? "not-allowed" : "pointer" }}
            >
              {busy ? "Opening…" : "Open Cycle"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── History table ─────────────────────────────────────────────────────────────
function HistoryTable({ cycles }) {
  if (!cycles?.length) return (
    <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
      No completed cycles yet.
    </div>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            {["#", "Merchant", "Broker", "Batch", "Status", "Orders", "Amount", "Stages", "Opened", "Closed"].map(h => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.69rem", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cycles.map(c => {
            const col = CYCLE_STATUS_COLORS[c.status] || CYCLE_STATUS_COLORS.cancelled;
            const completedStages = STAGES.filter(s => ['completed','skipped'].includes(c[`stage_${s.key}`])).length;
            return (
              <tr key={c.id}
                  style={{ borderBottom: "1px solid #f8fafc" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#64748b" }}>#{c.id}</td>
                <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1e293b" }}>
                  {c.merchant_name || c.merchant_id_str || `M#${c.merchant_record_id}`}
                </td>
                <td style={{ padding: "8px 12px", color: "#374151" }}>
                  {c.broker_name || `B#${c.broker_id}`}
                </td>
                <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: "0.72rem", color: "#6b7280" }}>
                  {c.batch_id || "—"}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 10, fontSize: "0.68rem", fontWeight: 700,
                    background: col.bg, color: col.fg, border: `1px solid ${col.border}`,
                  }}>
                    {c.status}
                  </span>
                </td>
                <td style={{ padding: "8px 12px", fontVariantNumeric: "tabular-nums" }}>
                  {fmtN(c.orders_total)}
                </td>
                <td style={{ padding: "8px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {fmt$(c.amount_total)}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 60, height: 4, borderRadius: 2,
                      background: "#e5e7eb", overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${(completedStages / STAGES.length) * 100}%`,
                        height: "100%", background: "#059669",
                      }} />
                    </div>
                    <span style={{ fontSize: "0.65rem", color: "#6b7280" }}>
                      {completedStages}/{STAGES.length}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "8px 12px", fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap" }}>
                  {fmtDate(c.created_at)}
                </td>
                <td style={{ padding: "8px 12px", fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap" }}>
                  {fmtDate(c.updated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PipelineCyclesAdmin() {
  const navigate = useNavigate();
  const [cycles,      setCycles]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastAt,      setLastAt]      = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toast,       setToast]       = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await apiPost("pipeline-cycles.php", { action: "list", limit: 100 });
      if (res?.success) { setCycles(res.cycles); setLastAt(new Date()); }
      else setError(res?.error || "Failed to load");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async ({ merchantRecordId, brokerId, fundingMethod, label }) => {
    const res = await apiPost("pipeline-cycles.php", {
      action: "open", merchant_record_id: merchantRecordId, broker_id: brokerId,
      funding_method: fundingMethod, label,
    });
    if (!res?.success) throw new Error(res?.error || "Failed");
    showToast(res.message || "Cycle opened.");
    load(true);
  };

  const handleAdvanceStage = async (cycleId, stage, stageStatus) => {
    const res = await apiPost("pipeline-cycles.php", {
      action: "advance_stage", cycle_id: cycleId, stage, stage_status: stageStatus,
    });
    if (!res?.success) { showToast(res?.error || "Failed to advance stage.", "error"); return; }
    showToast(`Stage '${stage}' → ${stageStatus}.`);
    load(true);
  };

  const handleClose = async (cycleId, newStatus) => {
    if (!window.confirm(`Mark cycle #${cycleId} as ${newStatus}?`)) return;
    const res = await apiPost("pipeline-cycles.php", {
      action: "close", cycle_id: cycleId, new_status: newStatus,
    });
    if (!res?.success) { showToast(res?.error || "Failed.", "error"); return; }
    showToast(res.message || `Cycle ${newStatus}.`);
    load(true);
  };

  const handleRefreshCounts = async (cycleId) => {
    const res = await apiPost("pipeline-cycles.php", {
      action: "update_counts", cycle_id: cycleId,
    });
    if (!res?.success) { showToast(res?.error || "Sync failed.", "error"); return; }
    showToast("Counts synced.");
    load(true);
  };

  const activeCycles  = cycles.filter(c => ['open','locked'].includes(c.status));
  const historyCycles = cycles.filter(c => !['open','locked'].includes(c.status));

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>

      {/* Page header */}
      <div style={{
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 65%, #1d4ed8 100%)",
        padding: "18px 28px",
      }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Activity size={22} color="#fff" />
            <div>
              <h1 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>
                Pipeline Cycles
              </h1>
              <p style={{ margin: 0, fontSize: "0.73rem", color: "rgba(255,255,255,0.55)" }}>
                One open cycle per merchant ↔ broker pair — end-to-end stage tracking
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {lastAt && (
              <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>
                <Clock size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                {fmtAgo(lastAt)}
              </span>
            )}
            <button onClick={() => load(true)} disabled={refreshing} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
            }}>
              <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
            <button onClick={() => setShowModal(true)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 8,
              background: "#059669", border: "none",
              color: "#fff", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
            }}>
              <Plus size={13} /> Open Cycle
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 28px" }}>

        {loading && (
          <div style={{ textAlign: "center", padding: "4rem", color: "#94a3b8" }}>
            <RefreshCw size={26} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
            <div>Loading cycles…</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 14, borderRadius: 10, background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", marginBottom: 20 }}>
            <AlertCircle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />{error}
          </div>
        )}

        {!loading && (
          <>
            {/* Summary strip */}
            <div style={{
              display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20,
            }}>
              {[
                { label: "Active Cycles",    value: activeCycles.length,  color: "#059669" },
                { label: "Open",             value: activeCycles.filter(c => c.status === 'open').length,   color: "#16a34a" },
                { label: "Locked",           value: activeCycles.filter(c => c.status === 'locked').length, color: "#d97706" },
                { label: "Completed (all)",  value: historyCycles.filter(c => c.status === 'completed').length, color: "#6b7280" },
                { label: "Failed / Issues",  value: cycles.filter(c => c.status === 'failed').length,       color: "#dc2626" },
              ].map(s => (
                <div key={s.label} style={{
                  padding: "10px 16px", borderRadius: 9, background: "#fff",
                  border: "1px solid #e2e8f0", minWidth: 110,
                }}>
                  <div style={{ fontSize: "0.6rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Active cycle cards */}
            {activeCycles.length === 0 ? (
              <div style={{
                padding: "32px", borderRadius: 12, border: "2px dashed #d1d5db",
                background: "#fafafa", textAlign: "center", marginBottom: 20,
              }}>
                <Unlock size={32} color="#94a3b8" style={{ marginBottom: 10 }} />
                <div style={{ fontWeight: 700, color: "#64748b", fontSize: "0.9rem" }}>No active pipeline cycles</div>
                <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 4 }}>
                  Open a new cycle to start the merchant-broker pipeline.
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  style={{ marginTop: 14, padding: "8px 20px", borderRadius: 8, background: "#059669",
                           color: "#fff", border: "none", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
                >
                  <Plus size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Open Cycle
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
                {activeCycles.map(c => (
                  <CycleCard
                    key={c.id}
                    cycle={c}
                    onAdvance={handleAdvanceStage}
                    onClose={handleClose}
                    onRefreshCounts={handleRefreshCounts}
                  />
                ))}
              </div>
            )}

            {/* History section */}
            {historyCycles.length > 0 && (
              <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", overflow: "hidden" }}>
                <button
                  onClick={() => setShowHistory(x => !x)}
                  style={{
                    width: "100%", padding: "12px 16px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "#fafafa", border: "none", cursor: "pointer",
                    borderBottom: showHistory ? "1px solid #e2e8f0" : "none",
                  }}
                >
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.07em", display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={12} color="#64748b" /> Cycle History ({historyCycles.length})
                  </span>
                  {showHistory ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                </button>
                {showHistory && <HistoryTable cycles={historyCycles} />}
              </div>
            )}
          </>
        )}
      </div>

      {/* Open cycle modal */}
      {showModal && (
        <OpenCycleModal onOpen={handleOpen} onClose={() => setShowModal(false)} />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          padding: "10px 18px", borderRadius: 9,
          background: toast.type === 'error' ? "#fef2f2" : "#f0fdf4",
          border: `1px solid ${toast.type === 'error' ? "#fecaca" : "#bbf7d0"}`,
          color: toast.type === 'error' ? "#dc2626" : "#16a34a",
          fontSize: "0.82rem", fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {toast.type === 'error'
            ? <AlertCircle size={14} />
            : <CheckCircle2 size={14} />}
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
