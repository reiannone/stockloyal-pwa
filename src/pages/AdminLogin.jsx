// src/pages/AdminLogin.jsx
// Standalone admin login — bypasses member login entirely.
// Accessible at /admin-login with no header/footer (FrameOnly route).

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Eye, EyeOff, Lock } from "lucide-react";

const ADMIN_PASSWORD = "StockLoyal2024!";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already authenticated, skip straight to admin-home
  useEffect(() => {
    if (localStorage.getItem("adminAuthenticated") === "true") {
      navigate("/admin-home", { replace: true });
    }
  }, []);

  const handleSubmit = () => {
    setError("");
    setLoading(true);

    // Small delay so the button feels responsive
    setTimeout(() => {
      if (password === ADMIN_PASSWORD) {
        localStorage.setItem("adminAuthenticated", "true");
        navigate("/admin-home", { replace: true });
      } else {
        setError("Incorrect password. Please try again.");
        setPassword("");
        setLoading(false);
      }
    }, 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          padding: "40px 36px",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
        }}
      >
        {/* Logo / icon */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #1e293b, #334155)",
              marginBottom: "16px",
            }}
          >
            <ShieldCheck size={32} color="#fff" />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            Admin Access
          </h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "0.875rem" }}>
            StockLoyal Administration
          </p>
        </div>

        {/* Password field */}
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#374151",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Password
          </label>
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
              }}
            >
              <Lock size={16} />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter admin password"
              autoFocus
              style={{
                width: "100%",
                padding: "11px 40px 11px 38px",
                border: `1.5px solid ${error ? "#ef4444" : "#e2e8f0"}`,
                borderRadius: "8px",
                fontSize: "0.95rem",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
                color: "#0f172a",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                padding: 4,
                display: "flex",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              padding: "9px 12px",
              color: "#dc2626",
              fontSize: "0.82rem",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !password}
          style={{
            width: "100%",
            padding: "12px",
            background:
              loading || !password
                ? "#94a3b8"
                : "linear-gradient(135deg, #1e293b, #334155)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: loading || !password ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {loading ? "Verifying…" : "Sign In to Admin"}
        </button>

        {/* Back to member login */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            type="button"
            onClick={() => navigate("/login")}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              fontSize: "0.82rem",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            ← Back to member login
          </button>
        </div>
      </div>
    </div>
  );
}
