// src/pages/Login.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function Login() {
  const navigate = useNavigate();

  // "checking" while we detect if this is a new vs existing member
  const [mode, setMode] = useState("checking"); // "checking" | "login" | "create"

  const [memberId, setMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const [merchantId, setMerchantId] = useState("");
  const [points, setPoints] = useState(0);
  const [conversionRate, setConversionRate] = useState(0.01);

  // ✅ Hydrate from localStorage and determine mode (new vs existing by member_email on wallet)
  useEffect(() => {
    const lsMode = localStorage.getItem("mode"); // legacy / fallback
    const lsMemberId = localStorage.getItem("memberId");
    const lsEmail = localStorage.getItem("memberEmail");
    const lsMerchantId = localStorage.getItem("merchantId");
    const lsPoints = parseInt(localStorage.getItem("points") || "0", 10);
    const lsConversionRate = parseFloat(
      localStorage.getItem("conversion_rate") || "0"
    );

    // 🔹 For this flow, member_email is the primary identity
    const initialEmail = lsEmail || "";
    const initialId = lsMemberId || initialEmail;

    setEmail(initialEmail);
    setMemberId(initialId);
    if (lsMerchantId) setMerchantId(lsMerchantId);
    if (lsPoints > 0) setPoints(lsPoints);
    setConversionRate(lsConversionRate > 0 ? lsConversionRate : 0.01);

    // If we *don't* have merchantId or member_email, just fall back to manual mode toggle
    if (!lsMerchantId || !initialEmail) {
      setMode(lsMode === "create" ? "create" : "login");
      return;
    }

    // Otherwise, auto-detect if this is a new vs existing member based on wallet.member_email
    (async () => {
      try {
        const data = await apiPost("check_wallet_member.php", {
          merchant_id: lsMerchantId,
          member_email: initialEmail, // 👈 key check: wallet.member_email
        });

        console.log("[Login] check_wallet_member response:", data);

        if (data && data.success) {
          if (data.exists) {
            // wallet row found for this email → existing member → login mode
            setMode("login");
            localStorage.setItem("mode", "login");
          } else {
            // NO wallet row for this email → first-time member → create mode
            setMode("create");
            localStorage.setItem("mode", "create");
          }
        } else {
          // If API fails, default to previous or login
          setMode(lsMode === "create" ? "create" : "login");
        }
      } catch (err) {
        console.error("[Login] check_wallet_member error:", err);
        setMode(lsMode === "create" ? "create" : "login");
      }
    })();
  }, []);

  // ✅ Helper to apply points AFTER authentication
  const applyPointsIfAny = async (memberIdToUse) => {
    if (!points || points <= 0) return;

    const conv = conversionRate > 0 ? conversionRate : 0.01;
    const cashBalance = Number((points * conv).toFixed(2));

    console.log("[Login] Applying points via update_points.php", {
      member_id: memberIdToUse,
      points,
      cash_balance: cashBalance,
    });

    try {
      await apiPost("update_points.php", {
        member_id: memberIdToUse,
        points,
        cash_balance: cashBalance,
      });
    } catch (err) {
      console.error("[Login] update_points.php error:", err);
      // Do not block login on wallet update errors
    }
  };

  // ✅ Handle form submit (login or create)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const effectiveMemberId = memberId || email;

    if (!effectiveMemberId || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (mode === "create" && !email) {
      setError("Please provide an email address to create your account.");
      return;
    }

    // ✅ Password confirmation validation for create
    if (mode === "create" && password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    if (mode === "create") {
      // 🔹 CREATE ACCOUNT FLOW
      try {
        const data = await apiPost("create_member.php", {
          merchant_id: merchantId || null,
          member_id: effectiveMemberId,
          member_email: email || effectiveMemberId,
          password, // backend hashes it
        });

        console.log("[Login] create_member.php response:", data);

        if (data && data.success) {
          // Persist identity
          localStorage.setItem("memberId", effectiveMemberId);
          localStorage.setItem("memberEmail", email || effectiveMemberId);
          if (merchantId) localStorage.setItem("merchantId", merchantId);

          // After successful account creation, treat as "logged in" and apply points
          await applyPointsIfAny(effectiveMemberId);

          // Continue to onboarding
          navigate("/member-onboard", {
            state: {
              memberId: effectiveMemberId,
              memberEmail: email || effectiveMemberId,
            },
          });
        } else {
          setError(data?.error || data?.message || "Account creation failed.");
        }
      } catch (err) {
        console.error("Create member error:", err);
        setError("Network error. Please try again.");
      }
    } else {
      // 🔹 LOGIN FLOW
      try {
        const data = await apiPost("login.php", {
          merchant_id: merchantId || null,
          member_id: effectiveMemberId,
          password,
        });

        console.log("[Login] login.php response:", data);

        if (data && data.success) {
          localStorage.setItem("memberId", effectiveMemberId);
          localStorage.setItem(
            "memberEmail",
            data.member_email || email || effectiveMemberId
          );
          if (merchantId) localStorage.setItem("merchantId", merchantId);

          // Only after successful login do we apply inbound points
          await applyPointsIfAny(effectiveMemberId);

          navigate("/wallet");
        } else {
          setError(
            data?.message || "Login failed. Please check your credentials."
          );
        }
      } catch (err) {
        console.error("Login error:", err);

        if (err.status === 404) {
          setError(
            "No account found for this Member ID / Email. Please create an account."
          );
        } else if (err.status === 401) {
          setError("Invalid password.");
        } else {
          setError("Server error. Please try again later.");
        }
      }
    }
  };

  const handleToggleMode = () => {
    if (mode === "checking") return;
    const next = mode === "login" ? "create" : "login";
    setMode(next);
    localStorage.setItem("mode", next);
    setError("");
  };

  const isChecking = mode === "checking";

  return (
    <div className="page-container">
      <h2 className="page-title">
        {isChecking
          ? "Checking your account..."
          : mode === "login"
          ? "Login to StockLoyal"
          : "Create StockLoyal Account"}
      </h2>

      {!isChecking && mode === "create" && points > 0 && (
        <p className="welcome-points">
          Welcome! You’ve earned <strong>{points}</strong> points from{" "}
          <strong>{merchantId || "your merchant"}</strong> — worth $
          {(points * conversionRate).toFixed(2)}. Create your account to claim them.
        </p>
      )}

      {isChecking ? (
        <p>One moment while we check your account status…</p>
      ) : (
        <form className="form member-form-grid" onSubmit={handleSubmit}>
          <div className="member-form-row">
            <label htmlFor="memberId" className="member-form-label">
              {mode === "create" ? "Email / Member ID:" : "Member ID or Email:"}
            </label>
            <input
              id="memberId"
              type="text"
              className="member-form-input"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              autoComplete="username"
            />
          </div>

          {mode === "create" && (
            <div className="member-form-row">
              <label htmlFor="email" className="member-form-label">
                Email:
              </label>
              <input
                id="email"
                type="email"
                className="member-form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          <div className="member-form-row">
            <label htmlFor="password" className="member-form-label">
              Password:
            </label>
            <div className="password-wrapper-inline" style={{ flex: 1 }}>
              <input
                id="password"
                type={showPw ? "text" : "password"}
                className="member-form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "create" ? "new-password" : "current-password"}
              />
              <img
                src={`${import.meta.env.BASE_URL}icons/${
                  showPw ? "hide.png" : "show.png"
                }`}
                alt={showPw ? "Hide password" : "Show password"}
                className="pw-toggle-icon"
                onClick={() => setShowPw(!showPw)}
              />
            </div>
          </div>

          {/* Confirm Password field (create mode only) */}
          {!isChecking && mode === "create" && (
            <div className="member-form-row">
              <label htmlFor="confirmPassword" className="member-form-label">
                Confirm Password:
              </label>
              <input
                id="confirmPassword"
                type={showPw ? "text" : "password"}
                className="member-form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary">
            {mode === "login" ? "Login" : "Create Account"}
          </button>

          {/* Allow manual toggle as backup, but disable during checking */}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleToggleMode}
            disabled={isChecking}
          >
            {mode === "login" ? "Need an account?" : "Already have an account?"}
          </button>
        </form>
      )}

      <p className="form-disclosure">
        <strong>Note:</strong> This login is for the <em>StockLoyal platform</em>{" "}
        only. Your StockLoyal ID and password are used to access StockLoyal
        features. When linking your brokerage account (e.g., Public.com,
        Robinhood, Fidelity), you will enter those credentials separately and
        securely. StockLoyal does <u>not</u> use your StockLoyal ID or password
        to access your broker, and your broker login remains independent.
      </p>
    </div>
  );
}

export default Login;
