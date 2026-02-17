// src/pages/Election.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function Election() {
  const [selection, setSelection] = useState("");
  const [sweepPct, setSweepPct] = useState(100); // monthly sweep %
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const memberId = localStorage.getItem("memberId");
  const memberName = localStorage.getItem("merchantName");
  const sweepDay = localStorage.getItem("sweep_day");

  // Helper: normalize sweep day values to readable text
  const formatSweepDay = (sd) => {
    if (!sd) return "";
    const s = String(sd).trim();
    if (!s) return "";

    // Handle common day codes
    const map = {
      MON: "Monday",
      TUE: "Tuesday",
      WED: "Wednesday",
      THU: "Thursday",
      FRI: "Friday",
      SAT: "Saturday",
      SUN: "Sunday",
      MONDAY: "Monday",
      TUESDAY: "Tuesday",
      WEDNESDAY: "Wednesday",
      THURSDAY: "Thursday",
      FRIDAY: "Friday",
      SATURDAY: "Saturday",
      SUNDAY: "Sunday",
    };

    const upper = s.toUpperCase();
    if (map[upper]) return map[upper];

    // If it's a numeric day-of-month like "15", render "15th"
    if (/^\d{1,2}$/.test(s)) {
      const n = Number(s);
      if (n >= 1 && n <= 31) {
        const suffix =
          n % 100 >= 11 && n % 100 <= 13
            ? "th"
            : n % 10 === 1
              ? "st"
              : n % 10 === 2
                ? "nd"
                : n % 10 === 3
                  ? "rd"
                  : "th";
        return `${n}${suffix}`;
      }
    }

    // Otherwise just return what we have
    return s;
  };

  const textSweepDay =
    sweepDay === "T+1"
      ? "next business day"
      : formatSweepDay(sweepDay);

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
        // Optional:
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

    // Normalize sweep percentage before sending to backend
    let effectiveSweep = Number(sweepPct);

    if (selection === "one-time") {
      // For one-time, always default to 100 if null/0/NaN
      if (!effectiveSweep || effectiveSweep === 0) {
        effectiveSweep = 100;
        setSweepPct(100);
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
        sweep_percentage: effectiveSweep,
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
      <p className="page-deck">Choose how you want to invest your loyalty points.</p>

      {/* Optional: show sweep schedule notice if we have it */}
      {textSweepDay && (
        <p className="page-note" style={{ marginTop: 8 }}>
          Sweep schedule: <strong>{textSweepDay}</strong>
        </p>
      )}

      <div className="form">
        {/* One-Time */}
        <label className={`form-option ${selection === "one-time" ? "active" : ""}`}>
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
        <label className={`form-option ${selection === "monthly" ? "active" : ""}`}>
          <input
            type="radio"
            value="monthly"
            checked={selection === "monthly"}
            onChange={() => setSelection("monthly")}
          />
          Monthly Subscription (automatic sweep of points &amp; stock order)
        </label>
      </div>

      {selection === "one-time" && (
        <div className="mt-4">
          <p className="form-disclosure">
            By selecting the One-Time Investment option, you authorize{" "}
            <strong>{memberName}</strong> to convert the loyalty reward points currently
            available in your account into a cash-equivalent amount on the{" "}
            <strong>{textSweepDay || "scheduled sweep day"}</strong> of this month, which
            will be invested according to your selected stock allocation in your{" "}
            <em>Basket</em>. This is a single, non-recurring election. After the order is
            submitted to your broker, your <em>Basket</em> selections will be cleared. Any
            future investments will require a new selection and authorization.
          </p>
        </div>
      )}

      {selection === "monthly" && (
        <div className="mt-4">
          <p className="form-disclosure">
            By selecting the Monthly Sweep option, you authorize{" "}
            <strong>{memberName}</strong> to automatically convert the loyalty reward
            points you earn on the{" "}
            <strong>{textSweepDay || "scheduled sweep day"}</strong> of each month into
            a cash-equivalent amount, which will be invested in your most recent stock
            allocation in your <em>Basket</em>. You may update your stock allocation at
            any time, and any changes will apply to the next scheduled monthly sweep.
            The percentage of points you select below will determine the portion of
            monthly rewards converted on an ongoing basis.
          </p>

          <h3 className="subheading mb-2">Choose Monthly Sweep Percentage</h3>
          <div className="points-options">
            {[100, 50, 25].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setSweepPct(pct)}
                className={`points-option-center ${Number(sweepPct) === pct ? "active" : ""}`}
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
