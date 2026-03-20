// src/components/OrderPipeline.jsx
//
// UNIFIED pipeline header — appears at the top of every pipeline admin page.
//
// Exports:
//   default OrderPipeline    — subway nav component, rendered on every page
//   useCycleGate(pageKey, selectedPair)
//                            — hook: returns gate state for the current page
//   PipelineGateBanner       — banner: renders when gate.blocked is true
//
// Gate page keys and what they check:
//   'payment'  → stage_orders   must be 'completed'  (Prepare Orders done)
//   'journal'  → stage_funding  must be 'completed'  (Fund IB Sweep done)
//   'sweep'    → stage_journal  must be 'completed'  (Journal Funds done)
//
// RAG status per step (derived from all active cycles):
//   grey  — no active cycles, or all pending
//   green — any cycle in_progress or staged (trial ready for approval), or partial progress
//   amber — any cycle blocked (stuck/failed prerequisite)
//   red   — any cycle failed
//   blue  — all active cycles completed/skipped for this step

import { useState, useEffect, useCallback, useContext, createContext } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import {
  ClipboardCheck, CreditCard, ArrowRightLeft, Repeat2, Zap,
  CheckCircle2, RefreshCw, Lock, AlertTriangle, ArrowRight,
  AlertCircle, Clock,
} from "lucide-react";

// ── Step definitions ──────────────────────────────────────────────────────────
export const PIPELINE_STEPS = [
  { step: 1, key: "prepare",   to: "/prepare-orders",      label: "Prepare Orders",   sub: "Stage baskets",       icon: ClipboardCheck, color: "#8b5cf6" },
  { step: 2, key: "payment",   to: "/payments-processing", label: "Fund IB Sweep",    sub: "Merchant → SL Sweep", icon: CreditCard,     color: "#f59e0b" },
  { step: 3, key: "journal",   to: "/journal-admin",       label: "Journal Funds",    sub: "SL Sweep → Members",  icon: ArrowRightLeft, color: "#10b981" },
  { step: 4, key: "sweep",     to: "/sweep-admin",         label: "Order Sweep",      sub: "Submit to broker",    icon: Repeat2,        color: "#6366f1" },
  { step: 5, key: "execution", to: "/admin-broker-exec",   label: "Broker Execution", sub: "Confirm trades",      icon: Zap,            color: "#3b82f6" },
];

// ── Stage columns per step ────────────────────────────────────────────────────
// Maps each logical step key to the stage_* DB columns that represent it.
const STEP_STAGE_COLS = {
  prepare:   ["stage_orders"],                          // stage_baskets is internal orchestrator only
  payment:   ["stage_payment", "stage_funding"],
  journal:   ["stage_journal"],
  sweep:     ["stage_placement", "stage_submission"],
  execution: ["stage_execution", "stage_settlement"],
};

// ── RAG status derivation ─────────────────────────────────────────────────────
//
// Given all active cycles, compute the RAG status for one pipeline step.
//
// Priority (highest wins):
//   red   — any cycle has 'failed' on any of this step's stage columns
//   amber — any cycle has 'staged', 'blocked', or 'in_progress';
//           OR some cycles are completed while others are still pending
//   blue  — every active cycle is 'completed' or 'skipped' for ALL stage cols
//   green — at least one cycle has started (in_progress) and none are failed
//   grey  — no active cycles, or all pending
//
// Returns one of: 'none' | 'in_progress' | 'staged' | 'failed' | 'completed' | 'partial'
function computeStepRag(stepKey, cycles) {
  if (!cycles || cycles.length === 0) return "none";

  const cols = STEP_STAGE_COLS[stepKey] || [];

  // Rank per-column status — lower = worse.
  // staged ranks above in_progress (trial complete, awaiting approval = good state).
  const RANK = { failed: 0, blocked: 1, pending: 2, in_progress: 3, staged: 4, completed: 5, skipped: 5 };

  const worstPerCycle = cycles.map(c => {
    const statuses = cols.map(col => c[col] || "pending");
    return statuses.reduce((worst, s) =>
      (RANK[s] ?? 2) < (RANK[worst] ?? 2) ? s : worst
    , "completed");
  });

  const hasFailed     = worstPerCycle.some(s => s === "failed");
  const hasBlocked    = worstPerCycle.some(s => s === "blocked");
  const hasStaged     = worstPerCycle.some(s => s === "staged");
  const hasInProgress = worstPerCycle.some(s => s === "in_progress");
  const allDone       = worstPerCycle.every(s => s === "completed" || s === "skipped");
  const someDone      = worstPerCycle.some(s => s === "completed" || s === "skipped");
  const allPending    = worstPerCycle.every(s => s === "pending");

  if (hasFailed)                 return "failed";      // red
  if (hasBlocked)                return "blocked";     // amber — something is stuck
  if (hasInProgress || hasStaged) return "in_progress"; // green — active / trial ready
  if (allDone)                   return "completed";   // blue — all done
  if (someDone && !allPending)   return "partial";     // green — progressing
  return "none";                                       // grey — not started
}

// ── RAG → visual config ───────────────────────────────────────────────────────
function ragVisual(rag) {
  switch (rag) {
    case "completed":   return { bg: "#3b82f6", label: "Complete",        icon: "check" };
    case "in_progress": return { bg: "#10b981", label: "Active",          icon: "step"  };
    case "partial":     return { bg: "#10b981", label: "In progress",     icon: "step"  };
    case "blocked":     return { bg: "#f59e0b", label: "Blocked",         icon: "clock" };
    case "failed":      return { bg: "#ef4444", label: "Failed",          icon: "alert" };
    default:            return { bg: "#d1d5db", label: "Not started",     icon: "step"  };
  }
}

// ── Gate config ───────────────────────────────────────────────────────────────
const GATE_CONFIG = {
  payment: {
    requiredStage: "orders",
    requiredLabel: "Prepare Orders",
    requiredPath:  "/prepare-orders",
    hint:          "Approve an order batch on Prepare Orders before processing payment.",
  },
  journal: {
    requiredStage: "funding",
    requiredLabel: "Fund IB Sweep",
    requiredPath:  "/payments-processing",
    hint:          "Complete merchant payment on Fund IB Sweep before journaling funds.",
  },
  sweep: {
    requiredStage: "journal",
    requiredLabel: "Journal Funds",
    requiredPath:  "/journal-admin",
    hint:          "Complete journal transfers on Journal Funds before running the sweep.",
  },
};

// ── useCycleGate ──────────────────────────────────────────────────────────────
export function useCycleGate(pageKey, selectedPair = "") {
  const [cycles,  setCycles]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiPost("pipeline-cycles.php", { action: "list", limit: 100 })
      .then(res => {
        if (res?.success) {
          const open = (res.cycles || []).filter(c =>
            ["open", "locked"].includes(c.status)
          );
          setCycles(open);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cfg = GATE_CONFIG[pageKey];

  if (!cfg) {
    return { loading, blocked: false, cycles, readyCycles: cycles, blockedCycles: [], cfg: null };
  }

  const cycleKey = c =>
    c.merchant_id_str && c.broker_id ? `${c.merchant_id_str}|${c.broker_id}`
    : c.merchant_id_str || "";

  const isReady       = c => c[`stage_${cfg.requiredStage}`] === "completed";
  const readyCycles   = cycles.filter(c =>  isReady(c));
  const blockedCycles = cycles.filter(c => !isReady(c));

  let blocked = false;
  if (selectedPair) {
    const thisCycle = cycles.find(c => cycleKey(c) === selectedPair);
    blocked = thisCycle ? !isReady(thisCycle) : false;
  } else {
    blocked = cycles.length > 0 && readyCycles.length === 0;
  }

  return { loading, blocked, cycles, readyCycles, blockedCycles, cfg };
}

// ── PipelineGateBanner ────────────────────────────────────────────────────────
export function PipelineGateBanner({ gate }) {
  const navigate = useNavigate();
  if (!gate?.blocked || !gate?.cfg) return null;

  const { cfg, blockedCycles } = gate;

  const stageColors = {
    pending:     { bg: "#f3f4f6", fg: "#6b7280" },
    in_progress: { bg: "#dbeafe", fg: "#1d4ed8" },
    staged:      { bg: "#fff7ed", fg: "#c2410c" },
    failed:      { bg: "#fee2e2", fg: "#991b1b" },
    blocked:     { bg: "#fef3c7", fg: "#b45309" },
  };

  return (
    <div style={{
      borderRadius: 10, border: "2px solid #fde68a",
      background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
      padding: "28px 32px", marginBottom: 20,
      display: "flex", alignItems: "flex-start", gap: 20,
    }}>
      <div style={{
        flexShrink: 0, width: 52, height: 52, borderRadius: "50%",
        background: "#fef9c3", border: "2px solid #f59e0b",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Lock size={24} color="#d97706" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#92400e", marginBottom: 6 }}>
          Previous step not yet complete
        </div>
        <div style={{ fontSize: "0.875rem", color: "#78350f", marginBottom: 16, lineHeight: 1.6 }}>
          {cfg.hint}
        </div>
        {blockedCycles.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#92400e",
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
              Cycles waiting on {cfg.requiredLabel}:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {blockedCycles.map((c, i) => {
                const stageVal = c[`stage_${cfg.requiredStage}`] || "pending";
                const sc = stageColors[stageVal] || stageColors.pending;
                return (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 12px", borderRadius: 20,
                    background: "#fff", border: "1px solid #fde68a",
                    fontSize: "0.78rem", fontWeight: 600, color: "#78350f",
                  }}>
                    <AlertTriangle size={11} color="#d97706" />
                    {c.merchant_name || c.merchant_id_str}
                    {c.broker_name ? ` · ${c.broker_name}` : ""}
                    <span style={{ marginLeft: 4, padding: "1px 6px", borderRadius: 8,
                      fontSize: "0.65rem", background: sc.bg, color: sc.fg, fontWeight: 700 }}>
                      {stageVal}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <button
          onClick={() => navigate(cfg.requiredPath)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 20px", borderRadius: 8,
            background: "#d97706", color: "#fff",
            border: "none", fontWeight: 700, fontSize: "0.875rem",
            cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }}
        >
          Go to {cfg.requiredLabel}
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Shared status context ─────────────────────────────────────────────────────
const PipelineContext = createContext(null);

export function usePipelineStatus() {
  return useContext(PipelineContext) || {};
}

// ── Internal fetch hook — cycles + pipeline-status ────────────────────────────
function useFetch(refreshKey = 0) {
  const [status, setStatus]   = useState(null);
  const [cycles, setCycles]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, cyclesRes] = await Promise.all([
        apiPost("pipeline-status.php").catch(() => null),
        apiPost("pipeline-cycles.php", { action: "list", limit: 100 }).catch(() => null),
      ]);
      if (statusRes?.success) setStatus(statusRes);
      if (cyclesRes?.success) {
        setCycles(
          (cyclesRes.cycles || []).filter(c => ["open", "locked"].includes(c.status))
        );
      }
    } catch (e) {
      console.warn("[OrderPipeline] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch immediately whenever refreshKey changes (triggered by parent after a stage update)
  useEffect(() => { load(); }, [refreshKey, load]);

  // Also poll every 30s
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return { status, cycles, loading, reload: load };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT — OrderPipeline component
// ─────────────────────────────────────────────────────────────────────────────
export default function OrderPipeline({
  currentStep,
  refreshKey   = 0,
  stepStatuses = {},   // optional override: { prepare: 'in_progress', payment: 'completed', ... }
  title    = "IB Order Processing Pipeline",
  subtitle = "StockLoyal as Introducing Broker — fund IB sweep → fund members → trade",
}) {
  const navigate = useNavigate();
  const own = useFetch(refreshKey);

  return (
    <PipelineContext.Provider value={{ status: own.status, loading: own.loading, reload: own.reload }}>
      <div style={{
        marginBottom: 24, borderRadius: 10,
        border: "1px solid #e2e8f0",
        background: "#fff", overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        {/* Title row */}
        <div style={{
          padding: "12px 24px 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
              {title}
            </h3>
            <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>{subtitle}</p>
          </div>
          {own.loading && (
            <RefreshCw size={13} color="#94a3b8"
              style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
          )}
        </div>

        {/* Subway stepper with RAG */}
        <Stepper currentStep={currentStep} cycles={own.cycles} stepStatuses={stepStatuses} navigate={navigate} />

        {/* RAG legend */}
        <RagLegend />

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </PipelineContext.Provider>
  );
}

// ── RAG Legend ────────────────────────────────────────────────────────────────
function RagLegend() {
  const items = [
    { color: "#d1d5db", label: "Not started" },
    { color: "#10b981", label: "In progress"  },
    { color: "#f59e0b", label: "Blocked / issue" },
    { color: "#ef4444", label: "Failed"       },
    { color: "#3b82f6", label: "Complete"     },
  ];
  return (
    <div style={{
      display: "flex", gap: 16, padding: "6px 24px 10px",
      borderTop: "1px solid #f1f5f9", flexWrap: "wrap",
    }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: "#6b7280" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ currentStep, cycles, stepStatuses = {}, navigate }) {
  return (
    <div style={{ padding: "18px 24px 16px", position: "relative" }}>
      {/* Connecting line */}
      <div style={{
        position: "absolute", top: 40, left: 50, right: 50,
        height: 3, background: "#e5e7eb", zIndex: 0,
      }} />

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${PIPELINE_STEPS.length}, 1fr)`,
        gap: 4, position: "relative", zIndex: 1,
      }}>
        {PIPELINE_STEPS.map((step) => {
          const isActive = step.step === currentStep;
          // stepStatuses prop takes precedence over computed RAG from DB cycles
          const rag      = stepStatuses[step.key] ?? computeStepRag(step.key, cycles);
          const vis      = ragVisual(rag);
          const Icon     = step.icon;

          // Circle icon: completed → checkmark, failed → alert, staged → clock, else step icon
          const CircleIcon =
            rag === "completed"              ? CheckCircle2 :
            rag === "failed"                 ? AlertCircle  :
            rag === "blocked"                ? Clock        :
            Icon;

          return (
            <div
              key={step.step}
              onClick={() => navigate(step.to)}
              title={vis.label}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                cursor: "pointer", transition: "transform 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              {/* Circle */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: vis.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white",
                // Active page: bright ring on top of RAG color
                border: isActive
                  ? `3px solid ${step.color}`
                  : "3px solid transparent",
                boxShadow: isActive
                  ? `0 0 0 4px ${step.color}40, 0 0 0 2px ${vis.bg}`
                  : rag !== "none"
                    ? `0 0 0 3px ${vis.bg}60`
                    : "none",
                transition: "background 0.3s, box-shadow 0.3s",
              }}>
                <CircleIcon size={18} />
              </div>

              {/* Label */}
              <div style={{
                marginTop: 8, textAlign: "center", fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? step.color
                  : rag === "failed"                    ? "#dc2626"
                  : rag === "blocked"                   ? "#b45309"
                  : rag === "completed"                 ? "#1d4ed8"
                  : rag === "in_progress" || rag === "partial" ? "#047857"
                  : "#9ca3af",
                lineHeight: 1.3,
              }}>
                {step.label}
              </div>

              {/* Sub-label */}
              <div style={{ textAlign: "center", fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                {step.sub}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
