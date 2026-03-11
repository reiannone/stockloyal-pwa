// src/pages/PipelineDashboard.jsx
//
// Mission-control page for the IB Order Pipeline.
// Route: /pipeline-dashboard
// Add to App.jsx: <Route path="/pipeline-dashboard" element={<PipelineDashboard />} />
//
// Shows:
//   • Cycle lock banner (same logic as OrderPipeline's header)
//   • Active batch overview + per-stage counts
//   • Per-merchant batch status table with progress bars
//   • Alerts from pipeline-status.php
//   • All-orders-by-status summary
//   • Last cron run status

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import {
  ShoppingBasket, ClipboardCheck, CreditCard, ArrowRightLeft, Repeat2, Zap, CheckCircle2,
  Lock, Unlock, RefreshCw, AlertTriangle, AlertCircle, Activity,
  LayoutDashboard, Building2, Users, ChevronRight, Clock, TrendingUp,
  ExternalLink,
} from "lucide-react";

// ── Pipeline stage definitions (matches PipelineCyclesAdmin) ─────────────────
const PIPELINE_STEPS = [
  { key: "baskets_orders", label: "Baskets & Orders", icon: ShoppingBasket, color: "#10b981", sub: "Loyalty baskets built & orders approved",  to: "/prepare-orders" },
  { key: "payment",        label: "Payment",          icon: CreditCard,     color: "#06b6d4", sub: "Merchant ACH / bank payment initiated",    to: "/payments-processing" },
  { key: "funding",        label: "Funding",          icon: ArrowRightLeft, color: "#8b5cf6", sub: "Journal funding to member accounts",       to: "/payments-processing" },
  { key: "journal",        label: "Journal",          icon: ArrowRightLeft, color: "#ec4899", sub: "Journal entries recorded & reconciled",    to: "/journal" },
  { key: "placement",      label: "Placement",        icon: Repeat2,        color: "#3b82f6", sub: "Orders placed with broker",                to: "/sweep" },
  { key: "submission",     label: "Submission",       icon: Zap,            color: "#a855f7", sub: "Broker submission acknowledged",           to: "/broker-exec" },
  { key: "execution",      label: "Execution",        icon: Activity,       color: "#f97316", sub: "Market orders filled by broker",           to: "/broker-exec" },
  { key: "settlement",     label: "Settlement",       icon: CheckCircle2,   color: "#14b8a6", sub: "Trade settlement complete (T+1/T+2)",     to: "/broker-exec" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = v => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0);
const fmtN = v => Number(v || 0).toLocaleString();
const fmtAgo = d => {
  if (!d) return "—";
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
};

const STAGE_MAP = Object.fromEntries(PIPELINE_STEPS.map(s => [s.key, s]));

function stepCount(step, stages) {
  const s = stages?.[step.key];
  if (!s) return 0;
  return s.count ?? 0;
}

function deriveLock(merchantBatches) {
  const inflight = (merchantBatches || []).filter(mb =>
    +mb.cnt_approved + +mb.cnt_funded + +mb.cnt_placed + +mb.cnt_submitted > 0
  );
  return { locked: inflight.length > 0, inflight };
}

// ── Cycle lock / ready banner ─────────────────────────────────────────────────
function CycleBanner({ locked, inflight, stages, activeBatchId }) {
  const totalInFlight = PIPELINE_STEPS.reduce((sum, s) => sum + stepCount(s, stages), 0);
  const totalAmt = PIPELINE_STEPS.reduce((sum, s) => {
    const st = stages?.[s.key];
    return sum + (st?.amount || 0);
  }, 0);

  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      border: `2px solid ${locked ? "#fcd34d" : "#86efac"}`,
      marginBottom: 20,
    }}>

      {/* Header strip */}
      <div style={{
        padding: "16px 22px",
        background: locked
          ? "linear-gradient(135deg, #78350f 0%, #92400e 100%)"
          : "linear-gradient(135deg, #14532d 0%, #166534 100%)",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 11, flexShrink: 0,
            background: "rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {locked
              ? <Lock size={22} color="#fbbf24" />
              : <Unlock size={22} color="#86efac" />}
          </div>
          <div>
            <div style={{
              fontSize: "1rem", fontWeight: 800, color: "#fff",
              letterSpacing: "-0.01em",
            }}>
              {locked
                ? "CYCLE IN PROGRESS — NEW CYCLE LOCKED"
                : "READY FOR NEW CYCLE"}
            </div>
            <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.68)", marginTop: 3 }}>
              {locked
                ? `${inflight.length} active cycle${inflight.length > 1 ? "s" : ""} in flight — all orders must settle before a new cycle can be opened`
                : "No active cycles — open a new cycle via Pipeline Cycles"}
            </div>
          </div>
        </div>

        {/* Active batch ID */}
        {activeBatchId && (
          <div style={{
            padding: "7px 14px", borderRadius: 8,
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)",
          }}>
            <div style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Active Batch</div>
            <div style={{ fontSize: "0.85rem", fontFamily: "monospace", color: "#fff", fontWeight: 700 }}>{activeBatchId}</div>
          </div>
        )}
      </div>

      {/* In-flight stats row — only when locked */}
      {locked && (
        <div style={{
          padding: "10px 22px",
          background: "#fffbeb",
          borderTop: "1px solid #fde68a",
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 20,
        }}>
          {/* Total counts */}
          <div style={{ fontSize: "0.82rem", color: "#78350f" }}>
            <strong style={{ fontSize: "1.15rem", color: "#92400e", fontWeight: 800 }}>{fmtN(totalInFlight)}</strong>
            <span style={{ marginLeft: 5 }}>orders in flight</span>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#78350f" }}>
            <strong style={{ fontSize: "1.15rem", color: "#92400e", fontWeight: 800 }}>{fmt$(totalAmt)}</strong>
            <span style={{ marginLeft: 5 }}>total value</span>
          </div>

          {/* Per-stage pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
            {PIPELINE_STEPS.map(s => {
              const cnt  = stepCount(s, stages);
              const Icon = s.icon;
              return (
                <div key={s.key} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 20,
                  background: cnt > 0 ? s.color + "18" : "#f1f5f9",
                  border: `1px solid ${cnt > 0 ? s.color + "40" : "#e2e8f0"}`,
                }}>
                  <Icon size={12} color={cnt > 0 ? s.color : "#94a3b8"} />
                  <span style={{ fontSize: "0.73rem", fontWeight: cnt > 0 ? 700 : 400, color: cnt > 0 ? s.color : "#94a3b8" }}>
                    {cnt > 0 ? cnt : "✓"}
                  </span>
                  <span style={{ fontSize: "0.68rem", color: "#6b7280" }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stage card row ────────────────────────────────────────────────────────────
// ── Vertical subway-style order flow — matches OrderPipeline stepper ─────────
function OrderFlowSubway({ stages, navigate }) {
  const last = PIPELINE_STEPS.length - 1;

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "16px 20px" }}>
      <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
        Order Flow
      </div>

      <div style={{ position: "relative" }}>
        {/* Vertical rail line */}
        <div style={{
          position: "absolute",
          left: 21, top: 22, bottom: 22,
          width: 3, background: "#e5e7eb", borderRadius: 2, zIndex: 0,
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {PIPELINE_STEPS.map((step, i) => {
            const stageData = stages?.[step.key];
            const count  = stepCount(step, { [step.key]: stageData });
            const amount = stageData?.amount || 0;
            const active = count > 0;
            const done   = !active && count === 0 && stageData != null;
            const Icon   = step.icon;

            // Circle appearance — mirrors OrderPipeline Stepper
            const circleColor = active ? step.color : done ? step.color : "#d1d5db";
            const circleOpacity = active ? 1 : done ? 0.55 : 0.35;

            return (
              <div
                key={step.key}
                onClick={() => step.to && navigate(step.to)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "6px 0",
                  cursor: step.to ? "pointer" : "default",
                  position: "relative", zIndex: 1,
                }}
                onMouseEnter={e => { if (step.to) e.currentTarget.style.opacity = "0.82"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {/* Circle — same 44×44 as OrderPipeline */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: circleColor, opacity: circleOpacity,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white",
                    border: active ? `3px solid ${step.color}` : "3px solid transparent",
                    boxShadow: active ? `0 0 0 4px ${step.color}28` : "none",
                    transition: "all 0.15s",
                  }}>
                    {done ? <CheckCircle2 size={20} /> : <Icon size={18} />}
                  </div>

                  {/* Red count badge — mirrors OrderPipeline */}
                  {active && count > 0 && (
                    <div style={{
                      position: "absolute", top: -5, right: -5,
                      minWidth: 20, height: 20, borderRadius: 10,
                      background: "#ef4444", color: "white",
                      fontSize: 11, fontWeight: 700, padding: "0 5px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "2px solid white",
                    }}>
                      {count}
                    </div>
                  )}

                  {/* Green ✓ badge */}
                  {done && (
                    <div style={{
                      position: "absolute", top: -3, right: -3,
                      width: 18, height: 18, borderRadius: "50%",
                      background: "#22c55e", color: "white", fontSize: 11,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "2px solid white",
                    }}>✓</div>
                  )}
                </div>

                {/* Label + subtitle */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "0.82rem", fontWeight: active ? 700 : 500,
                    color: active ? "#1e293b" : done ? "#374151" : "#9ca3af",
                    lineHeight: 1.3,
                  }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 1 }}>
                    {step.sub}
                  </div>
                </div>

                {/* Count + amount — right side */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {active ? (
                    <>
                      <div style={{
                        fontSize: "1.5rem", fontWeight: 800, lineHeight: 1,
                        color: step.color, fontVariantNumeric: "tabular-nums",
                      }}>
                        {fmtN(count)}
                      </div>
                      {amount > 0 && (
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: step.color, marginTop: 1 }}>
                          {fmt$(amount)}
                        </div>
                      )}
                    </>
                  ) : done ? (
                    <span style={{ fontSize: "1.1rem", color: "#22c55e", fontWeight: 700 }}>✓</span>
                  ) : (
                    <span style={{ fontSize: "0.72rem", color: "#d1d5db" }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Merchant batch table ──────────────────────────────────────────────────────
function MerchantBatchTable({ merchantBatches, navigate }) {
  const SEGS = [
    { key: "cnt_approved",  label: "approved",  color: "#f59e0b" },
    { key: "cnt_funded",    label: "funded",    color: "#06b6d4" },
    { key: "cnt_placed",    label: "placed",    color: "#8b5cf6" },
    { key: "cnt_submitted", label: "submitted", color: "#ec4899" },
    { key: "cnt_settled",   label: "settled",   color: "#10b981" },
  ];

  if (!merchantBatches?.length) {
    return (
      <div style={{
        padding: "28px", borderRadius: 10, border: "1px solid #d1fae5",
        background: "#f0fdf4", textAlign: "center",
      }}>
        <CheckCircle2 size={30} color="#10b981" style={{ marginBottom: 8 }} />
        <div style={{ fontWeight: 700, color: "#10b981", fontSize: "0.9rem" }}>All caught up</div>
        <div style={{ color: "#6b7280", fontSize: "0.82rem", marginTop: 3 }}>No active merchant batches</div>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "11px 16px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#fafafa",
      }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.07em", display: "flex", alignItems: "center", gap: 6 }}>
          <Building2 size={13} color="#64748b" /> Merchant Batches In Progress
        </div>
        <span style={{ fontSize: "0.7rem", color: "#f59e0b", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
          <Lock size={11} /> New cycle locked until all settle
        </span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            {[
              { label: "Merchant",       align: "left"  },
              { label: "Batch ID",       align: "left"  },
              { label: "Current Stage",  align: "center"},
              { label: "Orders",         align: "right" },
              { label: "Amount",         align: "right" },
              { label: "Progress",       align: "left", minWidth: 180 },
            ].map(h => (
              <th key={h.label} style={{
                padding: "8px 14px", textAlign: h.align,
                color: "#64748b", fontWeight: 600, fontSize: "0.7rem",
                minWidth: h.minWidth,
              }}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {merchantBatches.map((mb, i) => {
            const stage    = STAGE_MAP[mb.current_stage] || PIPELINE_STEPS[1];
            const isBlocked = +mb.cnt_approved + +mb.cnt_funded + +mb.cnt_placed + +mb.cnt_submitted > 0;
            const Icon     = stage.icon;

            return (
              <tr key={i}
                style={{ borderBottom: "1px solid #f8fafc" }}
                onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {/* Merchant */}
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isBlocked && <Lock size={11} color="#f59e0b" title="Blocking new cycle" />}
                    <span style={{ fontWeight: 700, color: "#1e293b" }}>{mb.merchant_id}</span>
                  </div>
                </td>

                {/* Batch ID */}
                <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "0.74rem", color: "#64748b" }}>
                  {mb.batch_id}
                </td>

                {/* Current stage — clickable chip */}
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  <span
                    onClick={() => stage.to && navigate(stage.to)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 11px", borderRadius: 20,
                      background: stage.color + "15", color: stage.color,
                      border: `1px solid ${stage.color}35`,
                      fontSize: "0.72rem", fontWeight: 700,
                      cursor: stage.to ? "pointer" : "default",
                    }}
                  >
                    <Icon size={11} />
                    {stage.label}
                    {stage.to && <ChevronRight size={10} />}
                  </span>
                </td>

                {/* Orders */}
                <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmtN(mb.total_orders)}
                </td>

                {/* Amount */}
                <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap" }}>
                  {fmt$(mb.total_amount)}
                </td>

                {/* Progress bar */}
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#f1f5f9", marginBottom: 4 }}>
                    {SEGS.map(seg => {
                      const cnt = +(mb[seg.key] || 0);
                      return cnt > 0
                        ? <div key={seg.key} title={`${seg.label}: ${cnt}`} style={{ flex: cnt, background: seg.color, minWidth: 3 }} />
                        : null;
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {SEGS.map(seg => {
                      const cnt = +(mb[seg.key] || 0);
                      return cnt > 0
                        ? <span key={seg.key} style={{ fontSize: "0.64rem", color: seg.color, fontWeight: 600 }}>{cnt} {seg.label}</span>
                        : null;
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function Alerts({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "9px 14px", borderRadius: 8, fontSize: "0.82rem",
          background: a.level === "error" ? "#fef2f2" : "#fffbeb",
          border: `1px solid ${a.level === "error" ? "#fca5a5" : "#fde68a"}`,
          color: a.level === "error" ? "#dc2626" : "#92400e",
        }}>
          {a.level === "error"
            ? <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            : <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />}
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── All-status summary ────────────────────────────────────────────────────────
function StatusSummary({ allStatuses }) {
  if (!allStatuses?.length) return null;
  const ORDER  = ["pending","approved","funded","placed","submitted","settled","failed","cancelled"];
  const COLORS = {
    pending:   { bg:"#fef3c7", fg:"#92400e" }, approved:  { bg:"#dbeafe", fg:"#1d4ed8" },
    funded:    { bg:"#dcfce7", fg:"#166534" }, placed:    { bg:"#ede9fe", fg:"#5b21b6" },
    submitted: { bg:"#fce7f3", fg:"#9d174d" }, settled:   { bg:"#ecfdf5", fg:"#059669" },
    failed:    { bg:"#fee2e2", fg:"#dc2626" }, cancelled: { bg:"#f3f4f6", fg:"#6b7280" },
  };
  const sorted = [...allStatuses].sort((a,b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
      <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
        All Orders by Status
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {sorted.map(s => {
          const c = COLORS[s.status] || COLORS.cancelled;
          return (
            <div key={s.status} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "6px 12px", borderRadius: 8,
              background: c.bg, border: `1px solid ${c.fg}20`,
            }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: c.fg, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.status}</span>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: c.fg, fontVariantNumeric: "tabular-nums" }}>{fmtN(s.cnt)}</span>
              <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>{fmt$(s.total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PipelineDashboard() {
  const navigate     = useNavigate();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [lastAt, setLastAt]     = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await apiPost("pipeline-status.php");
      if (res?.success) { setData(res); setLastAt(new Date()); }
      else setError(res?.error || "Failed to load");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(() => load(true), 30000);
    return () => clearInterval(timer.current);
  }, [load]);

  const { locked, inflight } = deriveLock(data?.merchant_batches);
  const activeBatchId = inflight?.[0]?.batch_id || data?.active_batch_id || null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 65%, #1d4ed8 100%)",
        padding: "18px 28px",
      }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TrendingUp size={22} color="#fff" />
            <div>
              <h1 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>
                IB Order Pipeline Dashboard
              </h1>
              <p style={{ margin: 0, fontSize: "0.73rem", color: "rgba(255,255,255,0.58)" }}>
                StockLoyal as Introducing Broker — end-to-end cycle mission control
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastAt && (
              <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>
                <Clock size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                {fmtAgo(lastAt)}
              </span>
            )}
            <button onClick={() => load(true)} disabled={refreshing} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
            }}>
              <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 28px" }}>

        {loading && (
          <div style={{ textAlign: "center", padding: "5rem", color: "#94a3b8" }}>
            <RefreshCw size={26} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
            <div>Loading pipeline status…</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 14, borderRadius: 10, background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", marginBottom: 20 }}>
            <AlertCircle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {error}
          </div>
        )}

        {data && !loading && (() => {
          const { stages, merchant_batches, all_statuses, alerts, last_cron } = data;
          return (
            <>
              {/* Alerts */}
              <Alerts alerts={alerts} />

              {/* Cycle lock banner */}
              <CycleBanner
                locked={locked}
                inflight={inflight}
                stages={stages}
                activeBatchId={activeBatchId}
              />

              {/* Vertical stack */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>

                {/* Vertical subway order flow */}
                <OrderFlowSubway stages={stages} navigate={navigate} />

                {/* Merchant batch table */}
                <MerchantBatchTable merchantBatches={merchant_batches} navigate={navigate} />

                {/* Cron status */}
                {last_cron && (
                  <div style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                      Last Cron Run
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: "0.82rem" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "3px 9px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700,
                        background: last_cron.status === "completed" ? "#dcfce7" : "#fee2e2",
                        color: last_cron.status === "completed" ? "#166534" : "#dc2626",
                        border: "1px solid",
                        borderColor: last_cron.status === "completed" ? "#86efac" : "#fca5a5",
                      }}>
                        <Activity size={11} /> {last_cron.status}
                      </span>
                      <span style={{ color: "#6b7280" }}>{fmtAgo(last_cron.completed_at || last_cron.started_at)}</span>
                      {last_cron.orders_submitted > 0 && <span style={{ color: "#374151" }}>{last_cron.orders_submitted} submitted</span>}
                      {last_cron.orders_failed > 0 && <span style={{ color: "#dc2626" }}>{last_cron.orders_failed} failed</span>}
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                          background: ["open","early_close"].includes(last_cron.market_status) ? "#10b981" : "#94a3b8",
                        }} />
                        <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                          Market {(last_cron.market_status || "unknown").toUpperCase()}
                        </span>
                      </span>
                    </div>
                  </div>
                )}

                {/* All-status summary */}
                <StatusSummary allStatuses={all_statuses} />

              </div>

              <div style={{ fontSize: "0.7rem", color: "#94a3b8", textAlign: "right" }}>
                Auto-refreshes every 30s
              </div>
            </>
          );
        })()}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
