// src/pages/Wallet.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import { CreditCard, BarChart2, RefreshCw } from "lucide-react";
import SharePointsSheet from "../components/SharePointsSheet.jsx"; // ✅ NEW

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isShareOpen, setIsShareOpen] = useState(false); // ✅ NEW
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (!data || !data.success) {
          if (mounted) {
            setError(data?.error || "Failed to load wallet.");
            setLoading(false);
          }
          return;
        }

        if (mounted) {
          setWallet(data.wallet ?? null);
          setLoading(false);
        }

        // Sync to localStorage
        try {
          if (data.wallet?.points != null)
            localStorage.setItem(
              "points",
              String(parseInt(data.wallet.points, 10) || 0)
            );
          if (data.wallet?.cash_balance != null)
            localStorage.setItem(
              "cashBalance",
              Number(data.wallet.cash_balance).toFixed(2)
            );
          if (typeof data.wallet?.portfolio_value !== "undefined")
            localStorage.setItem(
              "portfolio_value",
              Number(data.wallet.portfolio_value).toFixed(2)
            );
          if (typeof data.wallet?.sweep_percentage !== "undefined")
            localStorage.setItem(
              "sweep_percentage",
              String(data.wallet.sweep_percentage)
            );
          if (typeof data.wallet?.broker !== "undefined")
            localStorage.setItem("broker", String(data.wallet.broker));
          console.log(
            "[Wallet] successful sync to localStorage item broker:",
            localStorage.getItem("broker")
          );
          console.log(
            "[Wallet] successful sync to localStorage with wallet.broker:",
            data.wallet?.broker
          );
        } catch (e) {
          console.warn("[Wallet] failed to sync to localStorage", e);
        }
      } catch (err) {
        console.error("Wallet fetch error:", err);
        if (mounted) {
          setError("Network error while fetching wallet.");
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [memberId]);

  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  const formatPoints = (val) =>
    (parseInt(val, 10) || 0).toLocaleString("en-US");

  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("get-wallet.php", { member_id: memberId });
      if (!data || !data.success) {
        setError(data?.error || "Failed to refresh wallet.");
      } else {
        setWallet(data.wallet ?? null);
      }
    } catch (e) {
      console.error("[Wallet] refresh failed", e);
      setError("Network error while refreshing wallet.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="wallet-container">
        <h2 className="wallet-heading">Wallet</h2>
        <div className="card card--compact" style={{ textAlign: "center" }}>
          <p className="caption">Loading wallet…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wallet-container">
        <h2 className="wallet-heading">Wallet</h2>
        <div className="card card--muted">
          <p className="form-error">{error}</p>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <button className="btn-primary" onClick={handleRefresh}>
              Retry
            </button>
            <button
              className="btn-secondary"
              onClick={() => navigate("/login")}
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="wallet-container">
        <h2 className="wallet-heading">Wallet</h2>
        <p className="caption">No wallet data available.</p>
      </div>
    );
  }

  // --- Determine broker status ---
  const notLinked =
    !wallet.broker ||
    wallet.broker === "Not linked" ||
    wallet.broker === "unlinked";

  const points = parseInt(wallet.points || 0, 10);
  const baseCash = Number(wallet.cash_balance || 0);
  const conversionRate = Number(wallet.conversion_rate || 0);
  const portfolioValue = Number(wallet.portfolio_value || 0);
  const sweepPct = wallet.sweep_percentage ?? null;
  const merchantName = wallet.merchant_name || "Merchant";

  const effectiveCashBalance =
    baseCash + (conversionRate > 0 ? points * conversionRate : 0);

  // ✅ Social share stats: focus on the points → $ portion
  const sharePoints = points > 0 ? points : 0;
  const shareCashValue =
    conversionRate > 0 ? sharePoints * conversionRate : 0;

  return (
    <div className="wallet-container">
      <h2 className="page-title" style={{ margin: 0 }}>
        Stock-Backed Rewards
      </h2>
      <p className="page-deck" style={{ marginTop: 8 }}>
        Available Points & Cash Value
      </p>

      {/* --- Summary Card --- */}
      <div className="card" style={{ marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: "#f9fafb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CreditCard size={24} />
            </div>
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                Available Cash
              </div>
              <div className="caption">Spendable balance</div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="wallet-cash" style={{ margin: 0 }}>
              {formatDollars(effectiveCashBalance)}
            </div>
            <div className="caption" style={{ marginTop: 6 }}>
              Points from <strong>{merchantName}</strong>:{" "}
              <strong>{formatPoints(points)}</strong>
            </div>
            {sweepPct !== null && (
              <div className="caption" style={{ marginTop: 4 }}>
                Sweep: {Number(sweepPct)}%
              </div>
            )}
          </div>
        </div>

        {/* --- Action Buttons --- */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 12,
            justifyContent: "center",
          }}
        >
          <button
            className={`btn-primary ${notLinked ? "btn-disabled" : ""}`}
            onClick={() => !notLinked && navigate("/stock-picker")}
            disabled={notLinked}
            style={{
              opacity: notLinked ? 0.6 : 1,
              cursor: notLinked ? "not-allowed" : "pointer",
            }}
          >
            Convert & Invest
          </button>

          <button
            className={notLinked ? "btn-primary" : "btn-secondary"}
            onClick={() => navigate("/select-broker")}
          >
            {notLinked
              ? "Link Broker"
              : `Active Broker: ${wallet.broker || "Unknown"}`}
          </button>
        </div>

        {/* ✅ Social actions under the main wallet actions */}
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: "100%", marginBottom: 6 }}
            onClick={() => setIsShareOpen(true)}
            disabled={sharePoints <= 0}
          >
            Share my investment
          </button>
          <button
            type="button"
            className="btn-tertiary"
            style={{ width: "100%", fontSize: "0.85rem" }}
            onClick={() => navigate("/social")}
          >
            View community feed
          </button>
        </div>
      </div>

      {/* --- Portfolio Section --- */}
      <div className="card card--accent" style={{ marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: "#f9fafb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BarChart2 size={24} />
            </div>
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                Portfolio Value
              </div>
              <div className="caption">Market value of investments</div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="wallet-portfolio" style={{ margin: 0 }}>
              {formatDollars(portfolioValue)}
            </div>
            <div className="caption" style={{ marginTop: 6 }}>
              Updated when trades settle
            </div>
          </div>
        </div>

        {/* --- Navigation Buttons --- */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 12,
            justifyContent: "flex-end",
          }}
        >
          <button
            className="btn-secondary"
            onClick={() => navigate("/portfolio")}
          >
            View Portfolio
          </button>
          <button
            className="btn-secondary"
            onClick={() => navigate("/transactions")}
          >
            View Transactions
          </button>
        </div>
      </div>

      {/* --- Sweep CTA --- */}
      <div style={{ marginTop: 14 }}>
        {wallet.election_type === "monthly" ? (
          <button
            type="button"
            onClick={() => navigate("/election")}
            className="btn-gold"
          >
            You are a Monthly Sweep subscriber
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/election")}
            className="btn-gold"
          >
            Enroll in Monthly Sweep subscription
          </button>
        )}
      </div>

      {/* --- Footer --- */}
      <p className="wallet-note" style={{ marginTop: 12 }}>
        Investment portfolio reflects shares purchased through the StockLoyal
        app only.{" "}
        {wallet.broker && wallet.broker_url && (
          <>
            To see your full portfolio at {wallet.broker}, click{" "}
            <a
              href={wallet.broker_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              here
            </a>
            .
          </>
        )}
      </p>

      <button
        type="button"
        onClick={handleRefresh}
        className="refresh-btn"
        title="Refresh"
        style={{ width: "auto", padding: "0.4rem 0.6rem" }}
      >
        <RefreshCw
          size={16}
          style={{ verticalAlign: "middle", marginRight: 6 }}
        />
        Refresh
      </button>

      <p className="caption" style={{ marginTop: 12 }}>
        StockLoyal Member ID: {wallet.member_id}
      </p>

      {/* ✅ Social share bottom sheet */}
      <SharePointsSheet
        open={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        memberId={memberId}
        pointsUsed={sharePoints}
        cashValue={shareCashValue}
        primaryTicker={null} // later: pass real tickers from last order
        tickers={[]}
      />
    </div>
  );
}
