// src/components/Footer.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet as WalletIcon,
  Briefcase,
  Info,
  ShoppingBasket,
  User, // ✅ added for customer info
} from "lucide-react";
import { useBasket } from "../context/BasketContext";

export default function Footer() {
  const location = useLocation();
  const { basket } = useBasket();

  const links = [
    { to: "/wallet",        icon: <WalletIcon className="nav-icon" /> },
    { to: "/select-broker", icon: <Briefcase className="nav-icon" /> },
    { to: "/about",         icon: <Info className="nav-icon" /> },
    { to: "/basket",        icon: <ShoppingBasket className="nav-icon" /> },
    { to: "/member-onboard", icon: <User className="nav-icon" /> }, // ✅ Customer Info
  ];

  return (
    <footer className="nav-bar">
      {links.map(({ to, icon }) => (
        <Link
          key={to}
          to={to}
          className={`nav-item ${location.pathname === to ? "nav-item-active" : ""}`}
        >
          <div className="relative">
            {icon}
            {/* ✅ Basket badge only */}
            {to === "/basket" && basket.length > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full px-1">
                {basket.length}
              </span>
            )}
          </div>
        </Link>
      ))}
    </footer>
  );
}
