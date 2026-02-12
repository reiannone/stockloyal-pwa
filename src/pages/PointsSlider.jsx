// src/pages/PointsSlider.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { Wallet as WalletIcon, ArrowRight } from "lucide-react";
import "../styles/StockPicker.css";

export default function PointsSlider() {
  const navigate = useNavigate();
  const location = useLocation();

  const memberId = localStorage.getItem("memberId");
  const { amount: initialAmount = 0, pointsUsed: initialPoints = 0 } =
    location.state || {};

  // ✅ Get merchant name from localStorage
  const merchantName = localStorage.getItem("merchantName") || "Merchant";

  // ✅ Get sweep day from localStorage (merchant data)
  const sweepDay = localStorage.getItem("sweep_day");

  // ✅ Format sweep day for display (handles VARCHAR values)
  const formatSweepDay = (day) => {
    if (!day || day === "null") return null;
    if (day === "T+1") return null;
    const numDay = parseInt(day, 10);
    if (isNaN(numDay)) return null;
    if (numDay === -1) return "the last business day";
    if (numDay === 1) return "the 1st";
    if (numDay === 2) return "the 2nd";
    if (numDay === 3) return "the 3rd";
    if (numDay === 21) return "the 21st";
    if (numDay === 22) return "the 22nd";
    if (numDay === 23) return "the 23rd";
    if (numDay === 31) return "the 31st";
    return `the ${numDay}th`;
  };

  // ✅ Get broker name from localStorage
  const brokerName =
    localStorage.getItem("broker") ||
    localStorage.getItem("selectedBroker") ||
    localStorage.getItem("brokerName") ||
    "Broker";

  // --- Wallet / points state ---
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [conversionRate, setConversionRate] = useState(0.01);
  const [selectedPoints, setSelectedPoints] = useState(initialPoints);
  const [cashValue, setCashValue] = useState(initialAmount);
  const [cashInput, setCashInput] = useState(String(Math.floor(initialAmount)));
  const [isEditingCash, setIsEditingCash] = useState(false);

  // --- Broker limits ---
  const [minOrderAmount, setMinOrderAmount] = useState(null);
  const [maxOrderAmount, setMaxOrderAmount] = useState(null);

  // 🎡 Audio + haptic feedback for wheel ticks
  const audioCtxRef = useRef(null);
  const lastTickTimeRef = useRef(0);

  const triggerWheelFeedback = () => {
    if (typeof window === "undefined") return;
    try {
      if ("vibrate" in navigator) navigator.vibrate(8);
    } catch { /* ignore */ }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 1400;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch { /* ignore audio errors */ }
  };

  const maybeTick = () => {
    const now = typeof performance !== "undefined" && performance.now() ? performance.now() : Date.now();
    if (now - lastTickTimeRef.current > 80) {
      lastTickTimeRef.current = now;
      triggerWheelFeedback();
    }
  };

  // --- Load wallet (and broker limits) ---
  useEffect(() => {
    (async () => {
      try {
        if (!memberId) {
          setError("Please log in again.");
          return;
        }
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (!data.success) {
          setError(data.error || "Failed to load wallet.");
          return;
        }
        setWallet(data.wallet);

        if (data.wallet?.min_order_amount != null) setMinOrderAmount(Number(data.wallet.min_order_amount));
        if (data.wallet?.max_order_amount != null) setMaxOrderAmount(Number(data.wallet.max_order_amount));

        // ✅ Only apply sweep default if user didn't pass explicit values via location.state
        if (initialPoints === 0 && data.wallet?.sweep_percentage && data.wallet?.points) {
          const sweepVal = Math.round(
            (parseInt(data.wallet.points, 10) || 0) *
              (parseFloat(data.wallet.sweep_percentage) / 100)
          );
          setSelectedPoints(sweepVal);
        }
      } catch (e) {
        console.error("[PointsSlider] fetch wallet error:", e);
        setError("Network error while fetching wallet.");
      }
    })();
  }, [memberId, initialPoints]);

  // ✅ Use member's tier-specific conversion rate from wallet
  useEffect(() => {
    if (wallet?.conversion_rate) {
      let r = Number(wallet.conversion_rate);
      if (r >= 1) r = r / 100;
      if (r > 0) {
        setConversionRate(r);
        return;
      }
    }
    let r = parseFloat(localStorage.getItem("conversion_rate") || "0");
    if (r >= 1) r = r / 100;
    setConversionRate(r > 0 ? r : 0.01);
  }, [wallet]);

  // --- Sync cash value to points ---
  useEffect(() => {
    if (!isEditingCash) {
      const cents = Math.round(selectedPoints * conversionRate * 100);
      const val = Math.floor(cents / 100);
      setCashValue(val);
      setCashInput(val.toLocaleString());
    }
  }, [selectedPoints, conversionRate, isEditingCash]);

  // ✅ Sync slider values to localStorage
  useEffect(() => {
    if (selectedPoints > 0 && cashValue > 0) {
      localStorage.setItem("basket_amount", cashValue.toFixed(2));
      localStorage.setItem("basket_pointsUsed", String(selectedPoints));
    }
  }, [selectedPoints, cashValue]);

  // --- Points handler ---
  const handlePointsChange = (val) => {
    let v = parseInt(val ?? "0", 10);
    if (Number.isNaN(v)) v = 0;
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    v = Math.max(0, Math.min(v, max));
    setSelectedPoints(v);
  };

  // --- Derived broker-range check ---
  const hasLimits = minOrderAmount != null && maxOrderAmount != null && maxOrderAmount > 0;
  const isCashOutsideLimits = hasLimits && (cashValue < minOrderAmount || cashValue > maxOrderAmount);
  const cashLimitError =
    hasLimits && isCashOutsideLimits
      ? `Cash-Value for this order must be between $${minOrderAmount.toFixed(2)} and $${maxOrderAmount.toFixed(2)} for your broker.`
      : "";

  // --- Cash input handlers ---
  const handleCashInputChange = (e) => {
    const raw = e.target.value;
    setCashInput(raw);
    const val = parseFloat(raw);
    if (Number.isNaN(val) || val < 0) return;
    const points = Math.round(val / conversionRate);
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    const clampedPoints = Math.min(points, max);
    setSelectedPoints(clampedPoints);
    const cents = Math.round(clampedPoints * conversionRate * 100);
    setCashValue(Math.floor(cents / 100));
  };

  const handleCashInputFocus = () => setIsEditingCash(true);

  const handleCashInputBlur = () => {
    setIsEditingCash(false);
    let val = parseFloat(cashInput);
    if (Number.isNaN(val) || val < 0) val = 0;
    const points = Math.round(val / conversionRate);
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    const clampedPoints = Math.min(points, max);
    setSelectedPoints(clampedPoints);
    const cents = Math.round(clampedPoints * conversionRate * 100);
    const finalCash = Math.floor(cents / 100);
    setCashValue(finalCash);
    setCashInput(finalCash.toLocaleString());
  };

  // --- Derived values ---
  const maxPoints = parseInt(wallet?.points ?? "0", 10) || 0;

  // --- Continue to stock picker ---
  const handleContinue = () => {
    navigate("/fill-basket", {
      state: {
        amount: cashValue,
        pointsUsed: selectedPoints,
      },
    });
  };

  if (error) {
    return (
      <div className="page-container">
        <p className="form-error">{error}</p>
        <button className="btn-secondary" onClick={() => navigate("/wallet")}>
          Back to Wallet
        </button>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="page-container">
        <p>Loading wallet...</p>
      </div>
    );
  }

  return (
    <div className="wallet-container" style={{ paddingBottom: "100px" }}>
      <h1 className="page-title">Set Investment Amount</h1>

      {/* Points / Cash display */}
      <div
        className="card card--accent"
        style={{
          background: "#f9fafb",
          borderRadius: "12px",
          padding: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          {/* Points side */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.25rem" }}>
              Points Used
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#2563eb" }}>
              {selectedPoints.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              out of {maxPoints.toLocaleString()} available
            </div>
          </div>

          {/* Arrow */}
          <div style={{ fontSize: "1.5rem", color: "#9ca3af" }}>→</div>

          {/* Cash side */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.25rem" }}>
              Cash Value
            </div>
            <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
              <span
                style={{
                  position: "absolute",
                  left: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "1.5rem",
                  fontWeight: "700",
                  color: "#22c55e",
                }}
              >
                $
              </span>
              <input
                type="text"
                value={cashInput}
                onChange={handleCashInputChange}
                onFocus={handleCashInputFocus}
                onBlur={handleCashInputBlur}
                className="form-input"
                style={{
                  width: "100%",
                  fontSize: "1.5rem",
                  fontWeight: "700",
                  textAlign: "center",
                  padding: "0.5rem",
                  paddingLeft: "1.5rem",
                  height: "auto",
                  color: "#22c55e",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                textAlign: "center",
                marginTop: "0.25rem",
              }}
            >
              @ {conversionRate}/pt conversion rate
              {wallet?.member_tier ? ` (${wallet.member_tier})` : ""}
            </div>
          </div>
        </div>

        {/* Slider */}
        <div style={{ marginTop: "1rem" }}>
          <input
            type="range"
            min={0}
            max={maxPoints}
            value={selectedPoints}
            onChange={(e) => handlePointsChange(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        {cashLimitError && (
          <p className="form-error" style={{ marginTop: "0.5rem", textAlign: "center" }}>
            {cashLimitError}
          </p>
        )}
      </div>

      {/* Sweep Schedule Notice */}
      {(sweepDay === "T+1" || formatSweepDay(sweepDay)) && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            textAlign: "center",
            fontSize: "0.875rem",
            color: "#92400e",
          }}
        >
          {sweepDay === "T+1" ? (
            <>
              <strong>{merchantName}</strong> processes points conversion and trade orders same
              day with settlement next business day through your broker,{" "}
              <strong>{brokerName}</strong>.
            </>
          ) : (
            <>
              <strong>{merchantName}</strong> processes points conversion and trade orders on{" "}
              <strong>{formatSweepDay(sweepDay)}</strong> of each month through your broker,{" "}
              <strong>{brokerName}</strong>.
            </>
          )}
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="stockpicker-bottom-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleContinue}
          disabled={isCashOutsideLimits || cashValue <= 0}
          style={{
            opacity: isCashOutsideLimits || cashValue <= 0 ? 0.5 : 1,
            cursor: isCashOutsideLimits || cashValue <= 0 ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          Continue to Stock Picker
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate("/wallet")}
        >
          <WalletIcon size={16} style={{ verticalAlign: "middle", marginRight: 4 }} /> Go
          back to Wallet
        </button>
      </div>
    </div>
  );
}
