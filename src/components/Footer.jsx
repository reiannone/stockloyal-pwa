// src/components/Footer.jsx
import React, { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Wallet as WalletIcon,
  Briefcase,
  CircleHelp,
  ShoppingBasket,
  Settings,
  Share2,
} from "lucide-react";
import { useBasket } from "../context/BasketContext";
import OrderTicker from "./OrderTicker";

export default function Footer() {
  const location = useLocation();
  const navigate = useNavigate();
  const { basket } = useBasket();

  const isAdminAuthenticated = localStorage.getItem("adminAuthenticated") === "true";

  const handleSettingsClick = () => {
    navigate("/admin-home");
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
    { to: "/about", label: "About", icon: <CircleHelp className="nav-icon" /> },
    { to: "/stock-picker", label: "Basket", icon: <ShoppingBasket className="nav-icon" /> },
    { to: "/social", label: "Community Feed", icon: <Share2 className="nav-icon" /> },
  ];

  return (
    <>
      {/* OrderTicker above the footer navigation */}
      <OrderTicker />

      {/* Bottom footer navigation bar */}
      <footer className="nav-bar" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
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
                {to === "/stock-picker" && orderCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-blue-300 text-[10px] font-bold rounded-full px-1">
                    {orderCount}
                  </span>
                )}
              </div>
            </Link>
          ))}

          {/* Settings - only visible when admin is authenticated */}
          {isAdminAuthenticated && (
            <button
              type="button"
              onClick={handleSettingsClick}
              className={`nav-item ${location.pathname === "/admin-home" ? "nav-item-active" : ""}`}
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
          )}
        </div>

        {/* Powered by StockLoyal */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            paddingBottom: "8px",
            paddingTop: "4px",
          }}
        >
          <span
            style={{
              fontSize: "9px",
              letterSpacing: "0.06em",
              opacity: 0.4,
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            Powered by
          </span>
          <img
            src="/logos/stockloyal.png"
            alt="StockLoyal"
            style={{
              height: "16px",
              width: "auto",
              opacity: 0.5,
              objectFit: "contain",
            }}
          />
        </div>
      </footer>

    </>
  );
}
