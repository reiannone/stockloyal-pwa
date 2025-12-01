// src/components/SharePointsSheet.jsx
import React, { useMemo, useState } from "react";
import { apiPost } from "../api.js";

const STRATEGY_OPTIONS = [
  { value: "", label: "No specific strategy" },
  { value: "growth_tech", label: "Growth Tech" },
  { value: "index_core", label: "Index Core" },
  { value: "dividends", label: "Dividend Focus" },
  { value: "balanced", label: "Balanced Mix" },
  { value: "crypto_satellite", label: "Crypto Satellite" },
];

export default function SharePointsSheet({
  open,
  onClose,
  memberId,
  pointsUsed,
  cashValue,
  primaryTicker,
  tickers = [],
}) {
  const [copied, setCopied] = useState(false);
  const [shareToCommunity, setShareToCommunity] = useState(true);
  const [strategyTag, setStrategyTag] = useState("");
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  const safePoints = pointsUsed ?? 0;
  const safeCash = cashValue ?? 0;

  const shareUrl = useMemo(() => {
    const base = window.location.origin || "https://app.stockloyal.com";
    const params = new URLSearchParams();
    if (memberId) params.set("ref", memberId);
    return `${base}/#/login?${params.toString()}`;
  }, [memberId]);

  const shareText = useMemo(() => {
    const pts = safePoints.toLocaleString();
    const cash = safeCash.toFixed(2);

    const lines = [
      `I just converted ${pts} loyalty points into $${cash} of stock using StockLoyal 📈💙`,
      caption ? `"${caption}"` : null,
      "",
      `Everyday spending → real investments.`,
      `Check it out: ${shareUrl}`,
      `#StockLoyal #InvestYourPoints`,
    ].filter(Boolean);

    return lines.join("\n");
  }, [safePoints, safeCash, shareUrl, caption]);

  // CRITICAL FIX: Early return MUST come AFTER all hooks
  // This prevents the "Rendered more hooks than during the previous render" error
  if (!open) return null;

  const canNativeShare =
    typeof navigator !== "undefined" && !!navigator.share;

  const handleCopyOnly = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[SharePointsSheet] clipboard error:", err);
    }
  };

  const handleShare = async () => {
    setPosting(true);
    try {
      // 1) Optionally create on-site social post
      if (shareToCommunity && memberId) {
        await apiPost("social_create_post.php", {
          member_id: memberId,
          points_used: safePoints,
          cash_value: safeCash,
          strategy_tag: strategyTag,
          primary_ticker: primaryTicker || null,
          tickers,
          text: caption,
        });
      }

      // 2) External/native share or fallback to copy
      if (canNativeShare) {
        await navigator.share({
          title: "I'm investing my loyalty points with StockLoyal",
          text: shareText,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }

      onClose && onClose();
    } catch (err) {
      console.error("[SharePointsSheet] handleShare error:", err);
      // optional: show a toast or alert
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="share-overlay" onClick={onClose}>
      <div
        className="share-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-sheet-header">
          <div className="share-sheet-handle" />
          <div className="share-sheet-title-row">
            <h2 className="share-sheet-heading">Share your investment</h2>
            <button
              type="button"
              className="share-close-btn"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          <p className="share-subtitle">
            Let friends and the StockLoyal community know you're turning
            points into real investments.
          </p>
        </div>

        <div className="share-sheet-content">
          <div className="share-summary-card">
            <p className="share-summary-label">You just allocated</p>
            <p className="share-summary-main">
              {safePoints.toLocaleString()} pts → ${safeCash.toFixed(2)} in stock
            </p>
            <p className="share-summary-caption">
              Shared from your StockLoyal wallet
            </p>
          </div>

          {/* Share to community toggle */}
          <label className="share-preview-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={shareToCommunity}
              onChange={(e) => setShareToCommunity(e.target.checked)}
            />
            Also post to the StockLoyal community
          </label>

          {/* Strategy select */}
          {shareToCommunity && (
            <div style={{ margin: "6px 0 10px" }}>
              <label className="share-preview-label" htmlFor="strategySelect">
                Strategy / Community tag
              </label>
              <select
                id="strategySelect"
                className="member-form-input"
                value={strategyTag}
                onChange={(e) => setStrategyTag(e.target.value)}
                style={{ width: "100%", fontSize: "0.85rem" }}
              >
                {STRATEGY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Caption */}
          <div style={{ marginTop: 4 }}>
            <label className="share-preview-label" htmlFor="captionInput">
              Optional caption
            </label>
            <input
              id="captionInput"
              className="member-form-input"
              placeholder="e.g., Moving my airline points into tech instead ✈️➡️📈"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
          </div>

          <label className="share-preview-label">Post preview</label>
          <textarea
            readOnly
            className="share-preview-textarea"
            value={shareText}
          />
        </div>

        <div className="share-sheet-footer">
          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", marginBottom: 8 }}
            onClick={handleShare}
            disabled={posting}
          >
            {posting ? "Sharing…" : "Share now"}
          </button>

          {!canNativeShare && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "100%" }}
              onClick={handleCopyOnly}
            >
              {copied ? "Copied!" : "Copy text to share"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
