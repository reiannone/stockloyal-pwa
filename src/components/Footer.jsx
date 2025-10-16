// src/components/Footer.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet as WalletIcon,
  Briefcase,
  Info,
  ShoppingBasket,
  User,
  Settings,
} from "lucide-react";
import { X } from "lucide-react";
import { useBasket } from "../context/BasketContext";
import SlideOutPanel from "./SlideOutPanel";

// Footer.jsx
console.log("FOOTER LIVE:", import.meta.url, import.meta.env.MODE);

export default function Footer() {
  const location = useLocation();
  const { basket } = useBasket();
  const [showMenu, setShowMenu] = useState(false);

  // Bottom nav (5 icons)
  const mainLinks = [
    { to: "/wallet",         label: "Wallet",         icon: <WalletIcon className="nav-icon" /> },
    { to: "/select-broker",  label: "Select Broker",  icon: <Briefcase className="nav-icon" /> },
    { to: "/about",          label: "About",          icon: <Info className="nav-icon" /> },
    { to: "/basket",         label: "Basket",         icon: <ShoppingBasket className="nav-icon" /> },
    { to: "/member-onboard", label: "Member Onboard", icon: <User className="nav-icon" /> },
  ];

  // Full menu matches App.jsx routing exactly
  const allPages = [
    { to: "/promotions",          label: "Promotions" },
    { to: "/login",               label: "Login" },
    { to: "/terms",               label: "Terms & Conditions" },
    { to: "/about",               label: "About" },
    { to: "/member-onboard",      label: "Member Profile" },
    { to: "/wallet",              label: "Wallet" },
    { to: "/order",               label: "Pending Order" },
    { to: "/order-confirmation",  label: "Order Confirmation" },
    { to: "/select-broker",       label: "Select Broker" },
    { to: "/election",            label: "Investment Election" },
    { to: "/stock-picker",        label: "Stock Picker" },
    { to: "/basket",              label: "Basket" },
    { to: "/portfolio",           label: "StockLoyal Portfolio" },
    { to: "/goodbye",             label: "Exit App" },
  ];

  return (
    <>
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
                {to === "/basket" && basket.length > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                    {basket.length}
                  </span>
                )}
              </div>
            </Link>
          ))}

          {/* Settings toggle styled like other icons */}
          <button
            type="button"
            onClick={() => setShowMenu(true)}
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

      {/* Slide-out menu */}
      <SlideOutPanel
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        title="Menu"
        side="right"
        width={260}  // slightly narrower
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
                  padding: "6px 12px",   // tighter vertical spacing
                  textDecoration: "none",
                  fontSize: "0.875rem", // smaller font (14px)
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
                      background: "#1f2937", // gray-800
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
