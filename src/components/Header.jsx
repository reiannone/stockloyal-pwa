// src/components/Header.jsx
import React from "react";
import logo from "/logos/stockloyal.png";

export default function Header() {
  return (
    <header className="app-header bg-white flex items-center justify-right h-8 border-b border-gray-200 shadow-sm">
      <img
        src={logo}
        alt="StockLoyal"
        className="max-h-3 max-w-[60px] object-contain"
        style={{ height: "32px", width: "auto" }} // enforce small logo
      />
    </header>
  );
}
