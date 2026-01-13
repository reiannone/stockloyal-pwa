// src/pages/WalletAdmin.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import { apiGet, apiPost } from "../api.js";

export default function WalletAdmin() {
  const [wallets, setWallets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const editPanelRef = useRef(null);

  // Merchants for dropdown
  const [merchants, setMerchants] = useState([]);
  const [merchantsLoading, setMerchantsLoading] = useState(true);

  // ---- timezone helpers ----
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  // Curated IANA timezone options
  const timezones = useMemo(
    () => [
      // Americas
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "America/Detroit",
      "America/Indiana/Indianapolis",
      "America/Kentucky/Louisville",
      "America/Toronto",
      "America/Vancouver",
      "America/Winnipeg",
      "America/Edmonton",
      "America/Mexico_City",
      "America/Cancun",
      // Europe
      "Europe/London",
      "Europe/Dublin",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Brussels",
      // Asia
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Hong_Kong",
      "Asia/Singapore",
      "Asia/Taipei",
      "Asia/Seoul",
      "Asia/Kolkata",
      "Asia/Dubai",
      // Oceania
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Perth",
      "Pacific/Auckland",
      // Fallback
      "UTC",
    ],
    []
  );

  // If DB has a timezone not in our curated list (e.g., "US/Eastern"), inject it so <select> can display it
  const tzOptions = useMemo(() => {
    const current = selected?.member_timezone?.trim();
    if (!current) return timezones;
    return timezones.includes(current) ? timezones : [current, ...timezones];
  }, [selected?.member_timezone, timezones]);

  const isNonStandardTz = useMemo(() => {
    const current = selected?.member_timezone?.trim();
    return !!current && !timezones.includes(current);
  }, [selected?.member_timezone, timezones]);

  // ---- helpers ----
  const normalizeRate = (raw) => {
    const rnum = Number(raw);
    if (!Number.isFinite(rnum) || rnum <= 0) return 0;
    // support 0.05 or 5 (5%)
    return rnum >= 1 ? rnum / 100 : rnum;
  };

  const calcCashFromPoints = (points, rateFromMerchant) => {
    const p = Number(points || 0);
    const r = normalizeRate(rateFromMerchant);
    if (!Number.isFinite(p) || !Number.isFinite(r) || r <= 0) return 0;
    const cents = Math.round(p * r * 100);
    return cents / 100;
  };

  // Friendly display + safe fallback for member tier
  const memberTierLabel = useMemo(() => {
    if (!selected) return "";
    const raw =
      selected.member_tier ??
      selected.tier ??
      selected.tier_name ??
      selected.loyalty_tier ??
      "";
    const t = String(raw || "").trim();
    return t || "Standard";
  }, [selected]);

  // derive current merchant and rate for the selected wallet
  const selectedMerchant = useMemo(() => {
    if (!selected) return null;
    return merchants.find((x) => String(x.merchant_id) === String(selected.merchant_id)) || null;
  }, [merchants, selected]);

  const selectedMerchantRate = selectedMerchant?.conversion_rate ?? 0;
  
  // ✅ Helper function to get tier-specific rate from merchant
  const getTierRate = (merchant, tierName) => {
    if (!merchant || !tierName) return null;
    
    for (let i = 1; i <= 6; i++) {
      const mTierName = merchant[`tier${i}_name`];
      if (mTierName && mTierName.toLowerCase() === tierName.toLowerCase()) {
        return merchant[`tier${i}_conversion_rate`] ?? null;
      }
    }
    return null;
  };
  
  // ✅ Calculate tier-specific rate for selected wallet
  const selectedTierRate = useMemo(() => {
    return getTierRate(selectedMerchant, selected?.member_tier);
  }, [selected, selectedMerchant]);
  
  // ✅ Effective rate: tier-specific if available, otherwise base merchant rate
  const effectiveConversionRate = selectedTierRate ?? selectedMerchantRate;

  // --- load merchants for dropdown ---
  useEffect(() => {
    (async () => {
      setMerchantsLoading(true);
      try {
        const data = await apiGet("get-merchants.php");
        setMerchants(data?.success ? data.merchants || [] : []);
        if (!data?.success) console.warn("[WalletAdmin] merchants error:", data?.error);
      } catch (e) {
        console.error("[WalletAdmin] merchants fetch failed", e);
        setMerchants([]);
      } finally {
        setMerchantsLoading(false);
      }
    })();
  }, []);

  // --- load all wallets ---
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet("get-multiple-wallets.php");
        if (data?.success) {
          setWallets(data.wallets || []);

          const activeMemberId = localStorage.getItem("memberId");
          let initialWallet = null;

          if (activeMemberId) {
            initialWallet = (data.wallets || []).find(
              (w) => String(w.member_id) === String(activeMemberId)
            );
          }
          if (!initialWallet && (data.wallets || []).length > 0) {
            initialWallet = data.wallets[0];
          }

          if (initialWallet) {
            // merchant lookup for rate
            const m = merchants.find(
              (x) => String(x.merchant_id) === String(initialWallet.merchant_id)
            );
            
            // normalize tier fields first
            const member_tier =
              initialWallet.member_tier ??
              initialWallet.tier ??
              initialWallet.tier_name ??
              initialWallet.loyalty_tier ??
              "";
            
            // ✅ Use tier rate if member has a tier
            const tierRate = getTierRate(m, member_tier);
            const rateToUse = tierRate ?? (m?.conversion_rate ?? 0);
            const points = Number(initialWallet.points || 0);
            const cash_balance = calcCashFromPoints(points, rateToUse);

            // ensure timezone present (default to detected only if blank/missing)
            const member_timezone =
              initialWallet.member_timezone && String(initialWallet.member_timezone).trim() !== ""
                ? initialWallet.member_timezone
                : detectedTz;

            setSelected({
              ...initialWallet,
              cash_balance, // live calc from tier-specific or base merchant rate
              merchant_name: initialWallet.merchant_name || m?.merchant_name || "",
              member_timezone,
              member_tier,
            });
          }
        } else {
          console.warn("[WalletAdmin] wallets error:", data?.error);
        }
      } catch (e) {
        console.error("[WalletAdmin] wallets fetch failed", e);
      } finally {
        setLoading(false);
      }
    })();
    // include merchants so merchant_name/rate can hydrate once loaded
  }, [merchants, detectedTz]);

  // --- save wallet (with optional password reset) ---
  const saveWallet = async (e) => {
    e.preventDefault();
    if (!selected) return;

    const updated = { ...selected };

    if (newPassword.trim()) {
      updated.new_password = newPassword.trim();
    }

    // Recalc using effective merchant rate (tier-specific or base)
    const points = Number(updated.points || 0);
    updated.cash_balance = calcCashFromPoints(points, effectiveConversionRate);

    // Ensure we DO NOT send conversion_rate from the admin page
    delete updated.conversion_rate;

    try {
      const res = await apiPost("save-wallet.php", updated);
      if (res?.success) {
        alert("Wallet saved!");
        setNewPassword("");
        window.location.reload();
      } else {
        alert("Save failed: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error("[WalletAdmin] save failed", e);
      alert("Save failed: network/server error");
    }
  };

  // --- delete wallet ---
  const deleteWallet = async (record_id) => {
    if (!window.confirm("Delete this wallet?")) return;
    try {
      const res = await apiPost("delete-wallet.php", { record_id });
      if (res?.success) {
        alert("Deleted");
        setWallets(wallets.filter((w) => w.record_id !== record_id));
        if (selected?.record_id === record_id) {
          setSelected(null);
        }
      } else {
        alert("Delete failed: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error("[WalletAdmin] delete failed", e);
      alert("Delete failed: network/server error");
    }
  };

  // --- handle field changes (LIVE RECALC) ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...selected, [name]: value };

    if (name === "points") {
      const points = Number(updated.points || 0);
      // ✅ Use effective rate (tier-specific or base)
      updated.cash_balance = calcCashFromPoints(points, effectiveConversionRate);
    }

    setSelected(updated);
  };

  // --- handle merchant dropdown change ---
  const handleMerchantSelect = (e) => {
    const merchant_id = e.target.value;
    const m = merchants.find((x) => String(x.merchant_id) === String(merchant_id));

    const updated = {
      ...selected,
      merchant_id,
      merchant_name: m?.merchant_name || "",
    };

    const points = Number(updated.points || 0);
    // ✅ Use tier rate if member has a tier
    const tierRate = getTierRate(m, updated.member_tier);
    const rateToUse = tierRate ?? (m?.conversion_rate ?? 0);
    updated.cash_balance = calcCashFromPoints(points, rateToUse);

    setSelected(updated);
  };

  // --- edit button scrolls to top ---
  const handleEditClick = (wallet) => {
    const withCalc = { ...wallet };
    const points = Number(withCalc.points || 0);

    const m = merchants.find((x) => String(x.merchant_id) === String(withCalc.merchant_id));
    // ✅ Use tier rate if member has a tier
    const tierRate = getTierRate(m, withCalc.member_tier);
    const rateToUse = tierRate ?? (m?.conversion_rate ?? 0);

    withCalc.cash_balance = calcCashFromPoints(points, rateToUse);

    if (!withCalc.merchant_name && m?.merchant_name) withCalc.merchant_name = m.merchant_name;
    if (!withCalc.broker && m?.broker) withCalc.broker = m.broker;
    if (!withCalc.broker_url && m?.broker_url) withCalc.broker_url = m.broker_url;

    // normalize tier fields (support multiple backend names)
    if (withCalc.member_tier == null) {
      withCalc.member_tier =
        withCalc.member_tier ??
        withCalc.tier ??
        withCalc.tier_name ??
        withCalc.loyalty_tier ??
        "";
    }

    // ensure timezone present
    if (!withCalc.member_timezone || String(withCalc.member_timezone).trim() === "") {
      withCalc.member_timezone = detectedTz;
    }

    setSelected(withCalc);
    setNewPassword("");
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Wallet Administration</h1>
      <p className="page-deck">
        This administration page is to manage member wallet information to correct or originate
        information for demonstration purposes.
      </p>

      <div className="card" ref={editPanelRef} style={{ overflowX: "hidden", maxWidth: "100%" }}>
        {selected ? (
          <form onSubmit={saveWallet} className="form-grid" style={{ maxWidth: "100%" }}>
            <input type="hidden" name="record_id" value={selected?.record_id || ""} />

            {/* Member details */}
            <FormRow label="Member ID">
              <input
                className="form-input"
                type="text"
                name="member_id"
                value={selected?.member_id || ""}
                onChange={handleChange}
                required
              />
            </FormRow>

            <FormRow label="Member Email">
              <input
                className="form-input"
                type="email"
                name="member_email"
                value={selected?.member_email || ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* Admin-only password reset */}
            <FormRow label="Reset Password">
              <input
                className="form-input"
                type="password"
                name="new_password"
                value={newPassword}
                placeholder="Enter new password to reset"
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormRow>

            <FormRow label="First Name">
              <input
                className="form-input"
                type="text"
                name="first_name"
                value={selected?.first_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Middle Name">
              <input
                className="form-input"
                type="text"
                name="middle_name"
                value={selected?.middle_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Last Name">
              <input
                className="form-input"
                type="text"
                name="last_name"
                value={selected?.last_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* Address */}
            <FormRow label="Address Line 1">
              <input
                className="form-input"
                type="text"
                name="member_address_line1"
                value={selected?.member_address_line1 || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Address Line 2">
              <input
                className="form-input"
                type="text"
                name="member_address_line2"
                value={selected?.member_address_line2 || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Town/City">
              <input
                className="form-input"
                type="text"
                name="member_town_city"
                value={selected?.member_town_city || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="State">
              <input
                className="form-input"
                type="text"
                name="member_state"
                value={selected?.member_state || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="ZIP">
              <input
                className="form-input"
                type="text"
                name="member_zip"
                value={selected?.member_zip || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Country">
              <input
                className="form-input"
                type="text"
                name="member_country"
                value={selected?.member_country || ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* ✅ Local Timezone */}
            <FormRow label="Local Timezone">
              <div className="form-inline">
                <select
                  className="form-input"
                  name="member_timezone"
                  value={selected?.member_timezone ?? ""} // controlled; no auto-fallback
                  onChange={handleChange}
                >
                  <option value="">-- Select Timezone --</option>
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <small className="subtext" style={{ marginLeft: "0.5rem" }}>
                  Detected: <strong>{detectedTz}</strong>
                  {isNonStandardTz && (
                    <span style={{ marginLeft: 8, color: "#b45309" }}>
                      (Non-standard; consider switching)
                    </span>
                  )}
                </small>
              </div>
            </FormRow>

            {/* Merchant & Broker */}
            <FormRow label="Merchant ID">
              <select
                className="form-input"
                name="merchant_id"
                value={String(selected?.merchant_id ?? "")}
                onChange={handleMerchantSelect}
                disabled={merchantsLoading}
              >
                <option value="">{merchantsLoading ? "Loading…" : "Select a merchant"}</option>
                {merchants.map((m) => (
                  <option key={m.merchant_id} value={String(m.merchant_id)}>
                    {m.merchant_name} ({m.merchant_id})
                  </option>
                ))}
              </select>
            </FormRow>

            <FormRow label="Merchant Name">
              <input
                className="form-input"
                type="text"
                name="merchant_name"
                value={selected?.merchant_name || ""}
                readOnly
              />
            </FormRow>

            {/* ✅ Member Tier (display below merchant name and above conversion rate) */}
            <FormRow label="Member Tier">
              <input
                className="form-input"
                type="text"
                name="member_tier"
                value={memberTierLabel}
                onChange={handleChange}
                placeholder="e.g., Standard / Silver / Gold / Platinum"
              />
            </FormRow>

            {/* 🔒 Base Conversion Rate (display-only from merchant) */}
            <FormRow label="Base Conversion Rate (Merchant Default)">
              <input
                className="form-input"
                type="text"
                name="conversion_rate_display"
                value={
                  selectedMerchantRate
                    ? `${selectedMerchantRate} ${selectedMerchantRate >= 1 ? "(% or ratio)" : ""}`
                    : ""
                }
                readOnly
                style={{
                  color: "#6b7280",
                  fontStyle: "italic"
                }}
              />
            </FormRow>
            
            {/* ✅ Active Conversion Rate (tier-specific or base) */}
            <FormRow label="Active Conversion Rate (Currently Using)">
              <input
                className="form-input"
                type="text"
                name="active_rate_display"
                value={
                  effectiveConversionRate
                    ? `${effectiveConversionRate}${selectedTierRate ? ` (${selected?.member_tier} Tier)` : " (Base Rate)"}`
                    : ""
                }
                readOnly
                style={{
                  fontWeight: "600",
                  color: selectedTierRate ? "#059669" : "#1f2937",
                  backgroundColor: selectedTierRate ? "#f0fdf4" : "transparent"
                }}
              />
            </FormRow>

            <FormRow label="Broker">
              <input
                className="form-input"
                type="text"
                name="broker"
                value={selected?.broker || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Broker URL">
              <input
                className="form-input"
                type="url"
                name="broker_url"
                value={selected?.broker_url || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Election Type">
              <input
                className="form-input"
                type="text"
                name="election_type"
                value={selected?.election_type || ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* Balances */}
            <FormRow label="Points">
              <input
                className="form-input"
                type="number"
                name="points"
                value={selected?.points ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* cash_balance is display only (but we show the live calc) */}
            <FormRow label="Cash Balance (calc)">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="cash_balance"
                value={
                  Number.isFinite(Number(selected?.cash_balance))
                    ? selected?.cash_balance
                    : calcCashFromPoints(Number(selected?.points || 0), effectiveConversionRate)
                }
                readOnly
              />
            </FormRow>

            <FormRow label="Portfolio Value">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="portfolio_value"
                value={selected?.portfolio_value ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Sweep %">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="sweep_percentage"
                value={selected?.sweep_percentage ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <div className="card-actions">
              <button type="submit" className="btn-primary">
                Save Wallet
              </button>
              {selected?.record_id && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={() => deleteWallet(selected.record_id)}
                >
                  Delete Wallet
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="body-text">Select a wallet from the table below to edit.</p>
        )}
      </div>

      {/* Wallets table */}
      <h2 className="subheading">Wallet Records</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Email</th>
                <th>Merchant / Broker</th>
                <th>Points → Cash / Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => {
                const points = w.points == null || isNaN(Number(w.points)) ? null : Number(w.points);
                const cash =
                  w.cash_balance != null && !isNaN(Number(w.cash_balance))
                    ? Number(w.cash_balance)
                    : null;
                const portfolio =
                  w.portfolio_value == null || isNaN(Number(w.portfolio_value))
                    ? null
                    : Number(w.portfolio_value);

                return (
                  <tr 
                    key={w.record_id}
                    onClick={() => handleEditClick(w)}
                    style={{ cursor: 'pointer' }}
                    title="Click to edit this wallet"
                  >
                    <td>{w.member_id}</td>
                    <td>
                      <div>{w.member_email}</div>
                      {w.member_timezone && <div className="subtext">{w.member_timezone}</div>}
                    </td>
                    <td>
                      <div>{w.merchant_name || "-"}</div>
                      <div className="subtext">{w.broker || "-"}</div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span>{points == null ? "-" : points.toLocaleString()}</span>
                        <span aria-hidden="true" title="converts to">
                          ➜
                        </span>
                        <span>
                          {cash == null
                            ? "-"
                            : cash.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                        </span>
                      </div>
                      <div className="subtext" style={{ marginTop: "0.15rem" }}>
                        {portfolio == null
                          ? "-"
                          : portfolio.toLocaleString(undefined, {
                              style: "currency",
                              currency: "USD",
                            })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div className="form-row" style={{ maxWidth: "100%", boxSizing: "border-box" }}>
      {label && <label className="form-label">{label}:</label>}
      <div style={{ maxWidth: "100%", boxSizing: "border-box" }}>
        {children}
      </div>
    </div>
  );
}