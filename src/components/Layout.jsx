// src/components/Layout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

export default function Layout() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--app-bg, #fff)",
      }}
    >
      <Header />

      {/* scrollable main content */}
      <main style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
