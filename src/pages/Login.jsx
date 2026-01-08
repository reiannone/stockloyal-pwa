// src/pages/Login.jsx (Option A: dispatch member-updated after setting memberId)
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function Login() {
  const navigate = useNavigate();

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

  useEffect(() => {
    const lsMode = localStorage.getItem("mode"); // legacy / fallback
    const lsMemberId = localStorage.getItem("memberId");
    const lsEmail = localStorage.getItem("memberEmail");
    const lsMerchantId = localStorage.getItem("merchantId");
    const lsPoints = parseInt(localStorage.getItem("points") || "0", 10);
    const lsConversionRate = parseFloat(localStorage.getItem("conversion_rate") || "0");

    const initialEmail = lsEmail || "";
    const initialId = lsMemberId || initialEmail;

    setEmail(initialEmail);
    setMemberId(initialId);
    if (lsMerchantId) setMerchantId(lsMerchantId);
    if (lsPoints > 0) setPoints(lsPoints);
    setConversionRate(lsConversionRate > 0 ? lsConversionRate : 0.01);

    if (!lsMerchantId || !initialEmail) {
      setMode(lsMode === "create" ? "create" : "login");
      return;
    }

    (async () => {
      try {
        const data = await apiPost("check_wallet_member.php", {
          merchant_id: lsMerchantId,
          member_id: initialId || initialEmail,
        });

        console.log("[Login] check_wallet_member response:", data);

        if (data && data.success) {
          if (data.exists) {
            setMode("login");
            localStorage.setItem("mode", "login");
          } else {
            setMode("create");
            localStorage.setItem("mode", "create");
          }
        } else {
          setMode(lsMode === "create" ? "create" : "login");
        }
      } catch (err) {
        console.error("[Login] check_wallet_member error:", err);
        setMode(lsMode === "create" ? "create" : "login");
      }
    })();
  }, []);

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
    }
  };

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

    if (mode === "create" && password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    if (mode === "create") {
      try {
        const data = await apiPost("create_member.php", {
          merchant_id: merchantId || null,
          member_id: effectiveMemberId,
          member_email: email || effectiveMemberId,
          password,
        });

        console.log("[Login] create_member.php response:", data);

        if (data && data.success) {
          // Persist identity
          localStorage.setItem("memberId", effectiveMemberId);
          localStorage.setItem("memberEmail", email || effectiveMemberId);
          if (merchantId) localStorage.setItem("merchantId", merchantId);

          // ✅ Option A: notify same-tab listeners (Header)
          window.dispatchEvent(new Event("member-updated"));

          await applyPointsIfAny(effectiveMemberId);

          navigate("/member-onboard", {
            state: { memberId: effectiveMemberId, memberEmail: email || effectiveMemberId },
          });
        } else {
          setError(data?.error || data?.message || "Account creation failed.");
        }
      } catch (err) {
        console.error("Create member error:", err);
        setError("Network error. Please try again.");
      }
    } else {
      try {
        const data = await apiPost("login.php", {
          merchant_id: merchantId || null,
          member_id: effectiveMemberId,
          password,
        });

        console.log("[Login] login.php response:", data);

        if (!data?.success) {
          const rawMsg = data?.message || data?.error || "Login failed. Please check your credentials.";
          const msg = rawMsg.toLowerCase();

          if (msg.includes("invalid password")) setError("Invalid password. Please try again.");
          else if (msg.includes("not found") || msg.includes("no account")) setError("No account found. Please create an account.");
          else setError("Login failed. Please check your credentials.");
          return;
        }

        // Successful login
        localStorage.setItem("memberId", effectiveMemberId);
        localStorage.setItem("memberEmail", data.member_email || email || effectiveMemberId);
        if (merchantId) localStorage.setItem("merchantId", merchantId);

        // ✅ Option A: notify same-tab listeners (Header)
        window.dispatchEvent(new Event("member-updated"));

        await applyPointsIfAny(effectiveMemberId);

        navigate("/wallet");
      } catch (err) {
        console.error("Login error:", err);

        const raw = String(err?.message || "").toLowerCase();

        if (raw.includes("invalid password")) setError("Invalid password. Please try again.");
        else if (raw.includes("401")) setError("Invalid password. Please try again.");
        else if (raw.includes("404")) setError("No account found. Please create an account.");
        else setError("Network or server error. Please try again.");
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
        {isChecking ? "Checking your account..." : mode === "login" ? "Login to StockLoyal" : "Create StockLoyal Account"}
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
                src={`${import.meta.env.BASE_URL}icons/${showPw ? "hide.png" : "show.png"}`}
                alt={showPw ? "Hide password" : "Show password"}
                className="pw-toggle-icon"
                onClick={() => setShowPw(!showPw)}
              />
            </div>
          </div>

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

          <button type="button" className="btn-secondary" onClick={handleToggleMode} disabled={isChecking}>
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
