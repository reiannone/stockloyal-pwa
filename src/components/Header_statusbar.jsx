// src/components/Header.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import logo from "/logos/stockloyal.png";
import SlideOutPanel from "./SlideOutPanel";
import { useBasket } from "../context/BasketContext";

export default function Header() {
  const location = useLocation();
  const { basket } = useBasket();
  const [showMenu, setShowMenu] = useState(false);

  const allPages = [
    { to: "/promotions", label: "Promotions" },
    { to: "/login", label: "Login" },
    { to: "/terms", label: "Terms & Conditions" },
    { to: "/about", label: "About & FAQs" },
    { to: "/member-onboard", label: "Member Profile" },
    { to: "/wallet", label: "Wallet" },
    { to: "/order", label: "Pending Order" },
    { to: "/order-confirmation", label: "Order Confirmation" },
    { to: "/select-broker", label: "Select Broker" },
    { to: "/election", label: "Investment Election" },
    { to: "/stock-picker", label: "Stock Picker" },
    { to: "/basket", label: "Basket" },
    { to: "/portfolio", label: "StockLoyal Portfolio" },
    { to: "/social", label: "Community Feed" },
    { to: "/goodbye", label: "Exit App" },
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

  // Find current step index (-1 if not in progress flow)
  const currentStepIndex = progressSteps.findIndex(
    (step) => location.pathname === step.path
  );
  const isInProgressFlow = currentStepIndex !== -1;

  return (
    <div>
      <header className="app-header relative bg-white flex items-center h-12 border-b border-gray-200 shadow-sm px-3">
        {/* Logo (left) */}
        <img
          src={logo}
          alt="StockLoyal"
          className="object-contain flex-none"
          style={{ height: 32, width: "auto" }}
        />

        {/* Menu icon (right) */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setShowMenu(true)}
          className="ml-auto grid place-items-center cursor-pointer"
          style={{
            width: 40,
            height: 40,
            background: "#ffffff",
            border: 0,
            padding: 0,
            margin: 0,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#1f2937",
            outline: "none",
            boxShadow: "none",
            WebkitTapHighlightColor: "transparent",
            position: "relative",
            zIndex: 9999,
            pointerEvents: "auto",
          }}
        >
          <Menu className="block w-6 h-6 text-gray-800" strokeWidth={2} style={{ position: "relative", zIndex: 9999, color: "#1f2937" }} />
        </button>
      </header>

      {/* Progress Bar - Only show when in progress flow */}
      {isInProgressFlow && (
        <div className="progress-container" style={{
          width: "100%",
          maxWidth: "var(--app-max-width)",
          margin: "0 auto",
          padding: "8px 12px",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative"
          }}>
            {/* Background line */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: "2px",
              background: "#e5e7eb",
              transform: "translateY(-50%)",
              zIndex: 0
            }} />
            
            {/* Progress line */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: `${(currentStepIndex / (progressSteps.length - 1)) * 100}%`,
              height: "2px",
              background: "#2563eb",
              transform: "translateY(-50%)",
              zIndex: 1,
              transition: "width 0.3s ease"
            }} />

            {/* Step dots */}
            {progressSteps.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const isPending = idx > currentStepIndex;

              return (
                <div key={step.path} style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  zIndex: 2,
                  position: "relative"
                }}>
                  {/* Dot */}
                  <div style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: isCompleted || isCurrent ? "#2563eb" : "#e5e7eb",
                    border: isCurrent ? "3px solid #2563eb" : "none",
                    boxShadow: isCurrent ? "0 0 0 3px rgba(37, 99, 235, 0.1)" : "none",
                    transition: "all 0.3s ease"
                  }} />
                  
                  {/* Label */}
                  <span style={{
                    fontSize: "0.65rem",
                    marginTop: "4px",
                    color: isCompleted || isCurrent ? "#1f2937" : "#9ca3af",
                    fontWeight: isCurrent ? 600 : 400,
                    whiteSpace: "nowrap",
                    textAlign: "center"
                  }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SlideOutPanel
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        title="Menu"
        side="right"
        width={260}
        zIndex={2200}
        anchorSelector="body"
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {allPages.map(({ to, label }, idx) => (
            <li
              key={to}
              style={{ borderTop: idx === 0 ? "none" : "1px solid #e5e7eb" }}
            >
              <Link
                to={to}
                onClick={() => setShowMenu(false)}
                className={`flex items-center w-full text-gray-700 transition hover:bg-gray-100 ${
                  location.pathname === to
                    ? "bg-gray-50 font-medium text-blue-600"
                    : ""
                }`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "8px 12px",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  lineHeight: 1.25,
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
    </div>
  );
}
