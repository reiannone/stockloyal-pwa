// src/components/OrderPipeline.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Paintbrush, Briefcase, CreditCard, CheckCircle2 } from "lucide-react";

/**
 * OrderPipeline - Subway-style timeline showing order processing steps
 * 
 * @param {number} currentStep - The current active step (1-4), or 0 for overview mode (all steps full color)
 * @param {object} counts - Optional queue counts { prepare, sweep, execute, payments_baskets, payments_orders }
 */
export default function OrderPipeline({ currentStep = 1, counts = null }) {
  const navigate = useNavigate();

  const steps = [
    { 
      to: "/prepare-orders", 
      label: "Prepare Orders", 
      subtitle: "Stage batches",
      icon: <ClipboardCheck size={18} />, 
      key: "prepare", 
      color: "#8b5cf6",
      step: 1
    },
    { 
      to: "/sweep-admin", 
      label: "Sweep Process", 
      subtitle: "Submit to brokers",
      icon: <Paintbrush size={18} />, 
      key: "sweep", 
      color: "#6366f1",
      step: 2
    },
    { 
      to: "/admin-broker-exec", 
      label: "Broker Execution", 
      subtitle: "Confirm trades",
      icon: <Briefcase size={18} />, 
      key: "execute", 
      color: "#3b82f6",
      step: 3
    },
    { 
      to: "/payments-processing", 
      label: "Payment Settlement", 
      subtitle: "Process ACH",
      icon: <CreditCard size={18} />, 
      key: "payments", 
      color: "#10b981",
      step: 4
    },
  ];

  return (
    <div
      style={{
        padding: "16px 20px",
        backgroundColor: "#f8fafc",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        marginBottom: "1.5rem",
      }}
    >
      {/* Timeline */}
      <div style={{ position: "relative" }}>
        {/* Connecting Line - Background */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "40px",
            right: "40px",
            height: "3px",
            backgroundColor: "#e2e8f0",
            zIndex: 0,
          }}
        />
        {/* Connecting Line - Progress */}
        {currentStep > 0 && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "40px",
            width: `calc(${((currentStep - 1) / 3) * 100}% - ${currentStep === 4 ? 80 : 40}px)`,
            height: "3px",
            backgroundColor: "#10b981",
            zIndex: 1,
            transition: "width 0.3s ease",
          }}
        />
        )}

        {/* Timeline Steps */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "4px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {steps.map(({ to, label, subtitle, icon, key, color, step }) => {
            const isOverview = currentStep === 0;
            const isActive = !isOverview && step === currentStep;
            const isCompleted = !isOverview && step < currentStep;
            const isPayments = key === "payments";
            const baskets = counts?.payments_baskets ?? null;
            const orders = counts?.payments_orders ?? null;
            const count = counts?.[key] ?? null;
            
            const paymentsIsZero = isPayments && baskets === 0 && orders === 0;
            const isZero = isPayments ? paymentsIsZero : count === 0;
            const hasData = counts != null && (isPayments ? (baskets !== null && orders !== null) : count !== null);

            // Determine circle color
            const circleColor = isOverview ? color : isActive ? color : isCompleted ? "#10b981" : "#cbd5e1";
            const circleSize = isActive ? 40 : 36;

            return (
              <button
                key={to}
                onClick={() => navigate(to)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "0",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "transform 0.2s",
                  opacity: isOverview || isActive ? 1 : 0.85,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.opacity = (isOverview || isActive) ? "1" : "0.85";
                }}
              >
                {/* Station Circle */}
                <div
                  style={{
                    width: `${circleSize}px`,
                    height: `${circleSize}px`,
                    borderRadius: "50%",
                    backgroundColor: circleColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    marginBottom: "8px",
                    boxShadow: isActive ? "0 4px 12px rgba(0,0,0,0.2)" : "0 2px 6px rgba(0,0,0,0.1)",
                    border: isActive ? "3px solid white" : "2px solid white",
                    position: "relative",
                    transition: "all 0.2s",
                  }}
                >
                  {isCompleted ? <CheckCircle2 size={18} /> : icon}
                  
                  {/* Badge for pending counts */}
                  {hasData && !isZero && !isCompleted && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-4px",
                        right: "-4px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        fontSize: "9px",
                        fontWeight: "700",
                        borderRadius: "8px",
                        padding: "1px 5px",
                        minWidth: "14px",
                        textAlign: "center",
                        border: "2px solid white",
                      }}
                    >
                      {isPayments ? orders : count}
                    </span>
                  )}
                  {/* Green checkmark when queue is empty */}
                  {hasData && isZero && (
                    <CheckCircle2
                      size={14}
                      color="#4ade80"
                      style={{
                        position: "absolute",
                        top: "-3px",
                        right: "-3px",
                        backgroundColor: "white",
                        borderRadius: "50%",
                      }}
                    />
                  )}
                </div>

                {/* Step indicator */}
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: "700",
                    color: isOverview ? color : isActive ? color : isCompleted ? "#10b981" : "#94a3b8",
                    marginBottom: "2px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Step {step}
                </div>

                {/* Label */}
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: isActive ? "700" : "500",
                    color: isOverview || isActive ? "#1f2937" : "#64748b",
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {label}
                </div>

                {/* Subtitle - show on active or overview */}
                {(isActive || isOverview) && (
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#6b7280",
                      textAlign: "center",
                      marginTop: "2px",
                    }}
                  >
                    {subtitle}
                  </div>
                )}

                {/* Payments extra info */}
                {isPayments && hasData && !isZero && (
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#ef4444",
                      fontWeight: "600",
                      marginTop: "2px",
                    }}
                  >
                    {baskets} basket{baskets !== 1 ? "s" : ""}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
