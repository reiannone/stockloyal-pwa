// src/components/SharePointsSheet.jsx
import React from "react";
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
  // If sheet is closed, render nothing (this is safe – no hooks above this)
  if (!open) return null;

  const displayCash =
    typeof cashValue === "number"
      ? cashValue.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        })
      : "$0.00";

  const tickerText =
    primaryTicker ||
    (Array.isArray(tickers) && tickers.length > 0
      ? tickers.join(", ")
      : "my stock portfolio");

  const shareMessage = `I just converted ${pointsUsed || 0} loyalty points into ${displayCash} of stock using StockLoyal! 🚀 #StockLoyal #LoyaltyPoints #Investing`;

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
            <h3
              style={{
                margin: 0,
                fontSize: "0.98rem",
                fontWeight: 600,
              }}
            >
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
            aria-label="Close share sheet"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary blurb */}
        <p
          className="caption"
          style={{
            marginTop: 4,
            marginBottom: 10,
            fontSize: "0.8rem",
            color: "#4b5563",
          }}
        >
          You just turned{" "}
          <strong>{pointsUsed?.toLocaleString("en-US") || 0} points</strong> into{" "}
          <strong>{displayCash}</strong> of stock. Share your StockLoyal moment
          with friends!
        </p>

        {/* Message preview */}
        <div
          style={{
            fontSize: "0.8rem",
            background: "#f9fafb",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12,
            border: "1px solid #e5e7eb",
            whiteSpace: "pre-wrap",
          }}
        >
          {shareMessage}
        </div>

        {/* Share buttons (side by side, matching your Wallet layout) */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 8,
          }}
        >
          <button
  type="button"
  className="btn-primary"
  style={{ flex: 1 }}
  onClick={async () => {
    try {
      // This is the text the API wants
      const text = shareMessage;

      // TODO: use the real post/thread id once you know it.
      // For now, you can use 1 as a “global feed” post id
      const payload = {
        member_id: memberId,   // 🔴 REQUIRED
        text,                  // 🔴 REQUIRED
        // Optional extra fields (backend will likely just ignore them)
        points_used: pointsUsed || 0,
        cash_value:
          typeof cashValue === "number" ? cashValue : 0,
        primary_ticker: primaryTicker || null,
        tickers: tickers || [],
      };

      console.log("[SharePointsSheet] posting payload:", payload);

      const res = await apiPost("social_create_post.php", payload);

      if (!res || res.success === false) {
        console.error("[SharePointsSheet] share failed", res);
        alert(
          res?.error ||
            res?.message ||
            "We couldn't save your share to the StockLoyal feed."
        );
      } else {
        alert("Shared to your StockLoyal community feed! 🎉");
      }
    } catch (err) {
      console.error("[SharePointsSheet] share error", err);
      alert("Network error when posting your share. Please try again.");
    } finally {
      onClose && onClose();
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

        {/* Tiny footer note */}
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
