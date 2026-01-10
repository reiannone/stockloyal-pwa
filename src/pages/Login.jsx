// src/pages/Login.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const normUsername = (s) => String(s || "").trim().toLowerCase();

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("checking"); // checking | login | create

  // Login identifier (username OR email)
  const [identifier, setIdentifier] = useState("");

  // Create fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const [merchantId, setMerchantId] = useState("");
  const [points, setPoints] = useState(0);
  const [conversionRate, setConversionRate] = useState(0.01);

  const detectedConv = useMemo(() => {
    const v = parseFloat(localStorage.getItem("conversion_rate") || "0");
    return v > 0 ? v : 0.01;
  }, []);

  const persistSession = (payload = {}) => {
    // Payload may come from login.php/create_member.php.
    // We preserve existing LS values when payload doesn’t include them.
    const existing = {
      memberId: localStorage.getItem("memberId") || "",
      memberEmail: localStorage.getItem("memberEmail") || "",
      merchantId: localStorage.getItem("merchantId") || "",
      merchantName: localStorage.getItem("merchantName") || "",
      broker: localStorage.getItem("broker") || "",
      memberTimezone: localStorage.getItem("memberTimezone") || "",
    };

    const next = {
      memberId: payload.member_id ?? payload.memberId ?? existing.memberId,
      memberEmail: payload.member_email ?? payload.memberEmail ?? existing.memberEmail,
      merchantId: payload.merchant_id ?? payload.merchantId ?? existing.merchantId,
      merchantName: payload.merchant_name ?? payload.merchantName ?? existing.merchantName,
      broker: payload.broker ?? existing.broker,
      memberTimezone: payload.member_timezone ?? payload.memberTimezone ?? existing.memberTimezone,
    };

    // Always set canonical keys (even if empty)
    localStorage.setItem("memberId", next.memberId || "");
    localStorage.setItem("memberEmail", next.memberEmail || "");
    localStorage.setItem("merchantId", next.merchantId || "");
    localStorage.setItem("merchantName", next.merchantName || "");
    localStorage.setItem("broker", next.broker || "");
    localStorage.setItem("memberTimezone", next.memberTimezone || "");
    localStorage.setItem("lastLoginAt", new Date().toISOString());

    // Let Header / other components refresh in same tab
    window.dispatchEvent(new Event("member-updated"));
  };

  useEffect(() => {
    const lsMerchantId = localStorage.getItem("merchantId") || "";
    const lsMemberId = localStorage.getItem("memberId") || "";
    const lsEmail = localStorage.getItem("memberEmail") || "";
    const lsPoints = parseInt(localStorage.getItem("points") || "0", 10);

    setMerchantId(lsMerchantId);
    setPoints(Number.isFinite(lsPoints) ? lsPoints : 0);
    setConversionRate(detectedConv);

    const initial = lsMemberId || lsEmail || "";
    setIdentifier(initial);

    (async () => {
      try {
        if (!initial) {
          setMode("login");
          return;
        }

        const lookup = await apiPost("member_lookup.php", {
          merchant_id: lsMerchantId || "",
          identifier: initial,
        });

        if (lookup?.success && lookup.exists && lookup.has_password) {
          setMode("login"); // already a member
        } else {
          setMode("create");
          if (lookup?.member_id) setUsername(String(lookup.member_id));
          if (lookup?.member_email) setEmail(String(lookup.member_email));
        }
      } catch {
        setMode("login");
      }
    })();
  }, [detectedConv]);

  const applyPointsIfAny = async (memberIdToUse) => {
    if (!points || points <= 0) return;
    const conv = conversionRate > 0 ? conversionRate : 0.01;
    const cashBalance = Number((points * conv).toFixed(2));

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

  const toggleMode = () => {
    setError("");
    setPassword("");
    setConfirmPassword("");
    setMode((m) => (m === "login" ? "create" : "login"));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const raw = String(identifier || "").trim();
    if (!raw || !password) {
      setError("Please enter your username (or email) and password.");
      return;
    }

    const normalizedIdentifier = isEmail(raw) ? raw.toLowerCase() : normUsername(raw);

    try {
      const data = await apiPost("login.php", {
        merchant_id: merchantId || "",
        identifier: normalizedIdentifier,
        password,
      });

      if (!data?.success) {
        setError(data?.error || "Login failed. Please check your credentials.");
        return;
      }

      // ✅ Persist full session bundle
      persistSession({
        ...data,
        merchant_id: data.merchant_id ?? merchantId, // fallback to pre-known merchantId
      });

      await applyPointsIfAny(data.member_id);
      navigate("/wallet");
    } catch {
      setError("Network or server error. Please try again.");
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");

    const uRaw = String(username || "").trim();
    const eRaw = String(email || "").trim();

    if (!uRaw || !eRaw || !password) {
      setError("Please enter a username, email, and password.");
      return;
    }

    if (isEmail(uRaw)) {
      setError("Username cannot be an email address. Please choose a username (e.g., robert).");
      return;
    }

    if (!isEmail(eRaw)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const u = normUsername(uRaw);
    const em = eRaw.toLowerCase();

    try {
      const data = await apiPost("create_member.php", {
        merchant_id: merchantId || null,
        member_id: u,
        member_email: em,
        password,
      });

      if (!data?.success) {
        setError(data?.error || "Account creation failed.");
        return;
      }

      // ✅ Persist session bundle after create as well
      persistSession({
        ...data,
        merchant_id: data.merchant_id ?? merchantId,
      });

      await applyPointsIfAny(data.member_id);

      navigate("/member-onboard", {
        state: { memberId: data.member_id, memberEmail: data.member_email },
      });
    } catch {
      setError("Network or server error. Please try again.");
    }
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
          Welcome! You’ve earned <strong>{points}</strong> points — worth $
          {(points * conversionRate).toFixed(2)}. Create your account to claim them.
        </p>
      )}

      {isChecking ? (
        <p>One moment while we check your account status…</p>
      ) : mode === "login" ? (
        <form className="form member-form-grid" onSubmit={handleLogin}>
          <div className="member-form-row">
            <label className="member-form-label">Username or Email:</label>
            <input
              type="text"
              className="member-form-input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="e.g., robert (or robert@email.com)"
            />
          </div>

          <div className="member-form-row">
            <label className="member-form-label">Password:</label>
            <div className="password-wrapper-inline" style={{ flex: 1 }}>
              <input
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

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary">Login</button>

          <button type="button" className="btn-secondary" onClick={toggleMode}>
            Need an account?
          </button>
        </form>
      ) : (
        <form className="form member-form-grid" onSubmit={handleCreate}>
          <div className="member-form-row">
            <label className="member-form-label">Username (not email):</label>
            <input
              type="text"
              className="member-form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="e.g., robert"
            />
          </div>

          <div className="member-form-row">
            <label className="member-form-label">Email:</label>
            <input
              type="email"
              className="member-form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="e.g., robert@email.com"
            />
          </div>

          <div className="member-form-row">
            <label className="member-form-label">Password:</label>
            <div className="password-wrapper-inline" style={{ flex: 1 }}>
              <input
                type={showPw ? "text" : "password"}
                className="member-form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <img
                src={`${import.meta.env.BASE_URL}icons/${showPw ? "hide.png" : "show.png"}`}
                alt={showPw ? "Hide password" : "Show password"}
                className="pw-toggle-icon"
                onClick={() => setShowPw(!showPw)}
              />
            </div>
          </div>

          <div className="member-form-row">
            <label className="member-form-label">Confirm Password:</label>
            <input
              type={showPw ? "text" : "password"}
              className="member-form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary">Create Account</button>

          <button type="button" className="btn-secondary" onClick={toggleMode}>
            Already have an account?
          </button>
        </form>
      )}
    </div>
  );
}
