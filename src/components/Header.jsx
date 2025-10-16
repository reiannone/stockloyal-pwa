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
    { to: "/about", label: "About" },
    { to: "/member-onboard", label: "Member Profile" },
    { to: "/wallet", label: "Wallet" },
    { to: "/order", label: "Pending Order" },
    { to: "/order-confirmation", label: "Order Confirmation" },
    { to: "/select-broker", label: "Select Broker" },
    { to: "/election", label: "Investment Election" },
    { to: "/stock-picker", label: "Stock Picker" },
    { to: "/basket", label: "Basket" },
    { to: "/portfolio", label: "StockLoyal Portfolio" },
    { to: "/goodbye", label: "Exit App" },
  ];

  return (
    <>
      <header className="app-header relative z-20 bg-white flex items-center h-12 border-b border-gray-200 shadow-sm px-3 pr-12">
        {/* Logo (left) */}
        <img
          src={logo}
          alt="StockLoyal"
          className="object-contain flex-none z-0"
          style={{ height: 32, width: "auto" }}
        />

        {/* Absolutely positioned menu icon (right) */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setShowMenu(true)}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center cursor-pointer z-30"
        >
          <Menu className="block w-6 h-6 text-gray-800" strokeWidth={2} />
        </button>
      </header>

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
                  location.pathname === to ? "bg-gray-50 font-medium text-blue-600" : ""
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
    </>
  );
}
