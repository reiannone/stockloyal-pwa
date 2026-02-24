// src/components/OrderPipeline.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  CreditCard,
  ArrowRightLeft,
  Paintbrush,
  Briefcase,
  CheckCircle2,
} from "lucide-react";

/**
 * IB Pipeline — 5 stages:
 *
 * 1. Prepare Orders    – Stage member order baskets from cash balances
 * 2. Settlement        – Merchant pays StockLoyal sweep account (ACH)
 * 3. Journal Funds     – Journal cash from SL firm sweep → member Alpaca accounts
 * 4. Order Sweep       – Submit stock orders through member accounts
 * 5. Broker Execution  – Confirm/settle trades at Alpaca
 */
const STEPS = [
  {
    step: 1,
    to: "/prepare-orders",
    label: "Prepare Orders",
    subtitle: "Stage baskets",
    icon: <ClipboardCheck size={18} />,
    key: "prepare",
    color: "#8b5cf6",
  },
  {
    step: 2,
    to: "/payments-processing",
    label: "Fund IB Sweep Account",
    subtitle: "Merchant → SL Sweep",
    icon: <CreditCard size={18} />,
    key: "settlement",
    color: "#f59e0b",
  },
  {
    step: 3,
    to: "/journal-admin",
    label: "Fund Member Accounts",
    subtitle: "SL Sweep → Members",
    icon: <ArrowRightLeft size={18} />,
    key: "journal",
    color: "#10b981",
  },
  {
    step: 4,
    to: "/sweep-admin",
    label: "Sweep Order Entry",
    subtitle: "Submit to broker",
    icon: <Paintbrush size={18} />,
    key: "sweep",
    color: "#6366f1",
  },
  {
    step: 5,
    to: "/admin-broker-exec",
    label: "Broker Execution",
    subtitle: "Confirm trades",
    icon: <Briefcase size={18} />,
    key: "execute",
    color: "#3b82f6",
  },
];

export default function OrderPipeline({
  currentStep,
  queueCounts = null,
  title = "IB Order Processing Pipeline",
  subtitle = "StockLoyal as Introducing Broker — settlement → funding → trading",
}) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        marginBottom: "24px",
        padding: "24px",
        backgroundColor: "white",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
      }}
    >
      {title && (
        <h3
          style={{
            margin: "0 0 4px 0",
            fontSize: "16px",
            fontWeight: "600",
            color: "#374151",
          }}
        >
          {title}
        </h3>
      )}
      {subtitle && (
        <p style={{ margin: "0 0 20px 0", fontSize: "12px", color: "#6b7280" }}>
          {subtitle}
        </p>
      )}

      {/* Subway Timeline */}
      <div style={{ position: "relative" }}>
        {/* Connecting Line */}
        <div
          style={{
            position: "absolute",
            top: "22px",
            left: "24px",
            right: "24px",
            height: "3px",
            backgroundColor: "#e5e7eb",
            zIndex: 0,
          }}
        />

        {/* Timeline Steps */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`,
            gap: "4px",
            position: "relative",
            zIndex: 1,
          }}
        >
          {STEPS.map(({ step, to, label, subtitle: stepSubtitle, icon, key, color }) => {
            const isActive = step === currentStep;
            const isCompleted = step < currentStep;

            // Queue count
            const count = queueCounts?.[key] ?? null;
            const hasData = queueCounts != null && count !== null;
            const isZero = count === 0;

            // Visual state
            const circleColor = isActive ? color : isCompleted ? color : "#d1d5db";
            const circleOpacity = isActive ? 1 : isCompleted ? 0.6 : 0.4;

            return (
              <div
                key={step}
                onClick={() => navigate(to)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  cursor: "pointer",
                  transition: "transform 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                {/* Circle */}
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    backgroundColor: circleColor,
                    opacity: circleOpacity,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    position: "relative",
                    border: isActive ? `3px solid ${color}` : "3px solid transparent",
                    boxShadow: isActive ? `0 0 0 3px ${color}33` : "none",
                  }}
                >
                  {isCompleted ? <CheckCircle2 size={20} /> : icon}

                  {/* Badge */}
                  {hasData && !isZero && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-6px",
                        right: "-6px",
                        minWidth: "20px",
                        height: "20px",
                        borderRadius: "10px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        fontSize: "11px",
                        fontWeight: "700",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 5px",
                        border: "2px solid white",
                      }}
                    >
                      {count}
                    </div>
                  )}

                  {/* Zero = checkmark badge */}
                  {hasData && isZero && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-4px",
                        right: "-4px",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        backgroundColor: "#22c55e",
                        color: "white",
                        fontSize: "11px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "2px solid white",
                      }}
                    >
                      ✓
                    </div>
                  )}
                </div>

                {/* Label */}
                <div
                  style={{
                    marginTop: "8px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: isActive ? "700" : "500",
                    color: isActive ? color : isCompleted ? "#374151" : "#9ca3af",
                    lineHeight: "1.3",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "10px",
                    color: "#9ca3af",
                    marginTop: "2px",
                  }}
                >
                  {stepSubtitle}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
