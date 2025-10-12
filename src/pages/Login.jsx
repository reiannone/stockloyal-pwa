// src/pages/Login.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";

function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [memberId, setMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); // ✅ new
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [points, setPoints] = useState(0);
  const [conversionRate, setConversionRate] = useState(0.01);

  // ✅ Hydrate from localStorage
  useEffect(() => {
    const lsMode = localStorage.getItem("mode");
    const lsMemberId = localStorage.getItem("memberId");
    const lsEmail = localStorage.getItem("memberEmail");
    const lsMerchantId = localStorage.getItem("merchantId");
    const lsPoints = parseInt(localStorage.getItem("points") || "0", 10);
    const lsConversionRate = parseFloat(localStorage.getItem("conversion_rate") || "0");

    if (lsMode) setMode(lsMode);
    if (lsMemberId) setMemberId(lsMemberId);
    if (lsEmail) setEmail(lsEmail);
    if (lsMerchantId) setMerchantId(lsMerchantId);
    if (lsPoints > 0) setPoints(lsPoints);

    setConversionRate(lsConversionRate > 0 ? lsConversionRate : 0.01);
  }, []);

  // ✅ Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!memberId || !password || (mode === "create" && !email)) {
      setError("Please fill in all required fields.");
      return;
    }

    // ✅ Password confirmation validation
    if (mode === "create" && password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    if (mode === "create") {
      try {
        const data = await apiPost("create_member.php", {
          member_id: memberId,
          member_email: email,
          password, // plain password — backend hashes it
        });

        if (data.success) {
          localStorage.setItem("memberId", memberId);
          localStorage.setItem("memberEmail", email);
          if (merchantId) localStorage.setItem("merchantId", merchantId);

          navigate("/member-onboard", {
            state: { memberId, memberEmail: email },
          });
        } else {
          setError(data.error || "Account creation failed.");
        }
      } catch (err) {
        console.error("Create member error:", err);
        setError("Network error. Please try again.");
      }
    } else {
      try {
        const data = await apiPost("login.php", {
          member_id: memberId,
          password,
        });

        if (data && data.success) {
          localStorage.setItem("memberId", memberId);
          localStorage.setItem("memberEmail", data.member_email || "");
          if (merchantId) localStorage.setItem("merchantId", merchantId);
          navigate("/wallet");
        }
      } catch (err) {
        if (err.status === 404) {
          setError("No account found for this Member ID. Please create an account.");
        } else if (err.status === 401) {
          setError("Invalid password.");
        } else {
          console.error("Login error:", err);
          setError("Server error. Please try again later.");
        }
      }
    }
  };

  return (
    <div className="page-container">
      <h2 className="page-title">
        {mode === "login" ? "Login to StockLoyal" : "Create StockLoyal Account"}
      </h2>

      {mode === "create" && points > 0 && (
        <p className="welcome-points">
          Welcome! You’ve earned <strong>{points}</strong> points from{" "}
          <strong>{merchantId}</strong> — worth $
          {(points * conversionRate).toFixed(2)}. Create your account to claim them.
        </p>
      )}

      <form className="form member-form-grid" onSubmit={handleSubmit}>
        <div className="member-form-row">
          <label htmlFor="memberId" className="member-form-label">
            Member ID:
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
              autoComplete="current-password"
            />
            <img
              src={`${import.meta.env.BASE_URL}icons/${showPw ? "hide.png" : "show.png"}`}
              alt={showPw ? "Hide password" : "Show password"}
              className="pw-toggle-icon"
              onClick={() => setShowPw(!showPw)}
            />
          </div>
        </div>

        {/* ✅ Confirm Password field (create mode only) */}
        {mode === "create" && (
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

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setMode(mode === "login" ? "create" : "login")}
        >
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>

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
