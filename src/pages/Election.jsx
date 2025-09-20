// src/pages/Election.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config/api";

export default function Election() {
  const [selection, setSelection] = useState("");
  const [sweepPct, setSweepPct] = useState(null); // ✅ monthly sweep %
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // ✅ Load previous election from wallet
  useEffect(() => {
    const fetchElection = async () => {
      try {
        const res = await fetch(`${API_BASE}/get-wallet.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: localStorage.getItem("memberId") }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const wallet = data.wallet;
          if (wallet.election_type) {
            setSelection(wallet.election_type);
          }
          if (wallet.sweep_percentage) {
            setSweepPct(Number(wallet.sweep_percentage)); // ✅ normalize to number
          }
        }
      } catch (err) {
        console.error("Election fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchElection();
  }, []);

  const handleSubmit = async () => {
    if (!selection) {
      setError("Please select an option.");
      return;
    }

    if (selection === "monthly" && !sweepPct) {
      setError("Please select a sweep percentage for Monthly Subscription.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/save-election.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: localStorage.getItem("memberId"),
          election: selection,
          sweep_percentage: sweepPct,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        navigate("/wallet");
      } else {
        setError(data.error || "Error saving election");
      }
    } catch {
      setError("Network error");
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <h2 className="heading">StockLoyal Elections</h2>
        <p>Loading your election settings…</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h2 className="heading">StockLoyal Elections</h2>
      <p className="body-text mb-4">
        Choose how you want to invest your loyalty points.
      </p>

      <div className="form">
        {/* One-Time */}
        <label
          className={`form-option ${selection === "one-time" ? "active" : ""}`}
        >
          <input
            type="radio"
            value="one-time"
            checked={selection === "one-time"}
            onChange={() => {
              setSelection("one-time");
              setSweepPct(null);
            }}
          />
          One-time Transaction (prepare trade orders manually)
        </label>

        {/* Monthly Sweep */}
        <label
          className={`form-option ${selection === "monthly" ? "active" : ""}`}
        >
          <input
            type="radio"
            value="monthly"
            checked={selection === "monthly"}
            onChange={() => setSelection("monthly")}
          />
          Monthly Subscription (automatic sweep of points & stock order)
        </label>
      </div>

      {selection === "monthly" && (
        <div className="mt-4">
          <p className="body-text mb-4">
            By selecting the Monthly Sweep option, you authorize{" "}
            <strong>StockLoyal</strong> to automatically convert the loyalty
            reward points you earn each month into a cash-equivalent amount,
            which will be invested in your most recent stock allocation. You may
            update your stock allocation at any time, and any changes will apply
            to the next scheduled monthly sweep. The percentage of points you
            select below will determine the portion of monthly rewards converted
            on an ongoing basis.
          </p>

          <h3 className="subheading mb-2">Choose Monthly Sweep Percentage</h3>
          <div className="points-options">
            {[100, 50, 25].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setSweepPct(pct)}
                className={`points-option-center ${
                  Number(sweepPct) === pct ? "active" : ""
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <button onClick={handleSubmit} className="btn-primary">
        Save & Continue
      </button>

      <button
        type="button"
        onClick={() => navigate("/wallet")}
        className="btn-secondary"
      >
        Cancel
      </button>
    </div>
  );
}
