// src/components/SharePointsSheet.jsx
import React, { useState, useEffect } from "react";
import { X, Share2 } from "lucide-react";
import { apiPost } from "../api.js";

export default function SharePointsSheet({
  open,
  onClose,
  memberId,
  pointsUsed,
  cashValue,
  primaryTicker,
  tickers = [],
}) {
  if (!open) return null;

  // ----------------------------
  // 🔥 Load dynamic values from localStorage (always available globally)
  // ----------------------------
  const storedMerchant =
    localStorage.getItem("merchantName") || "my merchant";

  const storedBroker =
    localStorage.getItem("broker") || "my broker";

  // 🔥 Get last order details from localStorage
  let storedOrder = null;
  try {
    const raw = localStorage.getItem("lastOrder");
    if (raw) storedOrder = JSON.parse(raw);
  } catch {
    // ignore JSON parse errors
  }

  // 🔥 Get pointsUsed and investedAmount from localStorage (set during order flow)
  const storedPointsUsed = parseInt(localStorage.getItem("lastPointsUsed")) || pointsUsed || 0;
  const storedInvestedAmount = parseFloat(localStorage.getItem("lastInvestedAmount")) || cashValue || 0;

  console.log("[SharePointsSheet] storedPointsUsed:" + storedPointsUsed);
  console.log("[SharePointsSheet] storedInvestedAmount:" + storedInvestedAmount);

  // ----------------------------
  // 💰 Format cash
  // ----------------------------
  const displayCash =
    typeof storedInvestedAmount === "number"
      ? storedInvestedAmount.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        })
      : "$0.00";

  // ----------------------------
  // 📝 Build initial message
  // ----------------------------
  const defaultMessage = storedOrder
    ? `I just bought ${storedOrder.shares} shares of ${storedOrder.ticker} for ${displayCash} using ${storedBroker} through ${storedMerchant} on StockLoyal! 🚀 #StockLoyal #Investing`
    : `I converted ${storedPointsUsed} loyalty points from ${storedMerchant} into ${displayCash} of stock using ${storedBroker} with StockLoyal! 🚀 #StockLoyal #LoyaltyPoints`;

  // ----------------------------
  // ✏️ Editable text box
  // ----------------------------
  const [text, setText] = useState(defaultMessage);

  useEffect(() => {
    setText(defaultMessage);
  }, [open, defaultMessage]);

  return (
    <div
      className="sheet-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 40,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        className="sheet-panel"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: "16px 16px 20px",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.15)",
          marginBottom: "91px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Share2 size={18} />
            <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 600 }}>
              Share Your Investment
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              padding: 4,
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Editable text */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            minHeight: 100,
            fontSize: "0.85rem",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "10px 12px",
            resize: "vertical",
            background: "#f9fafb",
            marginBottom: 12,
          }}
        />

        {/* Share / Close buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1 }}
            onClick={async () => {
              try {
                const payload = {
                  member_id: memberId,
                  text: text.trim(),
                  points_used: storedPointsUsed,
                  cash_value: storedInvestedAmount,
                  primary_ticker: primaryTicker || null,
                  tickers: tickers || [],
                  merchant_name: storedMerchant,
                  broker_name: storedBroker,
                };

                console.log("[SharePointsSheet] posting payload:", payload);

                const res = await apiPost("social_create_post.php", payload);

                if (!res || res.success === false) {
                  alert(res?.error || "Failed to share post.");
                } else {
                  alert("Shared to your StockLoyal community feed! 🎉");
                }
              } catch {
                alert("Network error while sharing.");
              } finally {
                onClose?.();
              }
            }}
          >
            Share
          </button>

          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Footer note */}
        <p
          className="caption"
          style={{
            marginTop: 10,
            fontSize: "0.7rem",
            color: "#9ca3af",
          }}
        >
          Member ID: {memberId}
        </p>
      </div>
    </div>
  );
}
