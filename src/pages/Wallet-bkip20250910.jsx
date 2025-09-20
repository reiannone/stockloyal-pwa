// src/pages/Wallet.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config/api";
import { useTheme } from "../context/ThemeContext";
import Footer from "../components/Footer"; // ✅ add footer

function Wallet() {
  const { theme } = useTheme(); // ✅ get active theme
  const [wallet, setWallet] = useState(null);
  const [brokerCreds, setBrokerCreds] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      return;
    }

    async function fetchWallet() {
      try {
        const resp = await fetch(`${API_BASE}/get-wallet.php?memberId=${memberId}`);
        const data = await resp.json();

        if (!resp.ok || data?.success === false) {
          setError(data?.error || "Failed to load wallet.");
          return;
        }

        setWallet(data.wallet);
        setBrokerCreds(data.broker_credentials || null);
      } catch (err) {
        console.error("Wallet fetch error:", err);
        setError("Network error while fetching wallet.");
      }
    }

    fetchWallet();
  }, [memberId]);

  // ✅ Render content inside the scrollable area of the iPhone frame
  return (
    <>
      <div
        className="iphone-content p-6 pb-24" // pb-24 gives room so footer doesn't overlap
        style={{ background: theme.background, color: theme.text }}
      >
        <h2 className="text-2xl font-semibold mb-4" style={{ color: theme.primary }}>
          Wallet
        </h2>

        {error ? (
          <p>{error}</p>
        ) : !wallet ? (
          <p>Loading your wallet...</p>
        ) : (
          <>
            <div className="mb-4 space-y-1">
              <p><strong>Member ID:</strong> {wallet.member_id}</p>
              <p><strong>Broker:</strong> {wallet.broker || "Not linked"}</p>
              <p><strong>Points:</strong> {wallet.points}</p>
              <p><strong>Cash Balance:</strong> ${wallet.cash_balance}</p>
              <p><strong>Portfolio Value:</strong> ${wallet.portfolio_value}</p>
              <p><strong>Investment Style:</strong> {wallet.election_type || "Not selected"}</p>
            </div>

            {brokerCreds &&
              wallet.broker &&
              wallet.broker !== "Not linked" &&
              wallet.broker !== "unlinked" && (
                <div className="mb-4 space-y-1">
                  <h3 className="text-xl font-semibold" style={{ color: theme.primary }}>
                    Linked Broker Credentials
                  </h3>
                  <p><strong>Broker:</strong> {brokerCreds.broker}</p>
                  <p><strong>Username:</strong> {brokerCreds.username}</p>
                  <p className="text-gray-500 text-sm">(Password is stored securely and not shown)</p>
                </div>
              )}

            {!wallet.broker || wallet.broker === "Not linked" || wallet.broker === "unlinked" ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => navigate("/select-broker")}
                  className="px-4 py-2 rounded"
                  style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
                >
                  Link Broker
                </button>
              </div>
            ) : null}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate("/election")}
                className="px-4 py-2 rounded"
                style={{ backgroundColor: theme.secondary, color: theme.textOnPrimary }}
              >
                Change Investment Style
              </button>
            </div>

            <p className="mt-6">
              Once you’ve converted your loyalty points, your fractional shares will appear here.
            </p>
          </>
        )}
      </div>

      {/* ✅ Stays at the bottom of the iPhone frame */}
      <Footer />
    </>
  );
}

export default Wallet;
