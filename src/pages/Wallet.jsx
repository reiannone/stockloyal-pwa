// src/pages/Wallet.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import {
  CreditCard,
  BarChart2,
  RefreshCw,
  XCircle,
  AlertTriangle,
  ShoppingBasket,
  ClipboardCheck,
} from "lucide-react";
import { useBasket } from "../context/BasketContext";

// Add slide-down animation
const slideDownAnimation = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;

// Inject animation styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = slideDownAnimation;
  if (!document.head.querySelector('style[data-wallet-animations]')) {
    styleSheet.setAttribute('data-wallet-animations', 'true');
    document.head.appendChild(styleSheet);
  }
}

export default function Wallet() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");
  const { basket } = useBasket();

  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Portfolio update notification
  const [portfolioUpdated, setPortfolioUpdated] = useState(false);
  const [newPortfolioValue, setNewPortfolioValue] = useState(null);
  const [portfolioLastUpdated, setPortfolioLastUpdated] = useState(null);
  const [lastPointsSync, setLastPointsSync] = useState(null);

  // Alpaca live account data
  const [alpacaAccount, setAlpacaAccount] = useState(null);
  const isAlpaca = (localStorage.getItem("broker") || "").toLowerCase() === "alpaca";

  // Merchant sync notification
  const [merchantSynced, setMerchantSynced] = useState(false);
  const [merchantSyncInfo, setMerchantSyncInfo] = useState(null);

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

  const [pendingCount, setPendingCount] = useState(0);

  // My Basket count (loaded independently so badge shows without visiting StockPicker)
  const [myBasketCount, setMyBasketCount] = useState(0);

  // ✅ Load My Basket count so badge shows without visiting StockPicker first
  useEffect(() => {
    if (!memberId) return;
    (async () => {
      try {
        const data = await apiPost("my-picks.php", { member_id: memberId, limit: 50 });
        if (data?.success && Array.isArray(data.rows)) {
          setMyBasketCount(data.rows.length);
        }
      } catch (err) {
        console.error("[Wallet] My Basket count error:", err);
      }
    })();
  }, [memberId]);

  // Fetch last order + pending order count
  useEffect(() => {
    if (!memberId) return;
    (async () => {
      // ✅ Fetch pending orders count
      try {
        const ordersData = await apiPost("get_order_history.php", { member_id: memberId });
        if (ordersData?.success && Array.isArray(ordersData.orders)) {
          const pending = ordersData.orders.filter((o) => {
            const s = (o.status || "").toLowerCase();
            return s === "pending" || s === "queued";
          });
          setPendingCount(pending.length);
        }
      } catch (err) {
        console.error("[Wallet] pending count error:", err);
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
    // Check wallet object first
    const walletMerchant = String(w?.merchant_id ?? "").trim();
    if (walletMerchant && walletMerchant.toLowerCase() !== "null" && walletMerchant.toLowerCase() !== "undefined") {
      return false; // Merchant found in wallet
    }
    
    // ✅ Fallback: Check localStorage (set by SplashScreen)
    const lsMerchant = String(localStorage.getItem("merchantId") ?? "").trim();
    if (lsMerchant && lsMerchant.toLowerCase() !== "null" && lsMerchant.toLowerCase() !== "undefined") {
      return false; // Merchant found in localStorage
    }
    
    return true; // No merchant found anywhere
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

        // ✅ Block access for blocked or closed accounts
        const memberStatus = (w?.member_status || "active").toLowerCase();
        if (memberStatus === "blocked" || memberStatus === "closed") {
          console.log("[Wallet] Account is", memberStatus, "— redirecting to login");
          localStorage.removeItem("memberId");
          localStorage.removeItem("memberEmail");
          setLoading(false);
          navigate("/login", {
            state: {
              error: memberStatus === "blocked"
                ? "Your account has been blocked. Please contact support."
                : "Your account has been closed. Please contact support.",
            },
          });
          return;
        }

        setWallet(w);
        setLoading(false);

        // Set last updated times using client-side clock (DB timestamps have ambiguous timezone)
        if (w?.updated_at) {
          setPortfolioLastUpdated(new Date().toISOString());
        }
        setLastPointsSync(new Date().toISOString());

        // Sync key values to localStorage
        try {
          if (w?.points != null) localStorage.setItem("points", String(parseInt(w.points, 10) || 0));
          if (w?.cash_balance != null) localStorage.setItem("cashBalance", Number(w.cash_balance || 0).toFixed(2));
          if (typeof w?.portfolio_value !== "undefined") localStorage.setItem("portfolio_value", Number(w.portfolio_value || 0).toFixed(2));
          if (typeof w?.sweep_percentage !== "undefined") localStorage.setItem("sweep_percentage", String(w.sweep_percentage ?? ""));
          if (typeof w?.broker !== "undefined") localStorage.setItem("broker", String(w.broker || ""));
          if (typeof w?.member_timezone !== "undefined") localStorage.setItem("memberTimezone", String(w.member_timezone || ""));
          if (typeof w?.election_type !== "undefined") localStorage.setItem("election_type", String(w.election_type || ""));
          if (typeof w?.member_tier !== "undefined") localStorage.setItem("memberTier", String(w.member_tier || ""));
          
          if (w?.merchant_name && String(w.merchant_name).trim()) {
            localStorage.setItem("merchantName", String(w.merchant_name).trim());
          }
          if (w?.merchant_id && String(w.merchant_id).trim()) {
            localStorage.setItem("merchantId", String(w.merchant_id).trim());
          }

          window.dispatchEvent(new Event("member-updated"));
        } catch (e) {
          console.warn("[Wallet] localStorage sync failed", e);
        }

        // ✅ Fetch full merchant data including sweep_day
        const walletMerchantId = w?.merchant_id || localStorage.getItem("merchantId");
        if (walletMerchantId) {
          try {
            const merchantData = await apiPost("get_merchant.php", { merchant_id: walletMerchantId });
            if (merchantData?.success && merchantData?.merchant) {
              const m = merchantData.merchant;
              console.log("[Wallet] Loaded merchant data:", m);
              
              // Store full merchant object
              localStorage.setItem("merchant", JSON.stringify(m));
              
              // Store individual values for easy access
              if (m.merchant_name) {
                localStorage.setItem("merchantName", m.merchant_name);
              }
              if (m.conversion_rate) {
                localStorage.setItem("conversion_rate", String(m.conversion_rate));
              }
              
              // ✅ Store sweep_day for StockPicker and Basket pages
              if (m.sweep_day !== undefined && m.sweep_day !== null) {
                localStorage.setItem("sweep_day", String(m.sweep_day));
                console.log("[Wallet] Stored sweep_day:", m.sweep_day);
              } else {
                localStorage.removeItem("sweep_day");
              }
            }
          } catch (err) {
            console.warn("[Wallet] Failed to fetch merchant data:", err);
          }
        }

        // ✅ checks AFTER load
        runPostLoadChecks(w);

        // ✅ Background: Fetch broker details from broker_master (default_order_type, etc.)
        (async () => {
          const brokerName = w?.broker || localStorage.getItem("broker");
          if (brokerName && brokerName.toLowerCase() !== "not linked") {
            try {
              const brokerData = await apiPost("get-brokers.php", {});
              if (brokerData?.success && Array.isArray(brokerData.brokers)) {
                const match = brokerData.brokers.find(
                  (b) => b.broker_name?.toLowerCase() === brokerName.toLowerCase()
                );
                if (match) {
                  if (match.default_order_type) {
                    localStorage.setItem("default_order_type", match.default_order_type);
                  }
                  console.log("[Wallet] Broker data loaded:", match.broker_name, "order_type:", match.default_order_type);
                }
              }
            } catch (err) {
              console.warn("[Wallet] Failed to fetch broker data:", err);
            }
          }
        })();

        // ✅ Background: Update portfolio value
        (async () => {
          try {
            const brokerName = (w?.broker || localStorage.getItem("broker") || "").toLowerCase();

            if (brokerName === "alpaca") {
              // ── Alpaca: fetch live account + positions from broker API ──
              const alpacaData = await apiPost("alpaca-get-portfolio.php", { member_id: memberId });
              if (alpacaData?.success) {
                setAlpacaAccount(alpacaData.account);

                const liveValue = alpacaData.account?.equity || alpacaData.portfolio_value || 0;

                // Update wallet state with live equity
                setWallet(prev => ({
                  ...prev,
                  portfolio_value: liveValue
                }));

                // Show notification if value changed from DB
                const dbValue = Number(w?.portfolio_value || 0);
                if (Math.abs(liveValue - dbValue) > 0.01) {
                  setNewPortfolioValue(liveValue);
                  setPortfolioUpdated(true);
                  setTimeout(() => setPortfolioUpdated(false), 5000);
                }

                localStorage.setItem("portfolio_value", Number(liveValue).toFixed(2));
                window.dispatchEvent(new Event("member-updated"));
                setPortfolioLastUpdated(new Date().toISOString());
              }
            } else {
              // ── Non-Alpaca: use legacy portfolio value updater ──
              const portfolioData = await apiPost("update-portfolio-value.php", { member_id: memberId });
              if (portfolioData?.success && portfolioData.value_changed) {
                setNewPortfolioValue(portfolioData.portfolio_value);
                setPortfolioUpdated(true);

                setWallet(prev => ({
                  ...prev,
                  portfolio_value: portfolioData.portfolio_value
                }));

                localStorage.setItem("portfolio_value", Number(portfolioData.portfolio_value || 0).toFixed(2));
                window.dispatchEvent(new Event("member-updated"));
                setPortfolioLastUpdated(new Date().toISOString());

                setTimeout(() => setPortfolioUpdated(false), 5000);
              }
            }
          } catch (err) {
            console.warn("[Wallet] Background portfolio update failed:", err);
          }
        })();

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
      // ✅ Step 1: Sync points & tier from merchant FIRST so DB has fresh values
      try {
        const syncData = await apiPost("request-member-sync.php", { member_id: memberId });
        if (syncData?.success) {
          setLastPointsSync(new Date().toISOString());

          if (syncData.points_changed || syncData.tier_changed) {
            console.log("[Wallet] Merchant sync (refresh) returned changes:", syncData);

            // Show notification
            setMerchantSyncInfo({
              pointsChanged: syncData.points_changed,
              tierChanged: syncData.tier_changed,
              newPoints: syncData.points,
              previousPoints: syncData.previous_points,
              newTier: syncData.member_tier,
              previousTier: syncData.previous_tier,
            });
            setMerchantSynced(true);
            setTimeout(() => setMerchantSynced(false), 5000);
          }
        }
      } catch (err) {
        console.warn("[Wallet] Merchant sync on refresh failed:", err);
      }

      // ✅ Step 2: Now fetch wallet with the freshly-synced DB values
      const data = await apiPost("get-wallet.php", { member_id: memberId });
      if (!data?.success) {
        setError(data?.error || "Failed to refresh wallet.");
      } else {
        const w = data.wallet ?? null;

        // ✅ Block access for blocked or closed accounts
        const memberStatus = (w?.member_status || "active").toLowerCase();
        if (memberStatus === "blocked" || memberStatus === "closed") {
          console.log("[Wallet] Account is", memberStatus, "— redirecting to login");
          localStorage.removeItem("memberId");
          localStorage.removeItem("memberEmail");
          setLoading(false);
          navigate("/login", {
            state: {
              error: memberStatus === "blocked"
                ? "Your account has been blocked. Please contact support."
                : "Your account has been closed. Please contact support.",
            },
          });
          return;
        }

        setWallet(w);

        try {
          if (w?.points != null) localStorage.setItem("points", String(parseInt(w.points, 10) || 0));
          if (w?.cash_balance != null) localStorage.setItem("cashBalance", Number(w.cash_balance || 0).toFixed(2));
          if (typeof w?.portfolio_value !== "undefined") localStorage.setItem("portfolio_value", Number(w.portfolio_value || 0).toFixed(2));
          if (typeof w?.broker !== "undefined") localStorage.setItem("broker", String(w.broker || ""));
          if (typeof w?.member_timezone !== "undefined") localStorage.setItem("memberTimezone", String(w.member_timezone || ""));
          if (typeof w?.election_type !== "undefined") localStorage.setItem("election_type", String(w.election_type || ""));
          if (typeof w?.member_tier !== "undefined") localStorage.setItem("memberTier", String(w.member_tier || ""));
          
          // ✅ Only update merchant values if wallet returns non-empty values
          if (w?.merchant_name && String(w.merchant_name).trim()) {
            localStorage.setItem("merchantName", String(w.merchant_name).trim());
          }
          if (w?.merchant_id && String(w.merchant_id).trim()) {
            localStorage.setItem("merchantId", String(w.merchant_id).trim());
          }
          
          window.dispatchEvent(new Event("member-updated"));
        } catch (e) {
          console.warn("[Wallet] localStorage sync failed on refresh", e);
        }

        // ✅ Fetch full merchant data including sweep_day
        const walletMerchantId = w?.merchant_id || localStorage.getItem("merchantId");
        if (walletMerchantId) {
          try {
            const merchantData = await apiPost("get_merchant.php", { merchant_id: walletMerchantId });
            if (merchantData?.success && merchantData?.merchant) {
              const m = merchantData.merchant;
              localStorage.setItem("merchant", JSON.stringify(m));
              if (m.merchant_name) localStorage.setItem("merchantName", m.merchant_name);
              if (m.conversion_rate) localStorage.setItem("conversion_rate", String(m.conversion_rate));
              if (m.sweep_day !== undefined && m.sweep_day !== null) {
                localStorage.setItem("sweep_day", String(m.sweep_day));
              } else {
                localStorage.removeItem("sweep_day");
              }
            }
          } catch (err) {
            console.warn("[Wallet] Failed to fetch merchant data on refresh:", err);
          }
        }

        runPostLoadChecks(w);

        // ✅ Background: Fetch broker details on refresh
        (async () => {
          const brokerName = w?.broker || localStorage.getItem("broker");
          if (brokerName && brokerName.toLowerCase() !== "not linked") {
            try {
              const brokerData = await apiPost("get-brokers.php", {});
              if (brokerData?.success && Array.isArray(brokerData.brokers)) {
                const match = brokerData.brokers.find(
                  (b) => b.broker_name?.toLowerCase() === brokerName.toLowerCase()
                );
                if (match?.default_order_type) {
                  localStorage.setItem("default_order_type", match.default_order_type);
                }
              }
            } catch (err) {
              console.warn("[Wallet] Failed to fetch broker data on refresh:", err);
            }
          }
        })();

        // ✅ Alpaca: refresh live account data
        if ((w?.broker || localStorage.getItem("broker") || "").toLowerCase() === "alpaca") {
          (async () => {
            try {
              const alpacaData = await apiPost("alpaca-get-portfolio.php", { member_id: memberId });
              if (alpacaData?.success) {
                setAlpacaAccount(alpacaData.account);
                const liveValue = alpacaData.account?.equity || alpacaData.portfolio_value || 0;
                setWallet(prev => ({ ...prev, portfolio_value: liveValue }));
                localStorage.setItem("portfolio_value", Number(liveValue).toFixed(2));
                window.dispatchEvent(new Event("member-updated"));
                setPortfolioLastUpdated(new Date().toISOString());
              }
            } catch (err) {
              console.warn("[Wallet] Alpaca refresh failed:", err);
            }
          })();
        }
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

  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return "Not yet updated";
    
    try {
      const date = new Date(timestamp);
      const memberTimezone = wallet?.member_timezone || localStorage.getItem("memberTimezone") || "America/New_York";
      
      // Format: "Jan 14, 2:30 PM EST"
      const formatted = date.toLocaleString("en-US", {
        timeZone: memberTimezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
      
      // Get timezone abbreviation
      const tzAbbr = date.toLocaleString("en-US", {
        timeZone: memberTimezone,
        timeZoneName: "short"
      }).split(' ').pop(); // Extract abbreviation like "EST", "PST", etc.
      
      return `Updated ${formatted} ${tzAbbr}`;
    } catch (e) {
      return "Recently updated";
    }
  };

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
  const merchantName = wallet.merchant_name || localStorage.getItem("merchantName") || "Merchant";

  // ✅ Calculate spendable balance: prefer DB cash_balance, but if it's 0/stale
  //    while points exist, recalculate from points × conversion_rate as fallback
  const effectiveCashBalance = (baseCash > 0 || points === 0)
    ? baseCash
    : points * conversionRate;

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

      {/* Portfolio Update Notification */}
      {portfolioUpdated && (
        <div
          style={{
            position: "fixed",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#10b981",
            color: "white",
            padding: "12px 24px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 12,
            maxWidth: "90%",
            animation: "slideDown 0.3s ease-out"
          }}
        >
          <RefreshCw size={20} />
          <div>
            <div style={{ fontWeight: 600 }}>Portfolio Value Updated</div>
            <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>
              New value: {formatDollars(newPortfolioValue)}
            </div>
          </div>
          <button
            onClick={() => setPortfolioUpdated(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              padding: 4,
              marginLeft: 8
            }}
          >
            <XCircle size={20} />
          </button>
        </div>
      )}

      {/* Merchant Sync Notification */}
      {merchantSynced && merchantSyncInfo && (
        <div
          style={{
            position: "fixed",
            top: portfolioUpdated ? 140 : 80,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#2563eb",
            color: "white",
            padding: "12px 24px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 12,
            maxWidth: "90%",
            animation: "slideDown 0.3s ease-out"
          }}
        >
          <RefreshCw size={20} />
          <div>
            <div style={{ fontWeight: 600 }}>Merchant Sync Updated</div>
            <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>
              {merchantSyncInfo.pointsChanged && (
                <span>Points: {formatPoints(merchantSyncInfo.previousPoints)} → {formatPoints(merchantSyncInfo.newPoints)}</span>
              )}
              {merchantSyncInfo.pointsChanged && merchantSyncInfo.tierChanged && <span> · </span>}
              {merchantSyncInfo.tierChanged && (
                <span>Tier: {merchantSyncInfo.previousTier || "—"} → {merchantSyncInfo.newTier}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setMerchantSynced(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              padding: 4,
              marginLeft: 8
            }}
          >
            <XCircle size={20} />
          </button>
        </div>
      )}

      <h2 className="page-title" style={{ margin: 0 }}>
        Stock-Backed Rewards Wallet
      </h2>
      <p className="page-deck" style={{ marginTop: 8 }}>
        My Available Points & Cash Value
      </p>

      {/* --- Summary Card --- */}
      <div className="card card--accent" style={{ marginTop: 12 }}>
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
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>Available Cash Value</div>
              <div className="caption">Spendable balance</div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="wallet-cash" style={{ margin: 0 }}>
              {formatDollars(effectiveCashBalance)}
            </div>
            <div style={{ fontSize: "0.95rem", marginTop: 6 }}>
              Points from {" "}
              <strong style={{ color: "#2563eb" }}>{merchantName}</strong> {" "}
              <strong>{formatPoints(points)}</strong>
            </div>
            {localStorage.getItem("memberTier") && (
              <div className="caption" style={{ marginTop: 4 }}>
                Tier: <strong>{localStorage.getItem("memberTier")}</strong>
              </div>
            )}
            {wallet.election_type === "monthly" && sweepPct !== null && (
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
            style={{
              opacity: notLinked ? 0.6 : 1,
              cursor: notLinked ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <ShoppingBasket size={18} /> Convert to Invest Basket
            {(basket?.length > 0 || myBasketCount > 0) && (
              <span style={{
                background: "#fff",
                color: "#2563eb",
                borderRadius: "9999px",
                padding: "1px 8px",
                fontSize: "0.7rem",
                fontWeight: 700,
                lineHeight: "1.4",
                minWidth: 20,
                textAlign: "center",
              }}>
                {basket?.length || myBasketCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* --- Portfolio Section (clickable → /portfolio) --- */}
      <div
        className="card"
        style={{ marginTop: 14, cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s" }}
        onClick={() => navigate("/portfolio")}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(59,130,246,0.12)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
      >
        {/* Top row: icon + title + total equity */}
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
              <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                {alpacaAccount ? "Brokerage Account" : "Portfolio Value"}
              </div>
              <div className="caption">
                {alpacaAccount
                  ? <>Live account at <strong style={{ color: "#2563eb" }}>Alpaca</strong></>
                  : <>Market value of investments held at{" "}
                      <strong style={{ color: "#2563eb" }}>{wallet.broker || localStorage.getItem("broker") || "your broker"}</strong>.
                      <br />Purchased through StockLoyal.
                    </>
                }
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div className="wallet-portfolio" style={{ margin: 0 }}>
              {formatDollars(alpacaAccount ? alpacaAccount.equity : portfolioValue)}
            </div>
            {alpacaAccount && (
              <div className="caption" style={{ marginTop: 2, fontWeight: 600 }}>
                Total Equity
              </div>
            )}
            <div className="caption" style={{ marginTop: 4 }}>
              {formatLastUpdated(portfolioLastUpdated)}
            </div>
            <div style={{ marginTop: 4, fontSize: "0.75rem", color: "#2563eb", fontWeight: 600 }}>
              View Portfolio ›
            </div>
          </div>
        </div>

      </div>

      {/* --- Quick Links Tile Grid --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          marginTop: 14,
        }}
      >
        {/* Trade Orders */}
        <div
          onClick={() => navigate("/transactions")}
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "14px 12px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            textAlign: "center",
            transition: "border-color 0.2s, box-shadow 0.2s",
            position: "relative",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(245,158,11,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ClipboardCheck size={20} color="#d97706" />
          </div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#111827" }}>Order Tracker</div>
          {pendingCount > 0 && (
            <span style={{
              background: "#fef3c7",
              color: "#92400e",
              border: "1px solid #f59e0b",
              borderRadius: "9999px",
              padding: "1px 8px",
              fontSize: "0.7rem",
              fontWeight: 700,
              lineHeight: "1.5",
            }}>
              {pendingCount} Pending
            </span>
          )}
        </div>

        {/* Transaction Ledger */}
        <div
          onClick={() => navigate("/ledger")}
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "14px 12px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            textAlign: "center",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(16,185,129,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CreditCard size={20} color="#059669" />
          </div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#111827" }}>Transactions</div>
        </div>
      </div>


      <p className="form-disclosure" style={{ marginTop: 12 }}>
        {alpacaAccount
          ? "Account data provided in real-time by Alpaca Securities LLC."
          : "Market prices are delayed 15 minutes."
        }
        {" "}Investment portfolio reflects shares purchased through the StockLoyal app only.
        {lastPointsSync && (<> Points last synced: {formatLastUpdated(lastPointsSync).replace('Updated ', '')}.</>)}
        {" "}
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

    </div>
  );
}
