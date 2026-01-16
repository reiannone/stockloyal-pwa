// src/components/Footer.jsx
import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet as WalletIcon,
  Briefcase,
  Info,
  ShoppingBasket,
  Settings,
  Share2,
} from "lucide-react";
import { useBasket } from "../context/BasketContext";
import SlideOutPanel from "./SlideOutPanel";
import OrderTicker from "./OrderTicker";

// Footer.jsx
console.log("FOOTER LIVE:", import.meta.url, import.meta.env.MODE);

export default function Footer() {
  const location = useLocation();
  const { basket } = useBasket();
  const [showMenu, setShowMenu] = useState(false);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  
  // ✅ Check if user is authenticated as admin
  const isAdminAuthenticated = useMemo(() => {
    return localStorage.getItem("adminAuthenticated") === "true";
  }, [showMenu]); // Re-check when menu opens

  // ✅ Admin password (in production, this should be handled server-side)
  const ADMIN_PASSWORD = "StockLoyal2024!";

  // ✅ Handle admin authentication
  const handleAdminAuth = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      localStorage.setItem("adminAuthenticated", "true");
      setShowAdminPrompt(false);
      setAdminPassword("");
      setAdminError("");
      setShowMenu(true);
    } else {
      setAdminError("Incorrect password. Please try again.");
      setAdminPassword("");
    }
  };

  // ✅ Handle settings button click
  const handleSettingsClick = () => {
    if (isAdminAuthenticated) {
      setShowMenu(true);
    } else {
      setShowAdminPrompt(true);
    }
  };

  // ✅ Close admin prompt
  const closeAdminPrompt = () => {
    setShowAdminPrompt(false);
    setAdminPassword("");
    setAdminError("");
  };

  // ✅ Robust basket count (handles array basket OR object basket)
  const orderCount = useMemo(() => {
    if (!basket) return 0;

    // If basket is an array (common for multiple orders)
    if (Array.isArray(basket)) return basket.length;

    // If basket is a single-order object
    // Try common shapes: basket.orders[], basket.items[], basket.symbols[]
    if (Array.isArray(basket.orders)) return basket.orders.length;
    if (Array.isArray(basket.items)) return basket.items.length;
    if (Array.isArray(basket.symbols) && basket.symbols.length > 0) return 1;

    // Fallback: if it has any meaningful keys, treat as 1
    if (typeof basket === "object" && Object.keys(basket).length > 0) return 1;

    return 0;
  }, [basket]);

  // Bottom nav (5 icons)
  const mainLinks = [
    { to: "/wallet", label: "Wallet", icon: <WalletIcon className="nav-icon" /> },
    { to: "/select-broker", label: "Select Broker", icon: <Briefcase className="nav-icon" /> },
    { to: "/about", label: "About", icon: <Info className="nav-icon" /> },
    { to: "/basket", label: "Basket", icon: <ShoppingBasket className="nav-icon" /> },
    { to: "/social", label: "Community Feed", icon: <Share2 className="nav-icon" /> },
  ];

  // Full menu matches App.jsx routing exactly (replicated from Footer.jsx)
  const allPages = [
    { to: "/payments-processing", label: "Payments Processing" },
    { to: "/csv-files", label: "CSV Files Browser" },
    { to: "/admin", label: "Merchant Admin" },
    { to: "/admin-broker", label: "Broker Admin" },
    { to: "/wallet-admin", label: "Member Wallet Admin" },
    { to: "/ledger-admin", label: "Ledger Admin" },
    { to: "/orders-admin", label: "Orders Admin" },
    { to: "/webhook-admin", label: "Webhook API Admin" },
    { to: "/merchant-notifications", label: "Merchant API Notifications" },
    { to: "/broker-notifications", label: "Broker API Notifications" },
    { to: "/admin-faq", label: "FAQ Admin" },
    { to: "/data-quality", label: "Data Quality Check" },
    { to: "/demo-launch", label: "Demo Launch" },
    { to: "/skyblue-rewards", label: "Sky Blue Airlines Miles" },
  ];

  return (
    <>
      {/* OrderTicker above the footer navigation */}
      <OrderTicker />

      {/* Bottom footer navigation bar */}
      <footer className="nav-bar">
        <div className="nav-inner">
          {mainLinks.map(({ to, icon }) => (
            <Link
              key={to}
              to={to}
              className={`nav-item ${location.pathname === to ? "nav-item-active" : ""}`}
            >
              <div className="relative">
                {icon}

                {/* ✅ Show number of orders/items next to basket icon */}
                {to === "/basket" && orderCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-blue-300 text-[10px] font-bold rounded-full px-1">
                    {orderCount}
                  </span>
                )}
              </div>
            </Link>
          ))}

          {/* Settings toggle styled like other icons */}
          <button
            type="button"
            onClick={handleSettingsClick}
            className="nav-item"
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              margin: 0,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "inherit",
            }}
          >
            <div className="relative">
              <Settings className="nav-icon" />
            </div>
          </button>
        </div>
      </footer>

      {/* ✅ Admin Password Prompt Modal */}
      {showAdminPrompt && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
          }}
          onClick={closeAdminPrompt}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>
              Admin Access Required
            </h3>
            
            <p style={{ margin: "0 0 16px 0", color: "#666", fontSize: "14px" }}>
              Enter the admin password to access the settings menu.
            </p>

            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") handleAdminAuth();
              }}
              placeholder="Admin password"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "14px",
                marginBottom: "12px",
                boxSizing: "border-box",
              }}
              autoFocus
            />

            {adminError && (
              <p style={{ color: "#ef4444", fontSize: "13px", margin: "0 0 12px 0" }}>
                {adminError}
              </p>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={closeAdminPrompt}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  backgroundColor: "white",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdminAuth}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: "#007bff",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Access Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out menu */}
      <SlideOutPanel
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        title="Admin Menu"
        side="right"
        width={260}
        zIndex={2200}
        anchorSelector=".app-container"
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {allPages.map(({ to, label }, idx) => (
            <li
              key={to}
              style={{
                borderTop: idx === 0 ? "none" : "1px solid #e5e7eb",
              }}
            >
              <Link
                to={to}
                onClick={() => setShowMenu(false)}
                className={`flex items-center w-full text-gray-700 transition hover:bg-gray-100 ${
                  location.pathname === to ? "bg-gray-50 font-medium text-blue-600" : ""
                }`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "6px 12px",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  lineHeight: 1.2,
                }}
              >
                <span>{label}</span>

                {/* ✅ Basket count in the slide-out menu */}
                {to === "/basket" && orderCount > 0 && (
                  <span
                    style={{
                      minWidth: 18,
                      height: 18,
                      fontSize: "0.7rem",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "9999px",
                      background: "#1f2937",
                      color: "#fff",
                      marginLeft: "auto",
                      padding: "0 4px",
                    }}
                  >
                    {orderCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
          
          {/* ✅ Logout Admin Button */}
          <li style={{ borderTop: "1px solid #e5e7eb", marginTop: "12px" }}>
            <button
              onClick={() => {
                localStorage.removeItem("adminAuthenticated");
                setShowMenu(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "6px 12px",
                textDecoration: "none",
                fontSize: "0.875rem",
                lineHeight: 1.2,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#ef4444",
                fontWeight: "500",
              }}
            >
              Logout Admin
            </button>
          </li>
        </ul>
      </SlideOutPanel>
    </>
  );
}
