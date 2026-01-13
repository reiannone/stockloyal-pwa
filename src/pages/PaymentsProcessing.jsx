// src/pages/PaymentsProcessing.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(v) {
  return `$${safeNum(v).toFixed(2)}`;
}
function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function PaymentsProcessing() {
  const navigate = useNavigate();
  const query = useQuery();
  const merchantId = (query.get("merchant_id") || "").trim();

  // Merchant directory
  const [merchants, setMerchants] = useState([]);
  const [merchantsLoading, setMerchantsLoading] = useState(true);

  // MODE A: All Merchants View
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState("");
  const [merchantRows, setMerchantRows] = useState([]);

  // MODE B: Single Merchant View
  const [mLoading, setMLoading] = useState(false);
  const [mError, setMError] = useState("");
  const [mOrders, setMOrders] = useState([]);
  const [mSummary, setMSummary] = useState([]);

  // Load merchant list once
  useEffect(() => {
    let mounted = true;
    (async () => {
      setMerchantsLoading(true);
      try {
        const res = await apiGet("get-merchants.php");
        if (!mounted) return;
        if (res?.success && Array.isArray(res.merchants)) setMerchants(res.merchants);
        else setMerchants([]);
      } catch (e) {
        console.error("[PaymentsProcessing] get-merchants error:", e);
        if (mounted) setMerchants([]);
      } finally {
        if (mounted) setMerchantsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const merchantName = useMemo(() => {
    if (!merchantId) return "";
    const m = merchants.find((x) => x.merchant_id === merchantId);
    return m?.merchant_name || "";
  }, [merchants, merchantId]);

  // Amount helper: backend orders include payment_amount (COALESCE(executed_amount, amount))
  const getOrderPaymentAmount = (o) => safeNum(o?.payment_amount ?? o?.executed_amount ?? o?.amount ?? 0);

  // Build one row per merchant (All Merchants view)
  const buildMerchantRow = (merchant, orders = []) => {
    const basketSet = new Set();
    const brokerSet = new Set();
    const symbolSet = new Set();
    const memberSet = new Set();
    let totalAmount = 0;

    for (const o of orders || []) {
      if (o?.basket_id) basketSet.add(o.basket_id);
      if (o?.broker) brokerSet.add(o.broker);
      if (o?.symbol) symbolSet.add(o.symbol);
      if (o?.member_id) memberSet.add(o.member_id);
      totalAmount += getOrderPaymentAmount(o);
    }

    return {
      merchant_id: merchant?.merchant_id || "",
      merchant_name: merchant?.merchant_name || "",
      unpaid_orders: (orders || []).length,
      unpaid_baskets: basketSet.size,
      brokers: brokerSet.size,
      members: memberSet.size,
      securities: symbolSet.size,
      total_payment_due: totalAmount,
      _orders: orders,
    };
  };

  // Load ALL merchants unpaid
  const loadAllMerchants = useCallback(async () => {
    if (!merchants?.length) return;

    setAllLoading(true);
    setAllError("");
    try {
      const results = await Promise.all(
        merchants.map(async (m) => {
          try {
            const res = await apiPost("get-payments.php", { merchant_id: m.merchant_id });
            const orders = Array.isArray(res?.orders) ? res.orders : [];
            return buildMerchantRow(m, orders);
          } catch (e) {
            console.error("[PaymentsProcessing] get-payments failed for", m.merchant_id, e);
            return buildMerchantRow(m, []);
          }
        })
      );

      results.sort((a, b) => safeNum(b.total_payment_due) - safeNum(a.total_payment_due));
      setMerchantRows(results);
    } catch (e) {
      console.error("[PaymentsProcessing] loadAllMerchants error:", e);
      setAllError("Failed to load merchant payment summary.");
      setMerchantRows([]);
    } finally {
      setAllLoading(false);
    }
  }, [merchants]);

  // Load SINGLE merchant unpaid (merchant drilldown)
  const loadSingleMerchant = useCallback(async (mid) => {
    if (!mid) return;

    setMLoading(true);
    setMError("");
    try {
      const res = await apiPost("get-payments.php", { merchant_id: mid }); // defaults unpaid
      if (!res?.success) {
        setMOrders([]);
        setMSummary([]);
        setMError(res?.error || "Failed to load merchant payments.");
        return;
      }
      setMOrders(Array.isArray(res.orders) ? res.orders : []);
      setMSummary(Array.isArray(res.summary) ? res.summary : []);
    } catch (e) {
      console.error("[PaymentsProcessing] loadSingleMerchant error:", e);
      setMOrders([]);
      setMSummary([]);
      setMError("Failed to load merchant payments.");
    } finally {
      setMLoading(false);
    }
  }, []);

  // Auto-load depending on mode
  useEffect(() => {
    if (merchantId) {
      loadSingleMerchant(merchantId);
    } else if (!merchantsLoading && merchants.length > 0) {
      loadAllMerchants();
    }
  }, [merchantId, merchantsLoading, merchants.length, loadAllMerchants, loadSingleMerchant]);

  // Top totals (All Merchants)
  const topTotals = useMemo(() => {
    const active = merchantRows.filter((r) => (r.unpaid_orders || 0) > 0);

    let unpaid_orders = 0;
    let unpaid_baskets = 0;
    let total_payment_due = 0;

    const brokerSet = new Set();
    const memberSet = new Set();
    const symbolSet = new Set();

    for (const r of active) {
      unpaid_orders += safeNum(r.unpaid_orders);
      unpaid_baskets += safeNum(r.unpaid_baskets);
      total_payment_due += safeNum(r.total_payment_due);

      for (const o of r._orders || []) {
        if (o?.broker) brokerSet.add(o.broker);
        if (o?.member_id) memberSet.add(o.member_id);
        if (o?.symbol) symbolSet.add(o.symbol);
      }
    }

    return {
      merchants_total: merchantRows.length,
      merchants_with_unpaid: active.length,
      unpaid_orders,
      unpaid_baskets,
      brokers: brokerSet.size,
      members: memberSet.size,
      securities: symbolSet.size,
      total_payment_due,
    };
  }, [merchantRows]);

  // Check if all caught up (all values are zero or null)
  const isAllCaughtUp = useMemo(() => {
    return (
      !allLoading &&
      merchantRows.length > 0 &&
      topTotals.merchants_with_unpaid === 0 &&
      topTotals.unpaid_orders === 0 &&
      topTotals.unpaid_baskets === 0 &&
      topTotals.brokers === 0 &&
      topTotals.total_payment_due === 0
    );
  }, [allLoading, merchantRows.length, topTotals]);

  // Build per-broker basket counts from raw orders (distinct basket_id per broker)
  const basketCountByBroker = useMemo(() => {
    const map = new Map(); // broker -> Set(basket_id)
    for (const o of mOrders || []) {
      const b = (o?.broker || "Unknown").toString().trim() || "Unknown";
      if (!map.has(b)) map.set(b, new Set());
      if (o?.basket_id) map.get(b).add(o.basket_id);
    }
    const out = new Map();
    for (const [b, set] of map.entries()) out.set(b, set.size);
    return out;
  }, [mOrders]);

  // ✅ Broker Summary rows: ONE row per broker (use backend summary totals + computed basket counts)
  const brokerRows = useMemo(() => {
    if (!merchantId) return [];

    // summary rows already grouped by broker in backend, but we still normalize to one row per broker
    const map = new Map();

    // take summary as authoritative for totals + ACH fields
    for (const s of mSummary || []) {
      const b = (s?.broker || s?.broker_name || s?.broker_id || "Unknown").toString().trim() || "Unknown";
      if (!map.has(b)) {
        map.set(b, {
          broker: b,
          broker_username: s?.broker_username || "",
          broker_id: s?.broker_id || "",
          ach_bank_name: s?.ach_bank_name || "",
          ach_routing_num: s?.ach_routing_num || "",
          ach_account_num: s?.ach_account_num || "",
          ach_account_type: s?.ach_account_type || "",
          unpaidOrders: 0,
          unpaidBaskets: 0,
          totalAch: 0,
        });
      }

      const row = map.get(b);

      // IMPORTANT: backend returns order_count + total_payment_amount (and we add total_payment_due in PHP below)
      row.unpaidOrders += safeNum(s?.order_count ?? s?.orders ?? s?.unpaid_orders ?? 0);
      row.totalAch += safeNum(
        s?.total_payment_due ?? s?.total_payment_amount ?? s?.total_amount ?? s?.amount_total ?? s?.ach_total ?? 0
      );
    }

    // if summary missing (rare), derive from orders
    if (map.size === 0 && (mOrders || []).length > 0) {
      for (const o of mOrders) {
        const b = (o?.broker || "Unknown").toString().trim() || "Unknown";
        if (!map.has(b)) {
          map.set(b, {
            broker: b,
            broker_username: o?.broker_username || "",
            broker_id: "",
            ach_bank_name: "",
            ach_routing_num: "",
            ach_account_num: "",
            ach_account_type: "",
            unpaidOrders: 0,
            unpaidBaskets: 0,
            totalAch: 0,
          });
        }
        const row = map.get(b);
        row.unpaidOrders += 1;
        row.totalAch += getOrderPaymentAmount(o);
      }
    }

    // baskets from raw orders (distinct basket_id per broker)
    for (const [b, row] of map.entries()) {
      row.unpaidBaskets = safeNum(basketCountByBroker.get(b) ?? 0);
    }

    const rows = Array.from(map.values());
    rows.sort((a, b) => safeNum(b.totalAch) - safeNum(a.totalAch));
    return rows;
  }, [merchantId, mSummary, mOrders, basketCountByBroker]);

  const merchantAchTotals = useMemo(() => {
    if (!merchantId) return { brokers: 0, unpaidOrders: 0, unpaidBaskets: 0, totalAch: 0 };

    const totalAch = brokerRows.reduce((sum, r) => sum + safeNum(r.totalAch), 0);
    const unpaidOrders = brokerRows.reduce((sum, r) => sum + safeNum(r.unpaidOrders), 0);
    const unpaidBaskets = brokerRows.reduce((sum, r) => sum + safeNum(r.unpaidBaskets), 0);

    return { brokers: brokerRows.length, unpaidOrders, unpaidBaskets, totalAch };
  }, [merchantId, brokerRows]);

  // Navigation helpers
  const goToMerchant = (mid) => mid && navigate(`/payments-processing?merchant_id=${encodeURIComponent(mid)}`);
  const backToAll = () => navigate(`/payments-processing`);

  // =========================================================
  // MODE B RENDER: Merchant Drilldown
  // =========================================================
  if (merchantId) {
    return (
      <div className="app-container app-content">
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="card-actions" style={{ justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
            <div>
              <h1 className="page-title" style={{ marginBottom: 0 }}>
                Payments Processing — Merchant
              </h1>
              <div className="body-text">
                <strong>{merchantId}</strong>
                {merchantName ? ` • ${merchantName}` : ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" className="btn-secondary" onClick={backToAll}>
                ← Back to All Merchants
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => loadSingleMerchant(merchantId)}
                disabled={mLoading}
              >
                {mLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {mError && (
            <p className="body-text" style={{ color: "#dc2626", marginTop: "0.5rem" }}>
              {mError}
            </p>
          )}
        </div>

        {/* ACH Totals for Merchant */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="subheading">ACH Totals for Merchant</h2>

          {mLoading ? (
            <p className="body-text">Loading…</p>
          ) : (
            <div className="form-grid">
              <div className="form-row">
                <label className="form-label">Total ACH Due ($)</label>
                <div className="form-input">{fmtMoney(merchantAchTotals.totalAch)}</div>
              </div>
              <div className="form-row">
                <label className="form-label">Brokers</label>
                <div className="form-input">{merchantAchTotals.brokers}</div>
              </div>
              <div className="form-row">
                <label className="form-label">Unpaid Baskets</label>
                <div className="form-input">{merchantAchTotals.unpaidBaskets}</div>
              </div>
              <div className="form-row">
                <label className="form-label">Unpaid Orders</label>
                <div className="form-input">{merchantAchTotals.unpaidOrders}</div>
              </div>
            </div>
          )}
        </div>

        {/* Broker Summary: one row per broker */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="subheading">Broker Summary (Unpaid)</h2>

          {mLoading ? (
            <p className="body-text">Loading…</p>
          ) : brokerRows.length === 0 ? (
            <p className="body-text">No unpaid items for this merchant.</p>
          ) : (
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Unpaid Orders</th>
                  <th>Unpaid Baskets</th>
                  <th>ACH Total ($)</th>
                </tr>
              </thead>
              <tbody>
                {brokerRows.map((r) => (
                  <tr
                    key={r.broker}
                    style={{ cursor: "pointer" }}
                    title="Click to drill into this broker"
                    onClick={() =>
                      navigate(
                        `/payments-broker?merchant_id=${encodeURIComponent(merchantId)}&broker=${encodeURIComponent(
                          r.broker
                        )}`
                      )
                    }
                  >
                    <td style={{ textDecoration: "underline" }}>{r.broker}</td>
                    <td>{r.unpaidOrders}</td>
                    <td>{r.unpaidBaskets}</td>
                    <td>{fmtMoney(r.totalAch)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // =========================================================
  // MODE A RENDER: All Merchants Landing View
  // =========================================================
  return (
    <div className="app-container app-content">
      <h1 className="page-title">Payments Processing</h1>
      <p className="page-deck">
        Summary of <strong>unpaid</strong> ACH obligations across all merchants. Click a merchant row to drill down.
      </p>

      {/* All Caught Up Message */}
      {isAllCaughtUp && (
        <div
          style={{
            backgroundColor: "#d1fae5",
            border: "2px solid #10b981",
            borderRadius: "8px",
            padding: "1rem 1.5rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span style={{ fontSize: "1.125rem", fontWeight: "600", color: "#065f46" }}>
            You're all caught up! No pending payments.
          </span>
        </div>
      )}

      {/* Top summary card */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="card-actions" style={{ justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="body-text">
            {merchantsLoading ? (
              <>Loading merchants…</>
            ) : (
              <>
                Merchants loaded: <strong>{merchants.length}</strong> • Summary rows:{" "}
                <strong>{merchantRows.length}</strong>
              </>
            )}
          </div>
        </div>

        {/* ✅ Centered button group */}
        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "1rem" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={loadAllMerchants}
            disabled={allLoading || merchantsLoading || merchants.length === 0}
          >
            {allLoading ? "Loading…" : "Refresh Merchant Summary"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/csv-files")}
          >
            CSV File Browser
          </button>
        </div>

        {allError && (
          <p className="body-text" style={{ color: "#dc2626", marginTop: "0.5rem" }}>
            {allError}
          </p>
        )}

        <div style={{ marginTop: "0.75rem" }}>
          {allLoading ? (
            <p className="body-text">Loading unpaid payments…</p>
          ) : merchantRows.length === 0 ? (
            <p className="body-text">No merchant summary loaded yet.</p>
          ) : (
            <div className="form-grid">
              <div className="form-row">
                <label className="form-label">Merchants With Unpaid</label>
                <div className="form-input">{topTotals.merchants_with_unpaid}</div>
              </div>
              <div className="form-row">
                <label className="form-label">Unpaid Orders</label>
                <div className="form-input">{topTotals.unpaid_orders}</div>
              </div>
              <div className="form-row">
                <label className="form-label">Unpaid Baskets</label>
                <div className="form-input">{topTotals.unpaid_baskets}</div>
              </div>
              <div className="form-row">
                <label className="form-label">Unique Brokers</label>
                <div className="form-input">{topTotals.brokers}</div>
              </div>
              <div className="form-row">
                <label className="form-label">Total Payment Due ($)</label>
                <div className="form-input">{fmtMoney(topTotals.total_payment_due)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Merchant summary table */}
      <h2 className="subheading">Merchant Payment Summary</h2>
      <div className="card">
        {merchantsLoading ? (
          <p className="body-text">Loading merchants…</p>
        ) : merchantRows.length === 0 ? (
          <p className="body-text">No merchant rows available.</p>
        ) : (
          <table className="basket-table">
            <thead>
              <tr>
                <th>Merchant ID</th>
                <th>Merchant Name</th>
                <th>Unpaid Orders</th>
                <th>Unpaid Baskets</th>
                <th>Brokers</th>
                <th>Members</th>
                <th>Securities</th>
                <th>Total Payment Due ($)</th>
              </tr>
            </thead>
            <tbody>
              {merchantRows.map((r) => {
                const clickable = (r.unpaid_orders || 0) > 0;
                return (
                  <tr
                    key={r.merchant_id}
                    style={{ cursor: clickable ? "pointer" : "default", opacity: clickable ? 1 : 0.6 }}
                    title={clickable ? "Click to drill into this merchant" : "No unpaid orders"}
                    onClick={() => clickable && goToMerchant(r.merchant_id)}
                  >
                    <td style={clickable ? { textDecoration: "underline" } : undefined}>{r.merchant_id}</td>
                    <td>{r.merchant_name || "-"}</td>
                    <td>{r.unpaid_orders ?? 0}</td>
                    <td>{r.unpaid_baskets ?? 0}</td>
                    <td>{r.brokers ?? 0}</td>
                    <td>{r.members ?? 0}</td>
                    <td>{r.securities ?? 0}</td>
                    <td>{fmtMoney(r.total_payment_due)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
