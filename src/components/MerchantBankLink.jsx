// src/components/MerchantBankLink.jsx
// Plaid Link integration for merchant bank account connection.
// Uses Plaid Link script (no react-plaid-link npm package needed).

import React, { useEffect, useState, useCallback } from "react";
import { apiPost } from "../api.js";

// ── Styles ──
const STYLES = {
  container: {
    background: "#fff",
    borderRadius: 12,
    padding: "20px",
    border: "1px solid #e5e7eb",
    marginBottom: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#111827",
    margin: 0,
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "#6b7280",
    margin: "4px 0 0",
  },
  connectedCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
  },
  bankIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "#dcfce7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.2rem",
  },
  bankName: {
    fontWeight: 600,
    fontSize: "0.95rem",
    color: "#111827",
  },
  bankMask: {
    fontSize: "0.85rem",
    color: "#6b7280",
  },
  statusBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  connectBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "12px 20px",
    background: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  reconnectBtn: {
    padding: "6px 14px",
    background: "transparent",
    color: "#3b82f6",
    border: "1px solid #3b82f6",
    borderRadius: 8,
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    color: "#ef4444",
    fontSize: "0.85rem",
    marginTop: 8,
    padding: "8px 12px",
    background: "#fef2f2",
    borderRadius: 8,
  },
  loading: {
    textAlign: "center",
    padding: 20,
    color: "#6b7280",
    fontSize: "0.9rem",
  },
};

// ── Load Plaid Link script once ──
let plaidScriptLoaded = false;
function loadPlaidScript() {
  return new Promise((resolve, reject) => {
    if (plaidScriptLoaded || window.Plaid) {
      plaidScriptLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload = () => {
      plaidScriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Plaid Link script"));
    document.head.appendChild(script);
  });
}

export default function MerchantBankLink({ merchantId, onConnected }) {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [bankInfo, setBankInfo] = useState(null); // existing connection
  const [fundingMethod, setFundingMethod] = useState("manual_ach");

  // ── Check existing connection ──
  useEffect(() => {
    if (!merchantId) return;

    (async () => {
      try {
        setLoading(true);
        // Fetch merchant details to check funding_method
        const resp = await apiPost("get_merchant.php", { merchant_id: merchantId });
        if (resp?.success && resp?.merchant) {
          setFundingMethod(resp.merchant.funding_method || "manual_ach");
        }

        // Check for existing Plaid connection
        const plaidResp = await apiPost("plaid-bank-status.php", { merchant_id: merchantId });
        if (plaidResp?.success && plaidResp?.bank) {
          setBankInfo(plaidResp.bank);
        }
      } catch (err) {
        // No connection yet — that's fine
        console.log("[MerchantBankLink] No existing connection:", err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [merchantId]);

  // ── Open Plaid Link ──
  const handleConnect = useCallback(async () => {
    if (!merchantId) return;
    setError("");
    setConnecting(true);

    try {
      // 1. Load Plaid script
      await loadPlaidScript();

      // 2. Get link token from backend
      const tokenResp = await apiPost("plaid-link-token.php", { merchant_id: merchantId });
      if (!tokenResp?.success || !tokenResp?.link_token) {
        throw new Error(tokenResp?.error || "Failed to get link token");
      }

      // 3. Open Plaid Link
      const handler = window.Plaid.create({
        token: tokenResp.link_token,

        onSuccess: async (publicToken, metadata) => {
          try {
            const account = metadata.accounts?.[0] || {};
            const institution = metadata.institution || {};

            // 4. Exchange token via backend
            const exchangeResp = await apiPost("plaid-exchange-token.php", {
              merchant_id: merchantId,
              public_token: publicToken,
              account_id: account.id || "",
              account_name: account.name || "",
              account_mask: account.mask || "",
              institution_id: institution.institution_id || "",
              institution_name: institution.name || "",
            });

            if (!exchangeResp?.success) {
              throw new Error(exchangeResp?.error || "Failed to link bank account");
            }

            // Update local state
            setBankInfo({
              institution_name: institution.name || "Bank",
              account_mask: account.mask || "****",
              account_name: account.name || "Checking",
              status: "active",
            });
            setFundingMethod("plaid");

            // Notify parent
            if (onConnected) onConnected(exchangeResp);
          } catch (err) {
            setError(err.message);
          } finally {
            setConnecting(false);
          }
        },

        onExit: (err) => {
          setConnecting(false);
          if (err) {
            console.warn("[MerchantBankLink] Link exit error:", err);
            setError(err.display_message || "Bank connection was cancelled.");
          }
        },

        onEvent: (eventName) => {
          console.log("[MerchantBankLink] Plaid event:", eventName);
        },
      });

      handler.open();
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  }, [merchantId, onConnected]);

  // ── Render ──

  if (!merchantId) return null;

  if (loading) {
    return <div style={STYLES.loading}>Checking bank connection...</div>;
  }

  return (
    <div style={STYLES.container}>
      <div style={STYLES.header}>
        <div>
          <h3 style={STYLES.title}>🏦 Bank Connection</h3>
          <p style={STYLES.subtitle}>
            {bankInfo
              ? "Connected for automatic ACH funding"
              : "Connect your bank for automatic sweep funding"}
          </p>
        </div>
        {bankInfo && (
          <span
            style={{
              ...STYLES.statusBadge,
              background: bankInfo.status === "active" ? "#dcfce7" : "#fef3c7",
              color: bankInfo.status === "active" ? "#166534" : "#92400e",
            }}
          >
            {bankInfo.status === "active" ? "✓ Active" : bankInfo.status}
          </span>
        )}
      </div>

      {bankInfo ? (
        <>
          {/* Connected state */}
          <div style={STYLES.connectedCard}>
            <div style={STYLES.bankIcon}>🏦</div>
            <div style={{ flex: 1 }}>
              <div style={STYLES.bankName}>{bankInfo.institution_name || "Bank"}</div>
              <div style={STYLES.bankMask}>
                {bankInfo.account_name || "Account"} •••• {bankInfo.account_mask || "****"}
              </div>
            </div>
            <button
              style={STYLES.reconnectBtn}
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting..." : "Reconnect"}
            </button>
          </div>

          {/* Funding method indicator */}
          <div
            style={{
              marginTop: 10,
              fontSize: "0.8rem",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: fundingMethod === "plaid" ? "#22c55e" : "#f59e0b",
                display: "inline-block",
              }}
            />
            Funding method:{" "}
            <strong>{fundingMethod === "plaid" ? "Automatic (Plaid)" : "Manual ACH"}</strong>
          </div>
        </>
      ) : (
        <>
          {/* Not connected state */}
          <button
            style={{
              ...STYLES.connectBtn,
              opacity: connecting ? 0.7 : 1,
            }}
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              "Opening bank connection..."
            ) : (
              <>🔗 Connect Bank Account</>
            )}
          </button>

          <p
            style={{
              fontSize: "0.8rem",
              color: "#9ca3af",
              marginTop: 10,
              textAlign: "center",
            }}
          >
            Securely connect via Plaid. Your credentials are never shared.
          </p>
        </>
      )}

      {error && <div style={STYLES.error}>{error}</div>}
    </div>
  );
}
