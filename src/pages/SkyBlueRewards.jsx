import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/DefaultRewards.css";   // keep your existing styling

const ASSET = (p) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

export default function SkyBlueRewards() {
  const navigate = useNavigate();

  // 🔹 Local state for inputs
  const [memberId, setMemberId] = useState("");
  const [pointsAvailable, setPointsAvailable] = useState("");

  // 🔹 Hard-coded merchant_id
  const merchantId = "merchant001";

  const handleStartDemo = () => {
    if (!memberId.trim()) {
      alert("Please enter a Member ID");
      return;
    }
    if (!pointsAvailable.trim() || isNaN(pointsAvailable)) {
      alert("Please enter a valid Points Available number");
      return;
    }

    // Build query string for the next page
    const params = new URLSearchParams({
      merchant_id: merchantId,
      member_id: memberId.trim(),
      points: pointsAvailable.trim(),
    }).toString();

    // Navigate to your Splash/Demo Home page with params
    navigate(`/?${params}`);
  };

  return (
    <div className="rewards-page">
      <header className="rewards-header">
        <button
          type="button"
          className="back-button"
          onClick={() => window.history.back()}
        >
          ‹
        </button>
        <h1>Transfer Points</h1>
      </header>

      <main className="rewards-main">

        {/* Rewards banner */}
        <div className="rewards-image-wrapper" onClick={handleStartDemo}>
          <img
            src={ASSET("/logos/skyblue-rewards.png")}
            alt="SkyBlue Rewards"
            className="rewards-image"
          />
        </div>

        {/* 🔹 New Input Fields */}
        <div className="demo-inputs">
          <label className="demo-label">
            Member ID
            <input
              type="text"
              className="demo-input"
              placeholder="Enter member ID"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            />
          </label>

          <label className="demo-label">
            Points Available
            <input
              type="number"
              className="demo-input"
              placeholder="Enter starting points"
              value={pointsAvailable}
              onChange={(e) => setPointsAvailable(e.target.value)}
            />
          </label>
        </div>

        {/* Launch Button */}
        <button
          type="button"
          className="start-demo-button"
          onClick={handleStartDemo}
        >
          Start StockLoyal Demo
        </button>
      </main>
    </div>
  );
}
