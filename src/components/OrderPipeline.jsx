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
  CheckCircle2, RefreshCw,
} from "lucide-react";

// ── Step definitions ──────────────────────────────────────────────────────────
export const PIPELINE_STEPS = [
  { step: 1, key: "prepare",   to: "/prepare-orders",      label: "Prepare Orders",   sub: "Stage baskets",       icon: ClipboardCheck, color: "#8b5cf6" },
  { step: 2, key: "payment",   to: "/payments-processing", label: "Fund IB Sweep",    sub: "Merchant → SL Sweep", icon: CreditCard,     color: "#f59e0b" },
  { step: 3, key: "journal",   to: "/journal-admin",             label: "Journal Funds",    sub: "SL Sweep → Members",  icon: ArrowRightLeft, color: "#10b981" },
  { step: 4, key: "sweep",     to: "/sweep",               label: "Order Sweep",      sub: "Submit to broker",    icon: Repeat2,        color: "#6366f1" },
  { step: 5, key: "execution", to: "/broker-exec",         label: "Broker Execution", sub: "Confirm trades",      icon: Zap,            color: "#3b82f6" },
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

// ── stepCount removed — subway map is nav-only, no per-step counts ───────────

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT — OrderPipeline component
// ─────────────────────────────────────────────────────────────────────────────
export default function OrderPipeline({
  currentStep,
  title    = "IB Order Processing Pipeline",
  subtitle = "StockLoyal as Introducing Broker — fund IB sweep → fund members → trade",
}) {
  const navigate = useNavigate();
  const own = useFetch();

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

        {/* Subway stepper */}
        <Stepper currentStep={currentStep} navigate={navigate} />

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </PipelineContext.Provider>
  );
}
function Stepper({ currentStep, navigate }) {
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
