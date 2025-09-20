// src/pages/PointsSelect.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";

export default function PointsSelect() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [conversionRate, setConversionRate] = useState(0.01);
  const [selectedPoints, setSelectedPoints] = useState(0);
  const [cashValue, setCashValue] = useState(0);

  // load conversion rate
  useEffect(() => {
    let r = parseFloat(localStorage.getItem("conversion_rate") || "0");
    if (r >= 1) r = r / 100; // normalize if merchant stored “5” instead of “0.05”
    setConversionRate(r > 0 ? r : 0.01);
  }, []);

  // fetch wallet
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
        if (data.wallet?.points != null) {
          localStorage.setItem("points", String(parseInt(data.wallet.points, 10) || 0));
        }
        if (data.wallet?.cash_balance != null) {
          localStorage.setItem("cashBalance", Number(data.wallet.cash_balance).toFixed(2));
        }
      } catch (e) {
        console.error("[PointsSelect] fetch error:", e);
        setError("Network error while fetching wallet.");
      }
    })();
  }, [memberId]);

  // recompute cash value
  useEffect(() => {
    const cents = Math.round(selectedPoints * conversionRate * 100);
    setCashValue(cents / 100);
  }, [selectedPoints, conversionRate]);

  const handlePointsChange = (val) => {
    let v = parseInt(val ?? "0", 10);
    if (Number.isNaN(v)) v = 0;
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    if (v < 0) v = 0;
    if (v > max) v = max;
    setSelectedPoints(v);
  };

  const useMax = () => handlePointsChange(wallet?.points || 0);

  const proceed = () => {
    if (selectedPoints <= 0) {
      alert("Select some points to convert.");
      return;
    }
    localStorage.setItem("pendingPointsUsed", String(selectedPoints));
    localStorage.setItem("pendingCashAmount", cashValue.toFixed(2));

    // 🔄 Navigate to StockCategories instead of Basket
    navigate("/stock-picker", {
      state: { pointsUsed: selectedPoints, amount: cashValue },
    });
  };

  if (error) {
    return (
      <div className="page-container">
        <h2 className="heading">Convert Points</h2>
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="page-container">
        <h2 className="heading">Convert Points</h2>
        <p>Loading…</p>
      </div>
    );
  }

  const availablePoints = parseInt(wallet.points, 10) || 0;
  const availableCash = Number(wallet.cash_balance) || 0;

  return (
    <div className="page-container" style={{ lineHeight: 1.6 }}>
      <h2 className="heading" style={{ marginBottom: "1rem" }}>
        Convert Points
      </h2>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <p><strong>Available Points:</strong> {availablePoints.toLocaleString()}</p>
        <p><strong>Available Cash Balance:</strong> ${availableCash.toFixed(2)}</p>
        <p><strong>Conversion Rate:</strong> {conversionRate} per point</p>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <label
          htmlFor="pointsToConvert"
          className="member-form-label"
          style={{ marginBottom: "0.5rem", display: "block" }}
        >
          Points to Convert
        </label>
        <input
          id="pointsToConvert"
          type="number"
          min="0"
          max={availablePoints}
          step="1"
          className="member-form-input"
          value={selectedPoints}
          onChange={(e) => handlePointsChange(e.target.value)}
          style={{ marginBottom: "0.75rem" }}
        />
        <input
          type="range"
          min="0"
          max={availablePoints}
          step="1"
          value={selectedPoints}
          onChange={(e) => handlePointsChange(e.target.value)}
          style={{ width: "100%", marginBottom: "0.75rem" }}
        />
        <div className="wallet-actions" style={{ gap: 12, marginTop: 12 }}>
          <button type="button" className="btn-secondary" onClick={() => handlePointsChange(0)}>
            Clear
          </button>
          <button type="button" className="btn-secondary" onClick={useMax}>
            Use Max
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <p className="wallet-intro" style={{ marginBottom: "0.5rem" }}>Cash-Value</p>
        <p className="wallet-cash" style={{ fontSize: "1.25rem" }}>
          ${cashValue.toFixed(2)}
        </p>
      </div>

      <div className="wallet-actions" style={{ gap: 12, marginTop: 12 }}>
        <button type="button" className="btn-primary" onClick={proceed}>
          Continue
        </button>
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    </div>
  );
}
