// src/pages/SelectBroker.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBroker } from "../context/BrokerContext";
import { apiPost } from "../api.js";
import ConfirmModal from "../components/ConfirmModal";
import { AlertTriangle, ExternalLink } from "lucide-react";

/* ────────────────────────────────────────────
   BrokerLogo — renders logo_url from DB,
   falls back to styled initials if the image
   is missing or fails to load.
   ──────────────────────────────────────────── */
function BrokerLogo({ broker }) {
  const [imgError, setImgError] = useState(false);

  if (broker.logo && !imgError) {
    return (
      <img
        src={broker.logo}
        alt={broker.name}
        className="broker-logo"
        onError={() => setImgError(true)}
      />
    );
  }

  const initials = broker.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div
      className="broker-logo"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e5e7eb",
        borderRadius: 12,
        fontSize: "1.25rem",
        fontWeight: 700,
        color: "#374151",
        width: 80,
        height: 80,
      }}
      title={broker.name}
    >
      {initials}
    </div>
  );
}

/* ────────────────────────────────────────────
   SelectBroker page
   ──────────────────────────────────────────── */
export default function SelectBroker() {
  const [selected, setSelected] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState(""); // ✅ NEW: for Alpaca
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  // ✅ Dynamic broker list fetched from broker_master via get-brokers.php
  const [allBrokers, setAllBrokers] = useState([]);

  // Merchant-filtered broker IDs
  const [allowedBrokerIds, setAllowedBrokerIds] = useState(null);
  const [merchantId, setMerchantId] = useState(null);

  // Warning popup for redirect to broker site
  const [redirectModal, setRedirectModal] = useState({
    open: false,
    brokerName: "",
    url: "",
  });

  // ── Credential validation state ──
  const [validationModal, setValidationModal] = useState({
    open: false,
    validated: false,
    message: "",
  });
  const [failCount, setFailCount] = useState(0);
  const MAX_FAILS = 10;

  const navigate = useNavigate();
  const { updateBroker } = useBroker();
  const memberId = localStorage.getItem("memberId");

  // ── Redirect to Goodbye if max fails exceeded ──
  useEffect(() => {
    if (failCount >= MAX_FAILS) {
      navigate("/goodbye", { replace: true });
    }
  }, [failCount, navigate]);

  // ✅ Determine if selected broker is Alpaca (API-based)
  const selectedBroker = useMemo(
    () => allBrokers.find((b) => b.id === selected),
    [allBrokers, selected]
  );

  const isAlpacaBroker = selectedBroker?.brokerType === "alpaca";

  // ✅ Filtered brokers based on merchant relationship
  const brokers = useMemo(() => {
    if (allBrokers.length === 0) return [];
    if (allowedBrokerIds === null) return allBrokers;
    if (allowedBrokerIds.length === 0) return allBrokers;
    return allBrokers.filter((b) => allowedBrokerIds.includes(b.id));
  }, [allBrokers, allowedBrokerIds]);

  // ✅ Updated canSubmit — different rules for Alpaca vs webhook brokers
  const canSubmit = useMemo(() => {
    if (!selected || submitting) return false;

    if (isAlpacaBroker) {
      // Alpaca only needs email
      return Boolean(email && email.includes("@"));
    }

    // Webhook brokers need username + matching passwords
    return Boolean(
      username && password && confirmPassword && password === confirmPassword
    );
  }, [selected, submitting, isAlpacaBroker, email, username, password, confirmPassword]);

  // ✅ Load brokers from broker_master, wallet info, and merchant restrictions
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // ── 1. Fetch all brokers from broker_master ──
        try {
          const brokerList = await apiPost("get-brokers.php", {});
          if (brokerList?.success && Array.isArray(brokerList.brokers)) {
            const mapped = brokerList.brokers.map((b) => ({
              id:         b.broker_id,
              name:       b.broker_name,
              logo:       b.logo_url || "",
              url:        b.website_url || "",
              brokerType: b.broker_type || "webhook", // ✅ NEW: 'alpaca' or 'webhook'
            }));
            setAllBrokers(mapped);
            console.log("[SelectBroker] Loaded", mapped.length, "brokers from broker_master");
          } else {
            console.warn("[SelectBroker] get-brokers.php returned no brokers");
            setAllBrokers([]);
          }
        } catch (brokerListErr) {
          console.error("[SelectBroker] Failed to fetch broker list:", brokerListErr);
          setAllBrokers([]);
        }

        // ── 2. Fetch wallet + merchant restrictions ──
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (data?.success && data.wallet) {
          const currentBroker = data.wallet.broker || "";
          const currentMerchantId =
            data.wallet.merchant_id || localStorage.getItem("merchantId");
          const creds = data.broker_credentials || {};

          const serverFailCount = parseInt(creds.credential_fail_count || "0", 10);
          setFailCount(serverFailCount);
          if (creds.locked_at) {
            navigate("/goodbye", { replace: true });
            return;
          }

          setMerchantId(currentMerchantId);

          // Pre-fill email from wallet
          if (data.wallet.member_email) {
            setEmail(data.wallet.member_email);
          }

          if (currentBroker) {
            setSelected(currentBroker);
            setUsername(creds.username || "");
            if (creds.password) {
              setHasExistingPassword(true);
              setPassword("");
              setConfirmPassword("");
            }
          }

          // Load merchant's allowed brokers
          if (currentMerchantId) {
            try {
              const brokerData = await apiPost("get-merchant-brokers.php", {
                merchant_id: currentMerchantId,
              });
              if (brokerData?.success) {
                setAllowedBrokerIds(brokerData.broker_ids || []);
              }
            } catch (brokerErr) {
              console.warn("[SelectBroker] Could not load merchant brokers:", brokerErr);
              setAllowedBrokerIds([]);
            }
          } else {
            setAllowedBrokerIds([]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch current broker:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  // If selected broker is no longer in the allowed list, clear selection
  useEffect(() => {
    if (allowedBrokerIds !== null && allowedBrokerIds.length > 0 && selected) {
      if (!allowedBrokerIds.includes(selected)) {
        setSelected("");
      }
    }
  }, [allowedBrokerIds, selected]);

  const handleBrokerSelect = (brokerId) => {
    setSelected(brokerId);
    setError("");
    updateBroker(brokerId);
  };

  const handlePasswordFocus = () => {
    if (hasExistingPassword && !passwordTouched) {
      setPasswordTouched(true);
      setPassword("");
      setConfirmPassword("");
    }
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    setPasswordTouched(true);
  };

  const handleConfirmPasswordChange = (e) => {
    setConfirmPassword(e.target.value);
  };

  // ╔═══════════════════════════════════════════════════════╗
  // ║  SUBMIT HANDLER — routes Alpaca vs webhook            ║
  // ╚═══════════════════════════════════════════════════════╝
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (!isAlpacaBroker && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (failCount >= MAX_FAILS) {
      navigate("/goodbye", { replace: true });
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const broker = brokers.find((b) => b.id === selected);

      // ── Build validation payload ──
      const payload = {
        member_id: memberId,
        broker: selected,
      };

      if (isAlpacaBroker) {
        payload.email = email;
      } else {
        payload.username = username;
        payload.password = password;
      }

      // ── Step 1: Validate credentials / check account ──
      const validationRes = await apiPost("validate-broker-credentials.php", payload);

      // ── Handle Alpaca "no account found" → redirect to member onboard ──
      if (isAlpacaBroker && validationRes?.no_account) {
        setSubmitting(false);
        // Store context for onboarding — clear any stale broker account so
        // MemberOnboard takes the CREATE path, not UPDATE
        localStorage.setItem("broker", selected);
        localStorage.setItem("broker_url", broker?.url || "");
        localStorage.setItem("onboard_email", email);
        localStorage.removeItem("broker_account_id");
        localStorage.removeItem("broker_account_number");
        navigate("/member-onboard", {
          state: {
            broker: selected,
            email: email,
            fromSelectBroker: true,
          },
        });
        return;
      }

      if (!validationRes?.success || !validationRes?.validated) {
        const serverFailCount = validationRes?.fail_count ?? (failCount + 1);
        setFailCount(serverFailCount);

        if (validationRes?.locked || serverFailCount >= MAX_FAILS) {
          navigate("/goodbye", { replace: true });
          return;
        }

        const remainingAttempts = MAX_FAILS - serverFailCount;
        setValidationModal({
          open: true,
          validated: false,
          message:
            validationRes?.message ||
            (isAlpacaBroker
              ? "No brokerage account found for this email."
              : "The broker could not verify your credentials."),
          remainingAttempts: isAlpacaBroker ? undefined : remainingAttempts,
        });
        setSubmitting(false);
        return;
      }

      // ── Step 2: Validated — show success ──
      setValidationModal({
        open: true,
        validated: true,
        message:
          validationRes?.message ||
          (isAlpacaBroker
            ? "Alpaca account found and linked successfully!"
            : "Your broker credentials have been verified successfully."),
      });

      // ── Step 3: Store credentials (for webhook brokers) ──
      if (!isAlpacaBroker) {
        const storePayload = {
          member_id: memberId,
          broker: selected,
          broker_url: broker?.url || "",
          username,
          password,
        };

        const data = await apiPost("store-broker-credentials.php", storePayload);
        if (!data?.success) {
          setError(data?.error || "Failed to link broker");
          setSubmitting(false);
          return;
        }

        if (data.member_id) {
          localStorage.setItem("memberId", data.member_id);
        }
      }

      // ── Store Alpaca info in localStorage ──
      if (isAlpacaBroker && validationRes?.alpaca_account_id) {
        localStorage.setItem("alpaca_account_id", validationRes.alpaca_account_id);
        localStorage.setItem("alpaca_account_number", validationRes.account_number || "");
      }

      setFailCount(0);
      updateBroker(selected);
      localStorage.setItem("broker", selected);
      localStorage.setItem("broker_url", broker?.url || "");

    } catch (err) {
      console.error("SelectBroker error:", err);
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  };

  // ── Handle dismiss of validation modal ──
  const handleValidationDismiss = () => {
    const wasValid = validationModal.validated;
    setValidationModal({ open: false, validated: false, message: "" });
    setSubmitting(false);
    if (wasValid) {
      navigate("/terms");
    }
  };

  const passwordPlaceholder =
    hasExistingPassword && !passwordTouched ? "••••••••••" : "";
  const confirmPasswordPlaceholder =
    hasExistingPassword && !passwordTouched ? "••••••••••" : "";

  // ✅ Open Account behavior
  const getDefaultBrokerForOpenAccount = () => {
    const publicBroker = brokers.find((b) => b.id === "Public.com");
    const fallback = publicBroker || brokers[0];
    return selectedBroker || fallback;
  };

  const handleOpenBrokerAccount = () => {
    const b = getDefaultBrokerForOpenAccount();

    // ✅ If Alpaca is selected, go to member-board instead of external redirect
    if (b?.brokerType === "alpaca") {
      localStorage.setItem("broker", b.id);
      localStorage.setItem("broker_url", b?.url || "");
      localStorage.setItem("onboard_email", email);
      localStorage.removeItem("broker_account_id");
      localStorage.removeItem("broker_account_number");
      navigate("/member-onboard", {
        state: { broker: b.id, email, fromSelectBroker: true },
      });
      return;
    }

    if (!b?.url) {
      setError("No website URL configured for this broker.");
      return;
    }
    setRedirectModal({
      open: true,
      brokerName: b?.name || "Broker",
      url: b?.url || "",
    });
  };

  const confirmRedirect = () => {
    const url = redirectModal.url;
    setRedirectModal({ open: false, brokerName: "", url: "" });
    if (url) window.location.href = url;
  };

  return (
    <div className="page-container">
      {/* ✅ Redirect warning modal */}
      {redirectModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 520,
              width: "100%",
              border: "2px solid #f59e0b",
              background: "#fffaf0",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <AlertTriangle size={34} color="#f59e0b" style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>
                  You're being redirected
                </div>
                <div style={{ marginTop: 6, color: "#7c2d12", fontWeight: 600 }}>
                  You are about to leave StockLoyal and go to{" "}
                  <strong>{redirectModal.brokerName}</strong> to open a brokerage
                  account.
                </div>
                <div className="caption" style={{ marginTop: 8 }}>
                  Continue to proceed to the broker website.
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 14,
                justifyContent: "flex-end",
              }}
            >
              <button
                className="btn-secondary"
                type="button"
                onClick={() =>
                  setRedirectModal({ open: false, brokerName: "", url: "" })
                }
              >
                Cancel
              </button>
              <button className="btn-primary" type="button" onClick={confirmRedirect}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="page-title">Connect your broker</h2>

      {/* ── Credential Validation Result Modal ── */}
      <ConfirmModal
        isOpen={validationModal.open}
        title={validationModal.validated ? "✅ Account Verified" : "❌ Verification Failed"}
        message={
          validationModal.validated
            ? validationModal.message
            : `${validationModal.message}${
                validationModal.remainingAttempts
                  ? `\n\nYou have ${validationModal.remainingAttempts} attempt${validationModal.remainingAttempts !== 1 ? "s" : ""} remaining.`
                  : ""
              }`
        }
        confirmLabel={validationModal.validated ? "Continue" : "Try Again"}
        cancelLabel={null}
        variant={validationModal.validated ? "info" : "danger"}
        onConfirm={handleValidationDismiss}
        onCancel={handleValidationDismiss}
      />

      <p className="page-deck">
        {isAlpacaBroker
          ? "Enter the email associated with your brokerage account to link it to your rewards program."
          : "Select your broker and enter your existing login to link your investment account to your rewards program."}
      </p>

      {/* Show merchant context if available */}
      {merchantId && allowedBrokerIds && allowedBrokerIds.length > 0 && (
        <p
          className="caption"
          style={{ textAlign: "center", marginBottom: 12, color: "#6b7280" }}
        >
          Showing {brokers.length} broker{brokers.length !== 1 ? "s" : ""} available
          for your program
        </p>
      )}

      {/* --- Broker logos from broker_master.logo_url --- */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
          Loading available brokers...
        </div>
      ) : brokers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#dc2626" }}>
          No brokers are currently available for your program. Please contact support.
        </div>
      ) : (
        <div className="broker-list">
          {brokers.map((b) => {
            const active = selected === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handleBrokerSelect(b.id)}
                disabled={submitting}
                className={`broker-card ${active ? "active" : ""} ${
                  submitting ? "disabled" : ""
                }`}
                style={{
                  border: active ? "3px solid #007bff" : undefined,
                  boxShadow: active ? "0 0 8px rgba(0,123,255,0.3)" : undefined,
                  transition: "border 0.2s, box-shadow 0.2s",
                }}
              >
                <BrokerLogo broker={b} />
              </button>
            );
          })}
        </div>
      )}

      {/* Open a Brokerage Account button */}
      {brokers.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleOpenBrokerAccount}
            disabled={submitting || loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
            title={
              isAlpacaBroker
                ? "Open a new brokerage account with Alpaca"
                : "Open an account at your selected broker"
            }
          >
            <ExternalLink size={18} />
            {isAlpacaBroker ? "Open a New Brokerage Account" : "Open a Brokerage Account"}
          </button>
        </div>
      )}

      {/* --- Security Notice --- */}
      <p className="form-disclosure mt-4">
        {isAlpacaBroker ? (
          <>
            <strong>Security Notice:</strong> StockLoyal manages your brokerage
            account through Alpaca Securities, a registered broker-dealer and
            member of FINRA/SIPC. Your personal information is securely
            transmitted and stored in compliance with industry regulations.
          </>
        ) : (
          <>
            <strong>Security Notice:</strong> Your broker login credentials are
            used only to securely connect your brokerage account with StockLoyal.
            These credentials are <u>encrypted and never visible</u> to
            StockLoyal, the merchant, or any third party. They are stored in
            encrypted form and protected to maintain your security and privacy.
            We do not share your login information under any circumstances.
          </>
        )}
      </p>

      {/* --- Credentials form --- */}
      <form onSubmit={handleSubmit} className="form">
        {/* ✅ ALPACA: Email-only field */}
        {isAlpacaBroker ? (
          <div>
            <label className="form-label">
              Email address linked to your Alpaca account
            </label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!selected || submitting}
              placeholder="you@example.com"
              required
            />
          </div>
        ) : (
          <>
            {/* WEBHOOK BROKERS: Username + Password fields */}
            <div>
              <label className="form-label">
                {selectedBroker ? `Username at ${selectedBroker.name}` : "Username"}
              </label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!selected || submitting}
                required
              />
            </div>

            <div>
              <label className="form-label">
                {selectedBroker
                  ? `Password for ${selectedBroker.name}`
                  : "Password"}
              </label>
              <div className="password-wrapper" style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  className="form-input"
                  value={password}
                  onChange={handlePasswordChange}
                  onFocus={handlePasswordFocus}
                  placeholder={passwordPlaceholder}
                  disabled={!selected || submitting}
                  autoComplete="new-password"
                  required
                />
                <img
                  src={showPw ? "/icons/hide.png" : "/icons/show.png"}
                  alt={showPw ? "Hide password" : "Show password"}
                  onClick={() => !submitting && setShowPw((s) => !s)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "24px",
                    height: "24px",
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: !selected || submitting ? 0.5 : 1,
                  }}
                />
              </div>
            </div>

            <div>
              <label className="form-label">
                {selectedBroker
                  ? `Confirm password for ${selectedBroker.name}`
                  : "Confirm password"}
              </label>
              <div className="password-wrapper" style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  className="form-input"
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  onFocus={handlePasswordFocus}
                  placeholder={confirmPasswordPlaceholder}
                  disabled={!selected || submitting}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
          </>
        )}

        <button type="submit" disabled={!canSubmit} className="btn-primary">
          {submitting
            ? isAlpacaBroker
              ? "Looking up account…"
              : "Verifying with broker…"
            : isAlpacaBroker
              ? "Find My Account"
              : "Save and Continue"}
        </button>

        {error && <p className="form-error">{error}</p>}

        {!isAlpacaBroker && failCount > 0 && failCount < MAX_FAILS && (
          <p
            style={{
              textAlign: "center",
              fontSize: "0.85rem",
              color: failCount >= 7 ? "#dc2626" : "#f59e0b",
              fontWeight: 600,
              marginTop: 8,
            }}
          >
            {failCount >= 7
              ? `⚠️ Warning: ${MAX_FAILS - failCount} attempt${MAX_FAILS - failCount !== 1 ? "s" : ""} remaining before your account is locked.`
              : `${failCount} failed verification attempt${failCount !== 1 ? "s" : ""}.`}
          </p>
        )}
      </form>

      {/* --- Footer --- */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={submitting}
          className="btn-secondary"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
