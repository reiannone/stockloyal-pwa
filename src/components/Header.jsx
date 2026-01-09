// src/components/Header.jsx (Option A + SHOW memberId on header next to avatar)
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import logo from "/logos/stockloyal.png";
import SlideOutPanel from "./SlideOutPanel";
import { useBasket } from "../context/BasketContext";
import InstallButton from "./InstallButton";
import UserAvatar from "./UserAvatar";

// NOTE: This is based on your uploaded Header.jsx debug version :contentReference[oaicite:0]{index=0}
// Change: renders memberId as a small chip next to the avatar on the header bar,
// and listens for "member-updated" (Option A) so same-tab changes re-render.

export default function Header() {
  const location = useLocation();
  const { basket } = useBasket();
  const [showMenu, setShowMenu] = useState(false);
  const [userAvatar, setUserAvatar] = useState(null);
  const [memberId, setMemberId] = useState(null);

  // Load user avatar + memberId from localStorage, and wire update listeners
  useEffect(() => {
    const savedAvatar = localStorage.getItem("userAvatar");
    const savedMemberId = localStorage.getItem("memberId");

    console.log("🔍 Header Debug - memberId from localStorage:", savedMemberId);
    console.log("🔍 Header Debug - all localStorage keys:", Object.keys(localStorage));

    setUserAvatar(savedAvatar);
    setMemberId(savedMemberId);

    // OTHER-tab updates only
    const handleStorageChange = (e) => {
      if (e.key === "userAvatar") setUserAvatar(e.newValue);
      if (e.key === "memberId") {
        console.log("🔍 memberId changed (storage event):", e.newValue);
        setMemberId(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // Same-tab custom events
    const handleAvatarUpdate = () => {
      const a = localStorage.getItem("userAvatar");
      setUserAvatar(a);
    };
    window.addEventListener("avatar-updated", handleAvatarUpdate);

    // ✅ Option A: same-tab memberId updates
    const handleMemberUpdate = () => {
      const id = localStorage.getItem("memberId");
      console.log("🔁 member-updated event:", id);
      setMemberId(id);
    };
    window.addEventListener("member-updated", handleMemberUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("avatar-updated", handleAvatarUpdate);
      window.removeEventListener("member-updated", handleMemberUpdate);
    };
  }, []);

  const allPages = [
    { to: "/login", label: "1. Login" },
    { to: "/member-onboard", label: "2. Member Profile" },
    { to: "/select-broker", label: "3. Select Broker" },
    { to: "/election", label: "4. Investment Election" },
    { to: "/wallet", label: "5. Wallet" },
    { to: "/stock-picker", label: "6. Stock Picker" },
    { to: "/portfolio", label: "StockLoyal Portfolio" },
    { to: "/transactions", label: "Order History" },
    { to: "/ledger", label: "Transaction Ledger" },
    { to: "/promotions", label: "Promotions" },
    { to: "/social", label: "Community Feed" },
    { to: "/terms", label: "Terms & Conditions" },
    { to: "/about", label: "About & FAQs" },
  ];

  // Progress steps in order
  const progressSteps = [
    { path: "/login", label: "Login" },
    { path: "/member-onboard", label: "Onboarding" },
    { path: "/select-broker", label: "Broker" },
    { path: "/terms", label: "Terms" },
    { path: "/election", label: "Election" },
    { path: "/wallet", label: "Wallet" },
    { path: "/stock-picker", label: "Convert" },
    { path: "/basket", label: "Basket" },
    { path: "/order", label: "Order" },
  ];

  const currentStepIndex = progressSteps.findIndex(
    (step) => location.pathname === step.path
  );
  const isInProgressFlow = currentStepIndex !== -1;

  const totalSteps = progressSteps.length;
  const currentStep = isInProgressFlow ? progressSteps[currentStepIndex] : null;

  // Donut progress values
  const progressFraction = isInProgressFlow ? (currentStepIndex + 1) / totalSteps : 0;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressFraction);

  console.log("🎨 Header Render - memberId state:", memberId);

  return (
    <div>
      <header
        className="app-header bg-white border-b border-gray-200 shadow-sm h-12"
        style={{
          padding: "0 8px",
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* LEFT: Avatar + memberId chip + Menu button */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {/* User Avatar - clickable to open menu */}
          <button
            type="button"
            aria-label="User profile"
            onClick={() => setShowMenu(true)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <UserAvatar src={userAvatar} size="md" alt="User Profile" />
          </button>

          {/* ✅ Member ID chip (visible on header next to avatar) */}
          <button
            type="button"
            aria-label="Open menu (member id)"
            onClick={() => setShowMenu(true)}
            style={{
              border: "1px solid #e5e7eb",
              background: "#f3f4f6",
              color: "#111827",
              borderRadius: 9999,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "monospace",
              fontWeight: 700,
              cursor: "pointer",
              maxWidth: 165,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1,
            }}
            title={memberId || ""}
          >
            {memberId ? `ID: ${memberId}` : "ID: —"}
          </button>

          {/* Menu Icon */}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setShowMenu(true)}
            style={{
              width: 40,
              height: 40,
              border: "none",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <Menu className="w-6 h-6 text-gray-800" strokeWidth={2} />
          </button>
        </div>

        {/* CENTER: Logo - absolutely positioned */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <img src={logo} alt="StockLoyal" style={{ height: 30, width: "auto" }} />
        </div>

        {/* RIGHT: Donut progress indicator */}
        <div
          style={{
            marginLeft: "auto",
            marginRight: 8,
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isInProgressFlow && currentStep && (
            <div style={{ position: "relative", width: 40, height: 40 }}>
              <svg
                width="40"
                height="40"
                viewBox="0 0 44 44"
                style={{ transform: "rotate(-90deg)" }}
              >
                <circle cx="22" cy="22" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="5" />
                <circle
                  cx="22"
                  cy="22"
                  r={radius}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    fontSize: "0.55rem",
                    textAlign: "center",
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  {currentStep.label}
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Slide-out menu panel */}
      <SlideOutPanel
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        title="Menu"
        side="right"
        width={260}
        zIndex={2200}
        anchorSelector="body"
      >
        {/* User Profile Section at top of menu */}
        <div
          style={{
            padding: "16px",
            borderBottom: "2px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            backgroundColor: "#f9fafb",
          }}
        >
          <UserAvatar src={userAvatar} size="lg" alt="Your Profile" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "600", color: "#111827", fontSize: "16px" }}>
              {localStorage.getItem("userName") || "User"}
            </div>

            {/* DEBUG: Always show memberId - VERY VISIBLE */}
            <div
              style={{
                fontSize: "12px",
                color: "#ffffff",
                fontFamily: "monospace",
                marginTop: "4px",
                marginBottom: "4px",
                backgroundColor: "#3b82f6",
                padding: "6px 8px",
                borderRadius: "4px",
                fontWeight: "600",
                textAlign: "center",
                border: "2px solid #1e40af",
              }}
            >
              {memberId ? `MEMBER ID: ${memberId}` : "⚠️ NO MEMBER ID ⚠️"}
            </div>

            <Link
              to="/member-onboard"
              onClick={() => setShowMenu(false)}
              style={{ fontSize: "12px", color: "#2563eb", textDecoration: "none" }}
            >
              Edit Profile
            </Link>
          </div>
        </div>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {allPages.map(({ to, label }, idx) => (
            <li key={to} style={{ borderTop: idx === 0 ? "none" : "1px solid #e5e7eb" }}>
              <Link
                to={to}
                onClick={() => setShowMenu(false)}
                className={`flex items-center w-full text-gray-700 transition hover:bg-gray-100 ${
                  location.pathname === to ? "bg-gray-50 font-medium text-blue-600" : ""
                }`}
                style={{
                  padding: "8px 12px",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span>{label}</span>

                {to === "/basket" && basket.length > 0 && (
                  <span
                    style={{
                      marginLeft: "auto",
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9999,
                      background: "#111827",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.7rem",
                      padding: "0 4px",
                    }}
                  >
                    {basket.length}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        {/* Install App button at the bottom of menu */}
        <div style={{ padding: "12px", borderTop: "2px solid #e5e7eb", marginTop: "8px" }}>
          <InstallButton />
        </div>
      </SlideOutPanel>
    </div>
  );
}
