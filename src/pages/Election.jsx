// src/pages/Election.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import { CreditCard, BarChart2, RefreshCw } from "lucide-react";

export default function Election() {
  const [selection, setSelection] = useState("");
  const [sweepPct, setSweepPct] = useState(100); // monthly sweep %
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const memberId = localStorage.getItem("memberId");

  // Load previous election from wallet
  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await apiPost("get-wallet.php", { member_id: memberId });

        if (data?.success && data.wallet) {
          const wallet = data.wallet;
          if (wallet.election_type) {
            setSelection(wallet.election_type);
          }
          setSweepPct(
            wallet.sweep_percentage == null || Number(wallet.sweep_percentage) === 0
            ? 100
            : Number(wallet.sweep_percentage)
          );
        }
      } catch (err) {
        console.error("Election fetch error:", err);
        // you can surface this if you want:
        // setError("Failed to load election settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  const handleSubmit = async () => {
    setError("");

    if (!selection) {
      setError("Please select an option.");
      return;
    }

    // 🔢 Normalize sweep percentage before sending to backend
    let effectiveSweep = Number(sweepPct);

    if (selection === "one-time") {
      // For one-time, always default to 100 if null/0/NaN
      if (!effectiveSweep || effectiveSweep === 0) {
        effectiveSweep = 100;
        setSweepPct(100); // keep UI state in sync
      }
    } else if (selection === "monthly") {
      // For monthly, force user to choose a % (25/50/100)
      if (!effectiveSweep || effectiveSweep <= 0) {
        setError("Please select a sweep percentage for Monthly Subscription.");
        return;
      }
    }

    try {
      const data = await apiPost("save-election.php", {
        member_id: memberId,
        election: selection,
        sweep_percentage: effectiveSweep,  // ✅ always populated, even for one-time
      });

      if (data?.success) {
        navigate("/wallet");
      } else {
        setError(data?.error || "Error saving election");
      }
    } catch (e) {
      console.error("Election save error:", e);
      setError("Network error");
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <h2 className="page-title">StockLoyal Elections</h2>
        <p className="page-deck">Loading your election settings…</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h2 className="page-title">StockLoyal Elections</h2>
      <p className="page-deck">
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
              setSweepPct(100);
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
          Monthly Subscription (automatic sweep of points &amp; stock order)
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
        Save &amp; Continue
      </button>

      <button
        type="button"
        onClick={() => navigate("/wallet")}
        className="btn-secondary"
        style={{ marginTop: 8 }}
      >
        Cancel
      </button>
    </div>
  );
}
