// src/pages/SkyBlueRewards.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/DefaultRewards.css";

const ASSET = (p) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

export default function SkyBlueRewards() {
  const navigate = useNavigate();

  const [memberEmail, setMemberEmail] = useState("");
  const [pointsAvailable, setPointsAvailable] = useState("");
  const merchantId = "merchant001";

  const handleStartDemo = () => {
    if (!memberEmail.trim()) {
      alert("Please enter an email");
      return;
    }
    if (!pointsAvailable.trim() || isNaN(pointsAvailable)) {
      alert("Please enter a valid points amount");
      return;
    }

    const params = new URLSearchParams({
      merchant_id: merchantId,
      member_email: memberEmail.trim(),
      points: pointsAvailable.trim(),
    }).toString();

    // 👇 If your Splash route is different, adjust "/splash"
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
        <div className="rewards-image-wrapper" onClick={handleStartDemo}>
          <img
            src={ASSET("/logos/skyblue-rewards.png")}
            alt="SkyBlue Rewards"
            className="rewards-image"
          />
        </div>

        <div className="demo-inputs">
          <label className="demo-label">
            Member Email
            <input
              type="email"
              className="demo-input"
              placeholder="you@example.com"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
            />
          </label>

          <label className="demo-label">
            Points Available
            <input
              type="number"
              className="demo-input"
              placeholder="e.g. 500"
              value={pointsAvailable}
              onChange={(e) => setPointsAvailable(e.target.value)}
            />
          </label>
        </div>

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
