// src/components/Header.jsx (Option A + SHOW memberId on header next to avatar)
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import logo from "/logos/stockloyal.png";
import SlideOutPanel from "./SlideOutPanel";
import { useBasket } from "../context/BasketContext";
import InstallAppModal from "./InstallAppModal";
import UserAvatar from "./UserAvatar";
import { apiPost } from "../api.js";

// NOTE: This is based on your uploaded Header.jsx debug version :contentReference[oaicite:0]{index=0}
// Change: renders memberId as a small chip next to the avatar on the header bar,
// and listens for "member-updated" (Option A) so same-tab changes re-render.

export default function Header() {
  const location = useLocation();
  const { basket } = useBasket();
  const [showMenu, setShowMenu] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [userAvatar, setUserAvatar] = useState(null);
  const [memberId, setMemberId] = useState(null);

  // Load user avatar + memberId from database and localStorage, and wire update listeners
  useEffect(() => {
    const savedMemberId = localStorage.getItem("memberId");

    console.log("🔍 Header Debug - memberId from localStorage:", savedMemberId);
    console.log("🔍 Header Debug - all localStorage keys:", Object.keys(localStorage));

    setMemberId(savedMemberId);

    // ✅ Load avatar from DATABASE, not localStorage
    if (savedMemberId) {
      (async () => {
        try {
          const data = await apiPost("get-wallet.php", { member_id: savedMemberId });
          if (data.success && data.wallet && data.wallet.member_avatar) {
            setUserAvatar(data.wallet.member_avatar);
            // Sync to localStorage for offline viewing
            localStorage.setItem("userAvatar", data.wallet.member_avatar);
          } else {
            // No avatar in database, clear localStorage
            setUserAvatar(null);
            localStorage.removeItem("userAvatar");
          }
        } catch (err) {
          console.error("Header: Error loading avatar from database:", err);
          // Fallback to localStorage only on network error
          const fallbackAvatar = localStorage.getItem("userAvatar");
          if (fallbackAvatar) setUserAvatar(fallbackAvatar);
        }
      })();
    }

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
    const handleAvatarUpdate = async () => {
      // Reload from database when avatar updated
      if (savedMemberId) {
        try {
          const data = await apiPost("get-wallet.php", { member_id: savedMemberId });
          if (data.success && data.wallet && data.wallet.member_avatar) {
            setUserAvatar(data.wallet.member_avatar);
          }
        } catch (err) {
          console.error("Header: Error reloading avatar:", err);
        }
      }
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
        {/* LEFT: Menu button */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
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

        {/* RIGHT: Member ID chip + Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
          {/* ✅ Member ID chip */}
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
          <button
            type="button"
            onClick={() => {
              setShowMenu(false);
              setShowInstallModal(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
          >
            Install App
          </button>
        </div>
      </SlideOutPanel>

      {/* Install App Modal */}
      <InstallAppModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </div>
  );
}
