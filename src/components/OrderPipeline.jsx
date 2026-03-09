// src/components/OrderPipeline.jsx
//
// UNIFIED pipeline header — appears at the top of every pipeline admin page.
// Self-fetches pipeline-status.php. Exports usePipelineStatus() hook so the
// host page can share the same data without a second request.
//
// Usage in each pipeline page:
//   import OrderPipeline, { usePipelineStatus } from "../components/OrderPipeline";
//   const { status, loading } = usePipelineStatus();
//   ...
//   <OrderPipeline currentStep={2} status={status} />
//
// If `status` is not passed as a prop, the component fetches on its own.

import { useState, useEffect, useCallback, useContext, createContext } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import {
  ClipboardCheck, CreditCard, ArrowRightLeft, Repeat2, Zap,
  CheckCircle2, Lock, Unlock, LayoutDashboard, RefreshCw,
  AlertTriangle, Building2,
} from "lucide-react";

// ── Step definitions ──────────────────────────────────────────────────────────
export const PIPELINE_STEPS = [
  { step: 1, key: "prepare",   to: "/prepare-orders",      label: "Prepare Orders",   sub: "Stage baskets",       icon: ClipboardCheck, color: "#8b5cf6" },
  { step: 2, key: "payment",   to: "/payments-processing", label: "Fund IB Sweep",    sub: "Merchant → SL Sweep", icon: CreditCard,     color: "#f59e0b" },
  { step: 3, key: "journal",   to: "/journal-admin",       label: "Journal Funds",    sub: "SL Sweep → Members",  icon: ArrowRightLeft, color: "#10b981" },
  { step: 4, key: "sweep",     to: "/sweep-admin",         label: "Order Sweep",      sub: "Submit to broker",    icon: Repeat2,        color: "#6366f1" },
  { step: 5, key: "execution", to: "/admin-broker-exec",   label: "Broker Execution", sub: "Confirm trades",      icon: Zap,            color: "#3b82f6" },
];

// ── Shared status context (optional — for pages that want to consume it) ──────
const PipelineContext = createContext(null);

export function usePipelineStatus() {
  return useContext(PipelineContext) || {};
}

// ── Internal fetch hook ───────────────────────────────────────────────────────
function useFetch() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("pipeline-status.php");
      if (res?.success) setStatus(res);
    } catch (e) {
      console.warn("[OrderPipeline] pipeline-status fetch:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return { status, loading, reload: load };
}

// ── Derive count for a step from pipeline-status data ─────────────────────────
function stepCount(step, status) {
  if (!status?.stages) return null;
  const s = status.stages[step.key];
  if (!s) return null;
  if (step.key === "prepare") {
    return s.staged_batch?.total_orders ?? s.approved_batch?.total_orders ?? 0;
  }
  return s.count ?? 0;
}

// ── Lock state from merchant_batches ─────────────────────────────────────────
function deriveLockState(status) {
  const batches = status?.merchant_batches || [];
  const inflight = batches.filter(mb =>
    +mb.cnt_approved + +mb.cnt_funded + +mb.cnt_placed + +mb.cnt_submitted > 0
  );
  return {
    locked: inflight.length > 0,
    inflight,
    activeBatchId:
      status?.stages?.prepare?.staged_batch?.batch_id ||
      status?.stages?.prepare?.approved_batch?.batch_id ||
      inflight[0]?.batch_id || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOCK BANNER — the most prominent UI element; shown on every pipeline page
// ─────────────────────────────────────────────────────────────────────────────
function LockBanner({ lockState, navigate }) {
  const { locked, inflight, activeBatchId } = lockState;

  return (
    <div style={{
      borderRadius: "10px 10px 0 0",
      background: locked
        ? "linear-gradient(135deg, #92400e 0%, #b45309 100%)"
        : "linear-gradient(135deg, #14532d 0%, #15803d 100%)",
      padding: "12px 18px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 10,
    }}>

      {/* Left — icon + status + message */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {locked
            ? <Lock size={18} color="#fcd34d" />
            : <Unlock size={18} color="#86efac" />}
        </div>

        <div>
          <div style={{
            fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.08em",
            color: locked ? "#fef3c7" : "#dcfce7",
            textTransform: "uppercase",
          }}>
            {locked ? "⚠ Cycle in progress — batch locked" : "✓ Ready for new cycle"}
          </div>
          <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.72)", marginTop: 2 }}>
            {locked
              ? `${inflight.length} merchant batch${inflight.length > 1 ? "es" : ""} must fully settle before a new batch can be approved`
              : "All orders settled — you may prepare and approve a new batch"
            }
          </div>
        </div>
      </div>

      {/* Right — batch pill + blocked merchants + dashboard link */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {activeBatchId && (
          <span style={{
            fontSize: "0.72rem", fontFamily: "monospace",
            background: "rgba(255,255,255,0.12)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.25)",
            padding: "3px 9px", borderRadius: 5,
          }}>
            {activeBatchId}
          </span>
        )}

        {locked && inflight.map((mb, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: "0.7rem", fontWeight: 700,
            background: "#fef3c7", color: "#92400e",
            border: "1px solid #fcd34d",
            padding: "2px 8px", borderRadius: 12,
          }}>
            <Lock size={10} /> {mb.merchant_id}
          </span>
        ))}

        <button
          onClick={() => navigate("/pipeline-dashboard")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.1)",
            color: "#fff", fontSize: "0.75rem", fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <LayoutDashboard size={13} />
          Pipeline Dashboard
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUBWAY STEPPER
// ─────────────────────────────────────────────────────────────────────────────
function Stepper({ currentStep, status, navigate }) {
  return (
    <div style={{ padding: "18px 24px 20px", position: "relative" }}>
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
          const isActive    = step.step === currentStep;
          const isCompleted = step.step < currentStep;
          const count       = stepCount(step, status);
          const hasCount    = count !== null;
          const isZero      = count === 0;
          const Icon        = step.icon;

          const circleColor = isActive || isCompleted ? step.color : "#d1d5db";
          const opacity     = isActive ? 1 : isCompleted ? 0.65 : 0.4;

          return (
            <div
              key={step.step}
              onClick={() => navigate(step.to)}
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
                background: circleColor, opacity,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", position: "relative",
                border: isActive ? `3px solid ${step.color}` : "3px solid transparent",
                boxShadow: isActive ? `0 0 0 4px ${step.color}28` : "none",
              }}>
                {isCompleted ? <CheckCircle2 size={20} /> : <Icon size={18} />}

                {/* Red count badge */}
                {hasCount && !isZero && (
                  <div style={{
                    position: "absolute", top: -6, right: -6,
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
                {hasCount && isZero && (
                  <div style={{
                    position: "absolute", top: -4, right: -4,
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#22c55e", color: "white", fontSize: 11,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "2px solid white",
                  }}>✓</div>
                )}
              </div>

              <div style={{
                marginTop: 8, textAlign: "center", fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? step.color : isCompleted ? "#374151" : "#9ca3af",
                lineHeight: 1.3,
              }}>
                {step.label}
              </div>
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

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT — OrderPipeline component
// ─────────────────────────────────────────────────────────────────────────────
export default function OrderPipeline({
  currentStep,
  status: statusProp = null,         // pass from usePipelineStatus() to avoid double-fetch
  title    = "IB Order Processing Pipeline",
  subtitle = "StockLoyal as Introducing Broker — fund IB sweep → fund members → trade",
}) {
  const navigate = useNavigate();
  const own = useFetch();   // always runs; if statusProp provided we just prefer it
  const status   = statusProp ?? own.status;
  const lockState = deriveLockState(status);

  return (
    <PipelineContext.Provider value={{ status, loading: own.loading, reload: own.reload }}>
      <div style={{
        marginBottom: 24, borderRadius: 10,
        border: `2px solid ${lockState.locked ? "#fcd34d" : "#86efac"}`,
        background: "#fff", overflow: "hidden",
        boxShadow: lockState.locked ? "0 2px 12px #f59e0b1a" : "0 2px 8px #10b9811a",
      }}>

        {/* Prominent lock banner — always first */}
        <LockBanner lockState={lockState} navigate={navigate} />

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

        {/* Subway stepper */}
        <Stepper currentStep={currentStep} status={status} navigate={navigate} />

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </PipelineContext.Provider>
  );
}
