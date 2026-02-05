// src/pages/DemoLaunch.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api.js";

export default function DemoLaunch() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState(null);

  // Read optional preset values from query string
  const { presetMerchantId, presetMemberId, presetPoints, presetTier } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      presetMerchantId: params.get("merchant_id") || "",
      presetMemberId: params.get("member_id") || "",
      presetPoints: params.get("points") || "100",
      presetTier: params.get("tier") || "",
    };
  }, []);

  const [selectedMerchantId, setSelectedMerchantId] = useState(presetMerchantId);
  const [memberId, setMemberId] = useState(presetMemberId);
  const [points, setPoints] = useState(presetPoints);
  const [tier, setTier] = useState(presetTier);
  const [launching, setLaunching] = useState(false);

  // Bulk refresh state
  const [bulkPoints, setBulkPoints] = useState("100");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Tier options for selected merchant
  const [tierOptions, setTierOptions] = useState([]);

  // Fetch merchants
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

  // Update tier options when selected merchant changes
  useEffect(() => {
    const merchant = merchants.find((m) => String(m.merchant_id) === String(selectedMerchantId));
    if (!merchant) {
      setTierOptions([]);
      return;
    }

    const tiers = [];
    for (let i = 1; i <= 6; i++) {
      const name = merchant[`tier${i}_name`];
      if (name) tiers.push(name);
    }
    setTierOptions(tiers);

    // Default to first tier if none selected
    if (tiers.length > 0 && !tier) {
      setTier(tiers[0]);
    }
  }, [selectedMerchantId, merchants]);

  // ───────────────────────────────────────────────────
  // Launch: POST webhook to backend, then open redirect URL
  // ───────────────────────────────────────────────────
  const launchDemo = async () => {
    const trimmedMember = memberId.trim();
    const pts = Number(points);

    if (!selectedMerchantId) return alert("Select a merchant first");
    if (!trimmedMember) return alert("Please enter a Member ID");
    if (!Number.isFinite(pts) || pts <= 0) return alert("Points must be a positive number");

    setLaunching(true);
    setLastResult(null);
    setError("");

    try {
      // POST to webhook endpoint (backend handles wallet + ledger)
      const data = await apiPost("demo-inbound.php", {
        merchant_id: selectedMerchantId,
        member_id: trimmedMember,
        points: pts,
        tier: tier || undefined,
        action: "earn",
      });

      if (!data?.success) {
        throw new Error(data?.error || "Webhook call failed");
      }

      console.log("[DemoLaunch] Webhook response:", data);
      setLastResult(data);

      // Open the redirect URL returned by the backend
      const redirectPath = data.redirect_url || `/?member_id=${encodeURIComponent(trimmedMember)}&merchant_id=${encodeURIComponent(selectedMerchantId)}`;
      const fullUrl = window.location.origin + redirectPath;
      window.open(fullUrl, "_blank");
    } catch (e) {
      console.error("[DemoLaunch] webhook error:", e);
      setError(e?.message || "Failed to send webhook");
    } finally {
      setLaunching(false);
    }
  };

  // Bulk refresh handler (admin tool – separate concern)
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
        Simulate a merchant webhook that sends member data + reward points to StockLoyal.
        The backend processes the wallet update and ledger entry before the member lands in the PWA.
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
                onChange={(e) => {
                  setSelectedMerchantId(e.target.value);
                  setTier(""); // reset tier when merchant changes
                  setLastResult(null);
                }}
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
                onChange={(e) => { setMemberId(e.target.value); setLastResult(null); }}
              />
            </div>

            {tierOptions.length > 0 && (
              <div className="form-row">
                <label className="form-label">Member Tier:</label>
                <select
                  className="form-input"
                  value={tier}
                  onChange={(e) => { setTier(e.target.value); setLastResult(null); }}
                >
                  <option value="">— No tier —</option>
                  {tierOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-row">
              <label className="form-label">Reward Points:</label>
              <input
                className="form-input"
                type="number"
                value={points}
                onChange={(e) => { setPoints(e.target.value); setLastResult(null); }}
              />
            </div>

            <div className="card-actions">
              <button className="btn-primary" onClick={launchDemo} disabled={launching}>
                {launching ? "Sending webhook…" : "Launch StockLoyal PWA"}
              </button>
            </div>

            {/* Webhook result feedback */}
            {lastResult && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem 1rem",
                  fontSize: "0.85rem",
                  backgroundColor: lastResult.member_exists ? "#e8f5e9" : "#fff3e0",
                  border: `1px solid ${lastResult.member_exists ? "#a5d6a7" : "#ffcc80"}`,
                  borderRadius: "8px",
                }}
              >
                <strong>
                  {lastResult.member_exists
                    ? "✅ Existing member — wallet updated"
                    : "🕐 New member — points queued for registration"}
                </strong>
                <br />
                Points: {lastResult.points} &nbsp;|&nbsp; Cash: ${lastResult.cash_balance?.toFixed(2)}
                {lastResult.tier && <> &nbsp;|&nbsp; Tier: {lastResult.tier}</>}
                {lastResult.conversion_rate && (
                  <> &nbsp;|&nbsp; Rate: {lastResult.conversion_rate}</>
                )}
              </div>
            )}

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
