// src/pages/DemoLaunch.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api.js";

export default function DemoLaunch() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Read optional preset values from query string
  const { presetMerchantId, presetMemberId, presetPoints } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      presetMerchantId: params.get("merchant_id") || "",
      presetMemberId: params.get("member_id") || "",
      presetPoints: params.get("points") || "100",
    };
  }, []);

  const [selectedMerchantId, setSelectedMerchantId] = useState(presetMerchantId);
  const [memberId, setMemberId] = useState(presetMemberId);
  const [points, setPoints] = useState(presetPoints);

  // NEW: bulk refresh state (force overlay)
  const [bulkPoints, setBulkPoints] = useState("100");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Fetch merchants (use same helper as WalletAdmin)
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiGet("get-merchants.php");
        if (!data?.success) throw new Error(data?.error || "Failed to load merchants");
        const rows = data.merchants || [];
        setMerchants(rows);
        if (!presetMerchantId && rows.length) {
          setSelectedMerchantId(rows[0].merchant_id);
        }
      } catch (e) {
        console.error("[DemoLaunch] get-merchants failed:", e);
        setError(e?.message || "Network/server error loading merchants");
      } finally {
        setLoading(false);
      }
    })();
  }, [presetMerchantId]);

  // Helpers
  function findSelectedMerchant(merchantId) {
    return merchants.find((m) => String(m.merchant_id) === String(merchantId)) || null;
  }

  function normalizeRate(raw) {
    let r = Number(raw || 0);
    if (!Number.isFinite(r) || r <= 0) return 0;
    // Support either 0.05 or 5 (i.e., 5%)
    if (r >= 1) r = r / 100;
    return r;
  }

  // Accurate cents rounding
  function calcCashFromPoints(p, rate) {
    const cents = Math.round(Number(p) * Number(rate) * 100);
    return cents / 100;
  }

  // Log to transactions_ledger
  async function logLedger({ memberId, merchantId, points, action }) {
    const clientTxId =
      `demo_${memberId}_${merchantId}_` + `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

  // Upsert wallet with points + computed cash_balance
  async function updateWalletBalance({ memberId, merchantId, points }) {
    const merchant = findSelectedMerchant(merchantId);
    const rate = normalizeRate(merchant?.conversion_rate);
    const cash_balance = rate > 0 ? calcCashFromPoints(points, rate) : 0;

    const data = await apiPost("update-wallet-balance.php", {
      member_id: memberId,
      merchant_id: merchantId,
      points: Number(points),
      cash_balance, // already rounded to cents
    });
    if (!data?.success) throw new Error(data?.error || "Failed to update wallet balance");
    return data;
  }

  const launchDemo = async () => {
    const trimmedMember = memberId.trim();
    const pts = Number(points);

    if (!selectedMerchantId) return alert("Select a merchant first");
    if (!trimmedMember) return alert("Please enter a Member ID");
    if (!Number.isFinite(pts) || pts <= 0) return alert("Points must be a positive number");

    try {
      // 1) Log the demo earn in the ledger
      await logLedger({
        memberId: trimmedMember,
        merchantId: selectedMerchantId,
        points: pts,
        action: "earn",
      });

      // 2) Update wallet.points and wallet.cash_balance (derived from merchant.conversion_rate)
      await updateWalletBalance({
        memberId: trimmedMember,
        merchantId: selectedMerchantId,
        points: pts,
      });
    } catch (err) {
      console.warn("[DemoLaunch] pre-launch update failed:", err?.message || err);
      // Optionally early-return if you want to require success:
      // return;
    }

    const url =
      window.location.origin +
      `/?member_id=${encodeURIComponent(trimmedMember)}` +
      `&merchant_id=${encodeURIComponent(selectedMerchantId)}` +
      `&points=${encodeURIComponent(pts)}` +
      `&action=earn`;

    window.open(url, "_blank");
  };

  // Bulk refresh handler (FORCE OVERLAY)
  const refreshAllMembers = async () => {
    const merchantId = selectedMerchantId;
    const target = Number(bulkPoints);

    if (!merchantId) return alert("Select a merchant first");
    if (!Number.isFinite(target) || target < 0)
      return alert("Bulk points must be 0 or a positive number");

    const ok = window.confirm(
      `This will FORCE-SET ALL members of merchant ${merchantId} to exactly ${target} points (overlay), and log per-member adjustments. Continue?`
    );
    if (!ok) return;

    setBulkBusy(true);
    try {
      const data = await apiPost("bulk-refresh-points.php", {
        merchant_id: merchantId,
        points: target,
        requested_by: "DemoLaunch",
      });
      if (!data?.success) throw new Error(data?.error || "Bulk refresh failed");

      alert(
        `Bulk overlay complete.\nUpdated: ${data.updated}\nUnchanged: ${data.skipped}\nTarget: ${data.target_points}`
      );
    } catch (e) {
      alert(`Bulk refresh error: ${e.message || e}`);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Launch Demo</h1>
      <p className="page-deck">
        Simulate a member arriving from a merchant by selecting a merchant, entering a Member ID, and reward points.
        You can also force-overlay points for all members of a merchant.
      </p>

      <div className="card">
        {loading ? (
          <p>Loading merchants…</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : merchants.length === 0 ? (
          <p>No merchants found. Add one from the Admin page first.</p>
        ) : (
          <div className="form-grid">
            <div className="form-row">
              <label className="form-label">Merchant:</label>
              <select
                className="form-input"
                value={selectedMerchantId}
                onChange={(e) => setSelectedMerchantId(e.target.value)}
              >
                {merchants.map((m) => (
                  <option key={m.merchant_id} value={m.merchant_id}>
                    {m.merchant_name} ({m.merchant_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Member ID:</label>
              <input
                className="form-input"
                placeholder="Enter Member ID"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              />
            </div>

            <div className="form-row">
              <label className="form-label">Reward Points:</label>
              <input
                className="form-input"
                type="number"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>

            <div className="card-actions">
              <button className="btn-primary" onClick={launchDemo}>
                Launch StockLoyal PWA
              </button>
            </div>

            {/* Force overlay bulk refresh */}
            <hr className="my-4" />
            <div className="form-row">
              <label className="form-label">
                Bulk Points (force overlay for ALL members of selected merchant):
              </label>
              <input
                className="form-input"
                type="number"
                min="0"
                value={bulkPoints}
                onChange={(e) => setBulkPoints(e.target.value)}
              />
            </div>
            <div className="card-actions">
              <button
                className="btn-secondary"
                onClick={refreshAllMembers}
                disabled={bulkBusy}
                title="Hard-set wallet.points for all members of selected merchant; log adjust_points per member"
              >
                {bulkBusy ? "Refreshing…" : "Refresh All Members for Merchant"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
