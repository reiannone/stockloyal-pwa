// src/components/Layout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

export default function Layout() {
  return (
    <div className="iphone-frame relative flex flex-col h-[100dvh]">
      <Header />

      {/* 👇 scrollable main content */}
      <main className="iphone-content flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
