// src/pages/SkyBlueRewards.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/DefaultRewards.css";
import { apiGet, apiPost } from "../api.js";

const ASSET = (p) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

export default function SkyBlueRewards() {
  const navigate = useNavigate();

  // NOTE: this page is a merchant entry simulation
  const merchantId = "merchant001";

  const [memberEmail, setMemberEmail] = useState("logan104");
  const [pointsAvailable, setPointsAvailable] = useState("442231");

  // pull merchant conversion_rate (same source DemoLaunch uses)
  const [merchantRate, setMerchantRate] = useState(0); // normalized 0.xx
  const [busy, setBusy] = useState(false);

  // --- helpers copied from DemoLaunch pattern ---
  function normalizeRate(raw) {
    let r = Number(raw || 0);
    if (!Number.isFinite(r) || r <= 0) return 0;
    // Support either 0.05 or 5 (i.e., 5%)
    if (r >= 1) r = r / 100;
    return r;
  }

  function calcCashFromPoints(p, rate) {
    const cents = Math.round(Number(p) * Number(rate) * 100);
    return cents / 100;
  }

  async function logLedger({ memberId, merchantId, points, action }) {
    const clientTxId =
      `skyblue_${memberId}_${merchantId}_` +
      `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      member_id: memberId,
      merchant_id: merchantId,
      points: Number(points),
      action, // 'earn' or 'redeem'
      client_tx_id: clientTxId,
    };

    const data = await apiPost("log-ledger.php", payload);
    if (!data?.success) throw new Error(data?.error || "Failed to log ledger");
    return data;
  }

  async function updateWalletBalance({ memberId, merchantId, points }) {
    const rate = merchantRate; // already normalized
    const cash_balance = rate > 0 ? calcCashFromPoints(points, rate) : 0;

    const data = await apiPost("update-wallet-balance.php", {
      member_id: memberId,
      merchant_id: merchantId,
      points: Number(points),
      cash_balance, // rounded to cents
    });

    if (!data?.success)
      throw new Error(data?.error || "Failed to update wallet balance");

    return data;
  }

  // Load conversion rate for merchant001 once (best-effort)
  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet("get-merchants.php");
        if (!data?.success) return;

        const m =
          (data.merchants || []).find(
            (row) => String(row.merchant_id) === String(merchantId)
          ) || null;

        const r = normalizeRate(m?.conversion_rate);
        setMerchantRate(r);
      } catch (e) {
        console.warn("[SkyBlueRewards] get-merchants failed:", e);
        setMerchantRate(0);
      }
    })();
  }, []);

  const handleStartDemo = async () => {
    const memberId = memberEmail.trim();
    const pts = Number(pointsAvailable);

    if (!memberId) {
      alert("Please enter a member ID");
      return;
    }
    if (!Number.isFinite(pts) || pts <= 0) {
      alert("Please enter a valid points amount");
      return;
    }

    setBusy(true);
    try {
      // ✅ 1) Log points to transactions_ledger (same as DemoLaunch)
      await logLedger({
        memberId,
        merchantId,
        points: pts,
        action: "earn",
      });

      // ✅ 2) Update wallet points + cash balance (same as DemoLaunch)
      await updateWalletBalance({
        memberId,
        merchantId,
        points: pts,
      });
    } catch (e) {
      console.warn("[SkyBlueRewards] pre-launch update failed:", e?.message || e);
      // Keep behavior consistent with DemoLaunch: still proceed to launch even if logging fails
    } finally {
      setBusy(false);
    }

    // ✅ 3) Navigate into the PWA splash route (keep existing behavior)
    const params = new URLSearchParams({
      merchant_id: merchantId,
      member_id: memberId, // NOTE: switch to member_id so it matches DemoLaunch query pattern
      points: String(pts),
      action: "earn",
    }).toString();

    navigate(`/?${params}`);
  };

  return (
    <div className="rewards-page">
      <header className="rewards-header">
        <button
          type="button"
          className="back-button"
          onClick={() => window.history.back()}
          disabled={busy}
        >
          ‹
        </button>
        <h1>Transfer Points</h1>
      </header>

      <main className="rewards-main">
        <div
          className="rewards-image-wrapper"
          onClick={() => !busy && handleStartDemo()}
          title={busy ? "Working…" : "Start demo"}
          style={{ opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }}
        >
          <img
            src={ASSET("/logos/skyblue-rewards.png")}
            alt="SkyBlue Rewards"
            className="rewards-image"
          />
        </div>

        <div className="demo-inputs">
          <label className="demo-label">
            Member
            <input
              type="text"
              className="demo-input"
              placeholder="logan104"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="demo-label">
            Points Available
            <input
              type="number"
              className="demo-input"
              placeholder="442231"
              value={pointsAvailable}
              onChange={(e) => setPointsAvailable(e.target.value)}
              disabled={busy}
            />
          </label>

          <div className="caption" style={{ marginTop: 6, opacity: 0.8 }}>
            {merchantRate > 0
              ? `Conversion rate detected: ${(merchantRate * 100).toFixed(2)}%`
              : "Conversion rate not detected (cash balance may not update)."}
          </div>
        </div>

        <button
          type="button"
          className="start-demo-button"
          onClick={handleStartDemo}
          disabled={busy}
        >
          {busy ? "Starting…" : "Start StockLoyal Demo"}
        </button>
      </main>
    </div>
  );
}
