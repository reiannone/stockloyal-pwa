// src/pages/Login.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const normUsername = (s) => String(s || "").trim().toLowerCase();

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState("checking"); // checking | welcome-back | login | create | forgot | reset
  const [welcomeName, setWelcomeName] = useState("");

  // Login identifier (username OR email)
  const [identifier, setIdentifier] = useState("");

  // Create fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(location.state?.error || "");
  const [successMsg, setSuccessMsg] = useState("");

  // Forgot / Reset password
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");

  const [merchantId, setMerchantId] = useState("");
  const [points, setPoints] = useState(0);
  const [conversionRate, setConversionRate] = useState(0.01);

  const detectedConv = useMemo(() => {
    const v = parseFloat(localStorage.getItem("conversion_rate") || "0");
    return v > 0 ? v : 0.01;
  }, []);

  const persistSession = (payload = {}) => {
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

    localStorage.setItem("memberId", next.memberId || "");
    localStorage.setItem("memberEmail", next.memberEmail || "");
    localStorage.setItem("merchantId", next.merchantId || "");
    localStorage.setItem("merchantName", next.merchantName || "");
    localStorage.setItem("broker", next.broker || "");
    localStorage.setItem("memberTimezone", next.memberTimezone || "");
    localStorage.setItem("lastLoginAt", new Date().toISOString());
    
    // ✅ Clear cached portfolio_value to prevent flash of stale data on Wallet load
    localStorage.removeItem("portfolio_value");

    window.dispatchEvent(new Event("member-updated"));
  };

  useEffect(() => {
    const lsMerchantId = localStorage.getItem("merchantId") || "";
    const lsMemberId = localStorage.getItem("memberId") || "";
    const lsPoints = parseInt(localStorage.getItem("points") || "0", 10);

    setMerchantId(lsMerchantId);
    setPoints(Number.isFinite(lsPoints) ? lsPoints : 0);
    setConversionRate(detectedConv);

    (async () => {
      try {
        // ✅ If redirected from Wallet/elsewhere with an error, skip straight to login
        if (location.state?.error) {
          console.log("[Login] Redirected with error:", location.state.error);
          setMode("login");
          return;
        }

        // If we have a memberId, check whether they already have a wallet
        if (lsMemberId) {
          console.log("[Login] memberId found, checking wallet for:", lsMemberId);

          try {
            const walletCheck = await apiPost("get-wallet.php", { member_id: lsMemberId });

            if (walletCheck?.success && walletCheck?.wallet) {
              // ✅ Check member_status before auto-redirect
              const status = (walletCheck.wallet.member_status || "active").toLowerCase();
              if (status === "blocked" || status === "closed") {
                console.log("[Login] Account is", status, "— clearing session");
                localStorage.removeItem("memberId");
                localStorage.removeItem("memberEmail");
                setError(
                  status === "blocked"
                    ? "Your account has been blocked. Please contact support."
                    : "Your account has been closed. Please contact support."
                );
                setMode("login");
                return;
              }

              // Existing user with wallet — show welcome back briefly
              console.log("[Login] User has wallet, showing welcome-back");
              setWelcomeName(lsMemberId);
              setMode("welcome-back");
              return;
            }
          } catch (walletErr) {
            console.log("[Login] Wallet check failed - new user");
          }

          // No wallet → new user, pre-fill username, show create form
          console.log("[Login] No wallet found, pre-filling username with:", lsMemberId);
          setUsername(lsMemberId);
          setMode("create");
          return;
        }

        // No memberId at all → show login form
        console.log("[Login] No memberId, showing login form");
        setMode("login");
      } catch {
        console.log("[Login] Exception caught, showing login form");
        setMode("login");
      }
    })();
  }, [detectedConv, navigate]);

  // ── Welcome-back: pause briefly then redirect ──
  useEffect(() => {
    if (mode !== "welcome-back") return;
    const timer = setTimeout(() => navigate("/wallet"), 2500);
    return () => clearTimeout(timer);
  }, [mode, navigate]);

  // ───────────────────────────────────────────────────
  // Apply any pending inbound points after account creation.
  // Called once after create_member succeeds.
  // ───────────────────────────────────────────────────
  const applyPendingInbound = async (memberIdToUse) => {
    try {
      const data = await apiPost("apply-pending-inbound.php", {
        member_id: memberIdToUse,
      });

      if (data?.success && data?.applied > 0) {
        console.log("[Login] Applied", data.applied, "pending inbound record(s)");
        console.log("[Login] Points:", data.points, "Cash:", data.cash_balance, "Tier:", data.tier);

        // Update localStorage with the applied values
        if (data.points !== undefined) localStorage.setItem("points", String(data.points));
        if (data.cash_balance !== undefined) localStorage.setItem("cashBalance", String(data.cash_balance));
        if (data.tier) localStorage.setItem("memberTier", data.tier);
      } else {
        console.log("[Login] No pending inbound records to apply");
      }
    } catch (err) {
      console.error("[Login] apply-pending-inbound failed:", err);
      // Non-blocking: account is created, points can be applied later
    }
  };

  // ───────────────────────────────────────────────────
  // Hydrate merchant data into localStorage.
  // Same data SplashScreen normally sets (name, logo,
  // sweep_day, conversion_rate, full merchant JSON).
  // Called after login/create when SplashScreen was skipped.
  // ───────────────────────────────────────────────────
  const hydrateMerchant = async (mId) => {
    if (!mId) return;

    try {
      console.log("[Login] Hydrating merchant data for:", mId);
      const resp = await apiPost("get_merchant.php", { merchant_id: mId });

      if (resp?.success && resp?.merchant) {
        const m = resp.merchant;
        localStorage.setItem("merchant", JSON.stringify(m));

        if (m.merchant_name) localStorage.setItem("merchantName", m.merchant_name);
        if (m.logo_url) {
          localStorage.setItem("merchantLogo", m.logo_url);
        } else {
          localStorage.removeItem("merchantLogo");
        }
        if (m.sweep_day !== undefined && m.sweep_day !== null) {
          localStorage.setItem("sweep_day", String(m.sweep_day));
        } else {
          localStorage.removeItem("sweep_day");
        }

        // Conversion rate (base → tier override)
        let rate = parseFloat(m.conversion_rate || "0");
        if (!rate || rate <= 0) rate = 0.01;

        const memberTier = localStorage.getItem("memberTier");
        if (memberTier) {
          for (let i = 1; i <= 6; i++) {
            const tierName = m[`tier${i}_name`];
            if (tierName && tierName.toLowerCase() === memberTier.toLowerCase()) {
              const tierRate = parseFloat(m[`tier${i}_conversion_rate`] || 0);
              if (tierRate > 0) rate = tierRate;
              break;
            }
          }
        }
        localStorage.setItem("conversion_rate", rate.toString());

        console.log("[Login] Merchant hydrated:", m.merchant_name, "rate:", rate);
      }
    } catch (err) {
      console.error("[Login] hydrateMerchant failed:", err);
    }
  };

  const toggleMode = () => {
    setError("");
    setSuccessMsg("");
    setPassword("");
    setConfirmPassword("");
    setResetEmail("");
    setResetCode("");
    setMode((m) => (m === "login" ? "create" : "login"));
  };

  // ───────────────────────────────────────────────────
  // Forgot Password — request a reset code via email
  // ───────────────────────────────────────────────────
  const handleForgotRequest = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const emailRaw = String(resetEmail || "").trim().toLowerCase();
    if (!isEmail(emailRaw)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      const data = await apiPost("forgot-password.php", {
        email: emailRaw,
        merchant_id: merchantId || "",
      });

      if (!data?.success) {
        setError(data?.error || "Unable to send reset code. Please try again.");
        return;
      }

      setSuccessMsg("A reset code has been sent to your email. Check your inbox (and spam folder).");
      setMode("reset");
    } catch (err) {
      console.error("[Login] Forgot password error:", err);
      setError(err?.error || err?.message || "Unable to connect to server. Please try again.");
    }
  };

  // ───────────────────────────────────────────────────
  // Reset Password — verify code and set new password
  // ───────────────────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const code = String(resetCode || "").trim();
    if (!code) {
      setError("Please enter the reset code from your email.");
      return;
    }
    if (!password) {
      setError("Please enter a new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const data = await apiPost("reset-password.php", {
        email: resetEmail.trim().toLowerCase(),
        code,
        new_password: password,
      });

      if (!data?.success) {
        setError(data?.error || "Password reset failed. Please try again.");
        return;
      }

      setSuccessMsg("Password reset successfully! You can now log in.");
      setPassword("");
      setConfirmPassword("");
      setResetCode("");
      setResetEmail("");
      setMode("login");
    } catch (err) {
      console.error("[Login] Reset password error:", err);
      setError(err?.error || err?.message || "Unable to connect to server. Please try again.");
    }
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

      console.log("[Login] API response:", data);

      if (!data?.success) {
        setError(data?.error || "Invalid username or password. Please try again.");
        return;
      }

      persistSession({
        ...data,
        merchant_id: data.merchant_id ?? merchantId,
      });

      // Hydrate merchant data if SplashScreen was skipped
      const effectiveMerchantId = data.merchant_id ?? merchantId;
      await hydrateMerchant(effectiveMerchantId);

      // ✅ Sync points & tier from merchant before navigating to wallet
      try {
        const syncData = await apiPost("request-member-sync.php", { member_id: data.member_id });
        if (syncData?.success) {
          if (syncData.points_changed) {
            localStorage.setItem("points", String(syncData.points));
            localStorage.setItem("cashBalance", Number(syncData.cash_balance || 0).toFixed(2));
          }
          if (syncData.tier_changed) {
            localStorage.setItem("memberTier", String(syncData.member_tier));
          }
          if (syncData.points_changed || syncData.tier_changed) {
            console.log("[Login] Merchant sync applied:", syncData);
            window.dispatchEvent(new Event("member-updated"));
          }
        }
      } catch (err) {
        console.warn("[Login] Merchant sync failed (non-blocking):", err);
      }

      navigate("/wallet");
    } catch (err) {
      console.error("[Login] Error caught:", err);
      if (err?.error) {
        setError(err.error);
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError("Unable to connect to server. Please check your internet connection and try again.");
      }
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

      console.log("[Login] Create account response:", data);

      if (!data?.success) {
        setError(data?.error || "Account creation failed. Please try again.");
        return;
      }

      persistSession({
        ...data,
        merchant_id: data.merchant_id ?? merchantId,
      });

      // Apply any queued pending_inbound points for this member
      await applyPendingInbound(data.member_id);

      // Hydrate merchant data if SplashScreen was skipped
      const effectiveMerchantId = data.merchant_id ?? merchantId;
      await hydrateMerchant(effectiveMerchantId);

      navigate("/member-onboard", {
        state: { memberId: data.member_id, memberEmail: data.member_email },
      });
    } catch (err) {
      console.error("[Login] Error caught:", err);
      if (err?.error) {
        setError(err.error);
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError("Unable to connect to server. Please check your internet connection and try again.");
      }
    }
  };

  const isChecking = mode === "checking";

  return (
    <div className="page-container">
      <h2 className="page-title">
        {isChecking
          ? "Checking your account..."
          : mode === "welcome-back"
          ? `Welcome back, ${welcomeName}!`
          : mode === "login"
          ? "Login to StockLoyal"
          : mode === "forgot"
          ? "Forgot Password"
          : mode === "reset"
          ? "Reset Password"
          : "Create StockLoyal Account"}
      </h2>

      {successMsg && <p className="form-success" style={{ color: "#2e7d32", textAlign: "center", marginBottom: 12 }}>{successMsg}</p>}

      {!isChecking && mode === "create" && points > 0 && (
        <p className="welcome-points">
          Welcome! You've earned <strong>{points}</strong> points — worth $
          {(points * conversionRate).toFixed(2)}. Create your account to claim them.
        </p>
      )}

      {isChecking ? (
        <p>One moment while we check your account status…</p>
      ) : mode === "welcome-back" ? (
        <div style={{ textAlign: "center", padding: "2rem 0" }}>
          <p style={{ fontSize: "1.05rem", color: "#64748b" }}>Taking you to your wallet…</p>
          <div style={{
            width: 40, height: 40, margin: "1.5rem auto 0",
            border: "3px solid #e2e8f0", borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
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

          <button
            type="button"
            className="btn-link"
            style={{ background: "none", border: "none", color: "#1976d2", cursor: "pointer", textDecoration: "underline", padding: "4px 0", fontSize: "0.9rem" }}
            onClick={() => { setError(""); setSuccessMsg(""); setPassword(""); setMode("forgot"); }}
          >
            Forgot Password?
          </button>

          <button type="button" className="btn-secondary" onClick={toggleMode}>
            Need an account?
          </button>
        </form>
      ) : mode === "forgot" ? (
        <form className="form member-form-grid" onSubmit={handleForgotRequest}>
          <p style={{ marginBottom: 12, fontSize: "0.95rem", color: "#555" }}>
            Enter the email address associated with your account and we'll send you a reset code.
          </p>

          <div className="member-form-row">
            <label className="member-form-label">Email:</label>
            <input
              type="email"
              className="member-form-input"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              autoComplete="email"
              placeholder="e.g., robert@email.com"
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary">Send Reset Code</button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setError(""); setSuccessMsg(""); setMode("login"); }}
          >
            Back to Login
          </button>
        </form>
      ) : mode === "reset" ? (
        <form className="form member-form-grid" onSubmit={handleResetPassword}>
          <div className="member-form-row">
            <label className="member-form-label">Reset Code:</label>
            <input
              type="text"
              className="member-form-input"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              autoComplete="one-time-code"
              placeholder="Enter the code from your email"
            />
          </div>

          <div className="member-form-row">
            <label className="member-form-label">New Password:</label>
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

          <button type="submit" className="btn-primary">Reset Password</button>

          <button
            type="button"
            className="btn-link"
            style={{ background: "none", border: "none", color: "#1976d2", cursor: "pointer", textDecoration: "underline", padding: "4px 0", fontSize: "0.9rem" }}
            onClick={() => { setError(""); setSuccessMsg(""); handleForgotRequest({ preventDefault: () => {} }); }}
          >
            Didn't get a code? Resend
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setError(""); setSuccessMsg(""); setMode("login"); }}
          >
            Back to Login
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
