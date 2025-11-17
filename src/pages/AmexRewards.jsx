import React from "react";
import { useNavigate } from "react-router-dom";
import "/src/styles/DefaultRewards.css";

const ASSET = (p) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

export default function DefaultRewards() {
  const navigate = useNavigate();

  const handleStartDemo = () => {
    // 👇 Change this path if your SplashScreen route is different
    navigate("/");
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
            src={ASSET("/logos/amex-rewards.png")}
            alt="Membership Rewards transfer partners"
            className="rewards-image"
          />
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
