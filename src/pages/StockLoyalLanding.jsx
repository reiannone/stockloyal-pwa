// src/pages/StockLoyalLanding.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserPlus,
  Building2,
  Vote,
  Wallet,
  LineChart,
  Briefcase,
  ClipboardList,
  BookOpen,
  Gift,
  Users,
  FileText,
  HelpCircle,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  FileTextIcon,
  Landmark,
  Handshake,
} from "lucide-react";
import { apiPost } from "../api.js";

export default function StockLoyalLanding() {
  const navigate = useNavigate();

  const points = localStorage.getItem("points") || "0";
  const memberId = localStorage.getItem("memberId");

  // ── Points refresh state ──
  const [displayPoints, setDisplayPoints] = useState(points);
  const [refreshing, setRefreshing] = useState(false);

  const refreshPoints = async () => {
    if (!memberId || refreshing) return;
    setRefreshing(true);
    try {
      const data = await apiPost("get-wallet.php", { member_id: memberId });
      if (data?.success && data?.wallet) {
        const fresh = String(data.wallet.points_balance ?? data.wallet.points ?? "0");
        setDisplayPoints(fresh);
        localStorage.setItem("points", fresh);
        window.dispatchEvent(new Event("member-updated"));
      }
    } catch (err) {
      console.warn("[StockLoyalLanding] Could not refresh points:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Completion state ──
  const [profileComplete, setProfileComplete] = useState(false);
  const [electionComplete, setElectionComplete] = useState(false);
  const [electionType, setElectionType] = useState("");
  const brokerComplete = !!localStorage.getItem("broker") || !!localStorage.getItem("selectedBroker");

  // ── Check profile + election from database ──
  useEffect(() => {
    if (!memberId) return;

    (async () => {
      try {
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (data?.success && data?.wallet) {
          const w = data.wallet;

          // Mandatory profile fields
          const mandatoryFields = [
            w.member_id,          // Member ID
            w.first_name,         // First Name
            w.last_name,          // Last Name
            w.member_email,       // Email
            w.member_address_line1, // Address Line 1
            w.member_town_city,   // City / Town
            w.member_state,       // State
            w.member_zip,         // ZIP Code
            w.member_country,     // Country
            w.member_timezone,    // Local Timezone
          ];

          // All mandatory fields must be truthy (non-empty)
          const allFilled = mandatoryFields.every((val) => !!val && String(val).trim() !== "");
          setProfileComplete(allFilled);

          // Election complete when election_type is set
          const elType = w.election_type || w.electionType || "";
          setElectionType(elType.trim());
          setElectionComplete(!!elType && String(elType).trim() !== "");
        }
      } catch (err) {
        console.warn("[StockLoyalLanding] Could not check profile completeness:", err);
      }
    })();
  }, [memberId]);

  // ── Subway steps (the numbered member journey) ──
  const journeySteps = [
    {
      to: null,
      key: "points-balance",
      label: "Points Balance Available",
      subtitle: null,
      icon: <Wallet size={20} />,
      color: "#10b981",
      step: 1,
      pointsPill: true,
      onAction: refreshPoints,
    },
    {
      to: "/member-onboard",
      label: "Member Profile",
      subtitle: profileComplete ? "Profile complete" : "Complete your profile",
      icon: <UserPlus size={20} />,
      color: "#8b5cf6",
      step: 2,
      complete: profileComplete,
    },
    {
      to: "/select-broker",
      label: "Select Broker",
      subtitle: brokerComplete
        ? `${localStorage.getItem("brokerName") || "Broker"} selected`
        : "Link to your brokerage",
      icon: <Building2 size={20} />,
      color: "#3b82f6",
      step: 3,
      complete: brokerComplete,
    },
    {
      to: "/election",
      label: "Investment Election",
      subtitle: electionComplete
        ? `${electionType.charAt(0).toUpperCase() + electionType.slice(1)} election set`
        : "Investment Election",
      icon: <Vote size={20} />,
      color: "#0ea5e9",
      step: 4,
      complete: electionComplete,
    },
    {
      to: "/wallet",
      label: "Wallet",
      subtitle: "View points & cash",
      icon: <Wallet size={20} />,
      color: "#10b981",
      step: 5,
    },
    {
      to: "/stock-picker",
      label: "Stock Picker",
      subtitle: "Choose your stocks",
      icon: <LineChart size={20} />,
      color: "#22c55e",
      step: 6,
    },
  ];

  // ── Feature tiles (remaining pages) ──
  const featureTiles = [
    {
      to: "/portfolio",
      label: "StockLoyal Portfolio",
      icon: <Briefcase size={32} />,
      color: "#6366f1",
      bgColor: "#eef2ff",
    },
    {
      to: "/transactions",
      label: "Order Tracker",
      icon: <ClipboardList size={32} />,
      color: "#3b82f6",
      bgColor: "#eff6ff",
    },
    {
      to: "/ledger",
      label: "Transaction Ledger",
      icon: <BookOpen size={32} />,
      color: "#ec4899",
      bgColor: "#fdf2f8",
    },
    {
      to: "/promotions",
      label: "Promotions",
      icon: <Gift size={32} />,
      color: "#f59e0b",
      bgColor: "#fffbeb",
    },
    {
      to: "/social",
      label: "Community Feed",
      icon: <Users size={32} />,
      color: "#10b981",
      bgColor: "#ecfdf5",
    },
    {
      to: "/terms",
      label: "Terms & Conditions",
      icon: <Handshake size={32} />,
      color: "#8b5cf6",
      bgColor: "#f5f3ff",
    },
    {
      to: "/about",
      label: "About & FAQs",
      icon: <HelpCircle size={32} />,
      color: "#84cc16",
      bgColor: "#f7fee7",
    },
    {
      to: "/document-center",
      label: "Document Center",
      icon: <FileTextIcon size={32} />,
      color: "#84cc16",
      bgColor: "#f7fee7",
    },

  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f3f4f6",
        paddingBottom: "100px",
      }}
    >
      {/* Spin animation for refresh icon */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {/* ── Main Content ── */}
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "16px 16px 0" }}>

        {/* ── Vertical Subway Journey Map ── */}
        <div
          style={{
            marginBottom: "32px",
            padding: "24px",
            backgroundColor: "white",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
          }}
        >
          <h3
            style={{
              margin: "0 0 8px 0",
              fontSize: "16px",
              fontWeight: "600",
              color: "#374151",
            }}
          >
            Getting Started
          </h3>
          <p style={{ margin: "0 0 24px 0", fontSize: "13px", color: "#6b7280" }}>
            Follow each step to set up your account and start investing
          </p>

          {/* Vertical subway track */}
          <div style={{ position: "relative" }}>
            {/* Vertical connecting line */}
            <div
              style={{
                position: "absolute",
                top: "24px",
                bottom: "24px",
                left: "23px",
                width: "4px",
                backgroundColor: "#e5e7eb",
                borderRadius: "2px",
                zIndex: 0,
              }}
            />

            {/* Steps – each row: circle on left, tile on right */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0",
                position: "relative",
                zIndex: 1,
              }}
            >
              {journeySteps.map(({ to, key: customKey, label, subtitle, icon, color, step, pointsPill, complete, onAction }, idx) => {
                const displayColor = complete ? "#22c55e" : color;

                return (
                <button
                  key={customKey || to}
                  onClick={() => onAction ? onAction() : navigate(to)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "10px 0",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    transition: "transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateX(4px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateX(0)";
                  }}
                >
                  {/* Station circle */}
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      minWidth: "48px",
                      borderRadius: "50%",
                      backgroundColor: displayColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      boxShadow: complete
                        ? "0 4px 12px rgba(34,197,94,0.3)"
                        : "0 4px 12px rgba(0,0,0,0.15)",
                      border: "4px solid white",
                      position: "relative",
                    }}
                  >
                    {icon}
                    {/* ✅ Completion checkmark badge */}
                    {complete && (
                      <CheckCircle2
                        size={18}
                        color="#22c55e"
                        style={{
                          position: "absolute",
                          top: "-4px",
                          right: "-4px",
                          backgroundColor: "white",
                          borderRadius: "50%",
                        }}
                      />
                    )}
                  </div>

                  {/* Tile card – aligned right of the circle */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: complete ? "#f0fdf4" : "#f9fafb",
                      border: complete ? "1px solid #bbf7d0" : "1px solid #e5e7eb",
                      borderRadius: "10px",
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = displayColor;
                      e.currentTarget.style.boxShadow = `0 2px 8px ${displayColor}22`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = complete ? "#bbf7d0" : "#e5e7eb";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div>
                      {!pointsPill && (
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            color: displayColor,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            marginBottom: "2px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {complete ? (
                            <>
                              <CheckCircle2 size={12} />
                              Complete
                            </>
                          ) : (
                            `Step ${step}`
                          )}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: complete ? "#166534" : "#1f2937",
                          lineHeight: 1.3,
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: complete ? "#16a34a" : "#6b7280",
                          marginTop: "2px",
                        }}
                      >
                        {pointsPill ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              backgroundColor: "#ecfdf5",
                              color: "#059669",
                              border: "1px solid #a7f3d0",
                              borderRadius: "9999px",
                              padding: "3px 12px",
                              fontSize: "13px",
                              fontWeight: "700",
                              fontFamily: "monospace",
                            }}
                          >
                            <Gift size={14} />
                            {Number(displayPoints).toLocaleString()} pts
                            <RefreshCw
                              size={13}
                              style={{
                                marginLeft: "2px",
                                opacity: refreshing ? 1 : 0.5,
                                animation: refreshing ? "spin 1s linear infinite" : "none",
                              }}
                            />
                          </span>
                        ) : (
                          subtitle
                        )}
                      </div>
                    </div>

                    {pointsPill ? (
                      <RefreshCw
                        size={18}
                        color={refreshing ? "#10b981" : "#9ca3af"}
                        style={{
                          animation: refreshing ? "spin 1s linear infinite" : "none",
                        }}
                      />
                    ) : (
                      <ChevronRight size={18} color={complete ? "#22c55e" : "#9ca3af"} />
                    )}
                  </div>
                </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Feature Tiles Grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "16px",
          }}
        >
          {featureTiles.map(({ to, label, icon, color, bgColor }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px 16px",
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                minHeight: "140px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.1)";
                e.currentTarget.style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "12px",
                  backgroundColor: bgColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "12px",
                  color: color,
                }}
              >
                {icon}
              </div>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#374151",
                  textAlign: "center",
                  lineHeight: 1.3,
                }}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
