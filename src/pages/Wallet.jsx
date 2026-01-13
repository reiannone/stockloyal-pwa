// src/pages/Wallet.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import {
  CreditCard,
  BarChart2,
  RefreshCw,
  Share2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import SharePointsSheet from "../components/SharePointsSheet.jsx";

export default function Wallet() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Merchant program blocking popup
  const [merchantProgramError, setMerchantProgramError] = useState(false);

  // Warning popup before redirect
  const [warning, setWarning] = useState({
    open: false,
    title: "",
    message: "",
    cta: "",
    route: "",
  });

  // Social share
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  // Listen for footer Share button
  useEffect(() => {
    function openShareFromFooter() {
      setIsShareOpen(true);
    }
    window.addEventListener("open-share-sheet", openShareFromFooter);
    return () => window.removeEventListener("open-share-sheet", openShareFromFooter);
  }, []);

  // Fetch last order
  useEffect(() => {
    if (!memberId) return;
    (async () => {
      try {
        const data = await apiPost("get_last_order.php", { member_id: memberId });
        if (data?.success && data.order) setLastOrder(data.order);
      } catch (err) {
        console.error("[Wallet] get_last_order error:", err);
      }
    })();
  }, [memberId]);

  // --- Gating helpers ---
  const isBrokerMissing = (w) => {
    const b = String(w?.broker ?? "").trim();
    return !b || b.toLowerCase() === "not linked" || b.toLowerCase() === "unlinked";
  };

  const isElectionMissing = (w) => {
    const e = String(w?.election_type ?? "").trim();
    return !e;
  };

  const isMerchantMissing = (w) => {
    const m = String(w?.merchant_id ?? "").trim();
    return !m || m.toLowerCase() === "null" || m.toLowerCase() === "undefined";
  };

  const openWarningThenRedirect = ({ title, message, cta, route }) => {
    setWarning({
      open: true,
      title,
      message,
      cta,
      route,
    });
  };

  const runPostLoadChecks = (w) => {
    // 1) merchant program is REQUIRED; block with red-X message
    if (isMerchantMissing(w)) {
      setMerchantProgramError(true);
      return;
    }

    // 2) broker required; warn then send to SelectBroker
    if (isBrokerMissing(w)) {
      openWarningThenRedirect({
        title: "Broker Required",
        message:
          "Before you can invest your rewards, you must select/link your brokerage.",
        cta: "Go to Select Broker",
        route: "/select-broker",
      });
      return;
    }

    // 3) investment election required; warn then send to Election
    if (isElectionMissing(w)) {
      openWarningThenRedirect({
        title: "Investment Election Required",
        message:
          "You need to choose how your rewards will be invested (your investment election) before continuing.",
        cta: "Go to Election",
        route: "/election",
      });
      return;
    }
  };

  // --- Fetch wallet ---
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
      setMerchantProgramError(false);
      setWarning((w) => ({ ...w, open: false }));

      try {
        const data = await apiPost("get-wallet.php", { member_id: memberId });

        if (!data?.success) {
          if (!mounted) return;
          setError(data?.error || "Failed to load wallet.");
          setLoading(false);
          return;
        }

        if (!mounted) return;

        const w = data.wallet ?? null;
        setWallet(w);
        setLoading(false);

        // Sync key values to localStorage
        try {
          if (w?.points != null) localStorage.setItem("points", String(parseInt(w.points, 10) || 0));
          if (w?.cash_balance != null) localStorage.setItem("cashBalance", Number(w.cash_balance || 0).toFixed(2));
          if (typeof w?.portfolio_value !== "undefined") localStorage.setItem("portfolio_value", Number(w.portfolio_value || 0).toFixed(2));
          if (typeof w?.sweep_percentage !== "undefined") localStorage.setItem("sweep_percentage", String(w.sweep_percentage ?? ""));
          if (typeof w?.broker !== "undefined") localStorage.setItem("broker", String(w.broker || ""));
          if (typeof w?.member_timezone !== "undefined") localStorage.setItem("memberTimezone", String(w.member_timezone || ""));
          if (typeof w?.merchant_name !== "undefined") localStorage.setItem("merchantName", String(w.merchant_name || ""));
          if (typeof w?.merchant_id !== "undefined") localStorage.setItem("merchantId", String(w.merchant_id || ""));
          if (typeof w?.election_type !== "undefined") localStorage.setItem("election_type", String(w.election_type || ""));

          window.dispatchEvent(new Event("member-updated"));
        } catch (e) {
          console.warn("[Wallet] localStorage sync failed", e);
        }

        // ✅ checks AFTER load
        runPostLoadChecks(w);
      } catch (err) {
        console.error("[Wallet] wallet fetch error:", err);
        if (!mounted) return;
        setError("Network error while fetching wallet.");
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    setMerchantProgramError(false);
    setWarning((w) => ({ ...w, open: false }));

    try {
      const data = await apiPost("get-wallet.php", { member_id: memberId });
      if (!data?.success) {
        setError(data?.error || "Failed to refresh wallet.");
      } else {
        const w = data.wallet ?? null;
        setWallet(w);

        try {
          if (w?.points != null) localStorage.setItem("points", String(parseInt(w.points, 10) || 0));
          if (w?.cash_balance != null) localStorage.setItem("cashBalance", Number(w.cash_balance || 0).toFixed(2));
          if (typeof w?.broker !== "undefined") localStorage.setItem("broker", String(w.broker || ""));
          if (typeof w?.member_timezone !== "undefined") localStorage.setItem("memberTimezone", String(w.member_timezone || ""));
          if (typeof w?.merchant_name !== "undefined") localStorage.setItem("merchantName", String(w.merchant_name || ""));
          if (typeof w?.merchant_id !== "undefined") localStorage.setItem("merchantId", String(w.merchant_id || ""));
          if (typeof w?.election_type !== "undefined") localStorage.setItem("election_type", String(w.election_type || ""));
          window.dispatchEvent(new Event("member-updated"));
        } catch (e) {
          console.warn("[Wallet] localStorage sync failed on refresh", e);
        }

        runPostLoadChecks(w);
      }
    } catch (e) {
      console.error("[Wallet] refresh failed", e);
      setError("Network error while refreshing wallet.");
    } finally {
      setLoading(false);
    }
  };

  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  const formatPoints = (val) => (parseInt(val, 10) || 0).toLocaleString("en-US");

  // --- Render states ---
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
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
            <button className="btn-primary" onClick={handleRefresh}>Retry</button>
            <button className="btn-secondary" onClick={() => navigate("/login")}>Sign In</button>
          </div>
        </div>
      </div>
    );
  }

  // Merchant program invalid/missing: blocking message with red X
  if (merchantProgramError) {
    return (
      <div className="wallet-container">
        <h2 className="wallet-heading">Wallet</h2>

        <div
          className="card"
          style={{
            border: "2px solid #ef4444",
            background: "#fff5f5",
            textAlign: "center",
            padding: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <XCircle size={44} color="#ef4444" />
          </div>

          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#991b1b" }}>
            You must have a valid merchant rewards loyalty program.
          </div>
          <div style={{ marginTop: 6, color: "#991b1b", fontWeight: 600 }}>
            Speak to your rewards administrator.
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
            <button className="btn-primary" onClick={() => navigate("/login")}>Sign In</button>
            <button className="btn-secondary" onClick={handleRefresh}>Retry</button>
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

  const notLinked = isBrokerMissing(wallet);

  const points = parseInt(wallet.points || 0, 10);
  const baseCash = Number(wallet.cash_balance || 0);
  const conversionRate = Number(wallet.conversion_rate || 0);
  const portfolioValue = Number(wallet.portfolio_value || 0);
  const sweepPct = wallet.sweep_percentage ?? null;
  const merchantName = wallet.merchant_name || "Merchant";

  // ✅ Use cash_balance from database directly (already converted)
  const effectiveCashBalance = baseCash;

  return (
    <div className="wallet-container">
      {/* ✅ Warning modal overlay (before redirect) */}
      {warning.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 460,
              width: "100%",
              border: "2px solid #f59e0b",
              background: "#fffaf0",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <AlertTriangle size={34} color="#f59e0b" style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{warning.title}</div>
                <div style={{ marginTop: 6, color: "#7c2d12", fontWeight: 600 }}>
                  {warning.message}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setWarning((w) => ({ ...w, open: false }))}
              >
                Not now
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  const route = warning.route;
                  setWarning((w) => ({ ...w, open: false }));
                  navigate(route, { replace: true });
                }}
              >
                {warning.cta || "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="page-title" style={{ margin: 0 }}>
        Stock-Backed Rewards
      </h2>
      <p className="page-deck" style={{ marginTop: 8 }}>
        Available Points & Cash Value
      </p>

      {/* --- Summary Card --- */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
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
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>Available Cash</div>
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
            {localStorage.getItem("memberTier") && (
              <div className="caption" style={{ marginTop: 4 }}>
                Tier: <strong>{localStorage.getItem("memberTier")}</strong>
              </div>
            )}
            {sweepPct !== null && (
              <div className="caption" style={{ marginTop: 4 }}>Sweep: {Number(sweepPct)}%</div>
            )}
          </div>
        </div>

        {/* --- Action Buttons --- */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "center" }}>
          <button
            className={`btn-primary ${notLinked ? "btn-disabled" : ""}`}
            onClick={() => !notLinked && navigate("/stock-picker")}
            disabled={notLinked}
            style={{ opacity: notLinked ? 0.6 : 1, cursor: notLinked ? "not-allowed" : "pointer" }}
          >
            Convert & Invest
          </button>

          <button
            className={notLinked ? "btn-primary" : "btn-secondary"}
            onClick={() => navigate("/select-broker")}
          >
            {notLinked ? "Link Broker" : `Active Broker: ${wallet.broker || "Unknown"}`}
          </button>
        </div>
      </div>

      {/* --- Portfolio Section --- */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
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
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>Portfolio Value</div>
              <div className="caption">Market value of investments</div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="wallet-portfolio" style={{ margin: 0 }}>
              {formatDollars(portfolioValue)}
            </div>
            <div className="caption" style={{ marginTop: 6 }}>Updated when trades settle</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={() => navigate("/portfolio")}>View Portfolio</button>
          <button className="btn-secondary" onClick={() => navigate("/transactions")}>View Transactions</button>
        </div>
      </div>

      {/* --- Social Media Share Card --- */}
      <div className="card card--accent" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#f9fafb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Share2 size={20} />
          </div>

          <div>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Share Your Investment</h3>
            <p className="caption" style={{ marginTop: 2 }}>
              Show friends how your loyalty points became real stock ownership.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "space-between" }}>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1 }}
            onClick={() => setIsShareOpen(true)}
            disabled={!lastOrder}
          >
            Share
          </button>

          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => navigate("/social")}>
            Community Feed
          </button>
        </div>
      </div>

      {/* --- Election CTA --- */}
      <div style={{ marginTop: 14 }}>
        {wallet.election_type === "monthly" ? (
          <button type="button" onClick={() => navigate("/election")} className="btn-gold">
            You are a Monthly Sweep subscriber
          </button>
        ) : (
          <button type="button" onClick={() => navigate("/election")} className="btn-gold">
            Enroll in Monthly Sweep subscription
          </button>
        )}
      </div>

      <p className="wallet-note" style={{ marginTop: 12 }}>
        Investment portfolio reflects shares purchased through the StockLoyal app only.{" "}
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
        <RefreshCw size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
        Refresh
      </button>

      <SharePointsSheet
        open={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        memberId={memberId}
        pointsUsed={lastOrder?.points_used || 0}
        cashValue={lastOrder?.cash_value || 0}
        primaryTicker={lastOrder?.primary_ticker || null}
        tickers={lastOrder?.symbols ? lastOrder.symbols.split(",").map((t) => t.trim()) : []}
        merchantName={lastOrder?.merchant_name || merchantName}
        broker={lastOrder?.broker || wallet.broker || "your broker"}
      />
    </div>
  );
}
