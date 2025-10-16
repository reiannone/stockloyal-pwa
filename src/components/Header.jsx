// src/components/Header.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import logo from "/logos/stockloyal.png";
import SlideOutPanel from "./SlideOutPanel";
import { useBasket } from "../context/BasketContext";

// Header.jsx (top-level of component body)
console.log("HEADER LIVE:", import.meta.url, import.meta.env.MODE);

export default function Header() {
  const location = useLocation();
  const { basket } = useBasket();
  const [showMenu, setShowMenu] = useState(false);

  // Full menu matches App.jsx routing exactly (replicated from Footer.jsx)
  const allPages = [
    { to: "/admin",               label: "Merchant Admin" },
    { to: "/wallet-admin",        label: "Wallet Admin" },
    { to: "/ledger-admin",        label: "Ledger Admin" },
    { to: "/admin-faq",           label: "FAQ Admin" },
    { to: "/demo-launch",         label: "Demo Launch" },
  ];

  return (
    <>
      <header className="app-header bg-white flex items-center justify-between h-8 border-b border-gray-200 shadow-sm px-2">
        <img
          src={logo}
          alt="StockLoyal"
          className="max-h-3 max-w-[60px] object-contain"
          style={{ height: "32px", width: "auto" }}
        />

        {/* Right-side menu button (replaces gear) */}
        <button
          type="button"
          onClick={() => setShowMenu(true)}
          className="p-1 rounded-md hover:bg-gray-100 active:bg-gray-200 transition"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-gray-700" />
        </button>
      </header>

      {/* Slide-out menu (same as Footer.jsx) */}
      <SlideOutPanel
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        title="Menu"
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
                {to === "/basket" && basket.length > 0 && (
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
                    {basket.length}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </SlideOutPanel>
    </>
  );
}
