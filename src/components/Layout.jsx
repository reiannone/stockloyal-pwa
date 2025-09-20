// src/components/Layout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

export default function Layout() {
  return (
    <div className="iphone-frame relative">
      <Header />
      <main className="iphone-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

