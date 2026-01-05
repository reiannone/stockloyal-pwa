// src/pages/SymbolChart.jsx
import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function SymbolChart() {
  const { symbol } = useParams();
  const navigate = useNavigate();

  const safeSymbol = (symbol || "").toUpperCase();
  
  console.log('[SymbolChart] TradingView chart lookup symbol ', safeSymbol);
  console.log('[SymbolChart] useParams:', { symbol });

  // If no symbol, show error
  if (!safeSymbol) {
    return (
      <div className="portfolio-container">
        <h2 className="page-title" style={{ textAlign: "center" }}>
          No Symbol Provided
        </h2>
        <p style={{ textAlign: "center", marginTop: "12px" }}>
          Please select a stock symbol to view its chart.
        </p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: "12px" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate(-1)}
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  // Load TradingView widget script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (window.TradingView) {
        new window.TradingView.widget({
          container_id: "tradingview_chart",
          autosize: true,
          symbol: `NASDAQ:${safeSymbol}`, // Can also try NYSE:${safeSymbol} if needed
          interval: "D",
          timezone: "America/New_York",
          theme: "light",
          style: "1",
          locale: "en",
          toolbar_bg: "#f1f3f6",
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          save_image: false,
          studies: ["Volume@tv-basicstudies"],
          show_popup_button: true,
          popup_width: "1000",
          popup_height: "650"
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup script on unmount
      const existingScript = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [safeSymbol]);

  return (
    <div className="portfolio-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        {safeSymbol} Chart
      </h2>

      <p
        style={{
          textAlign: "center",
          marginTop: "-6px",
          marginBottom: "12px",
          fontSize: "0.9rem",
          color: "#6b7280",
        }}
      >
        Interactive chart powered by TradingView
      </p>

      {/* Back button */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "12px",
        }}
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(-1)}
        >
          ← Back to previous page
        </button>
      </div>

      {/* TradingView Chart Container */}
      <div
        id="tradingview_chart"
        style={{
          width: "100%",
          height: "500px",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          marginBottom: "20px"
        }}
      />

      <p
        style={{
          textAlign: "center",
          fontSize: "0.75rem",
          color: "#9ca3af",
        }}
      >
        Chart data provided by{" "}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          TradingView
        </a>
      </p>
    </div>
  );
}
