// src/pages/PaymentsProcessing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, apiGet } from "../api.js";

export default function PaymentsProcessing() {
  const [merchantId, setMerchantId] = useState("");
  const [merchants, setMerchants] = useState([]);
  const [merchantsLoading, setMerchantsLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [error, setError] = useState("");
  const [markResult, setMarkResult] = useState(null);

  const navigate = useNavigate();

  // Fetch merchants for dropdown on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      setMerchantsLoading(true);
      try {
        const res = await apiGet("get-merchants.php");
        if (res?.success && Array.isArray(res.merchants)) {
          if (!mounted) return;
          setMerchants(res.merchants);
          const defaultMerchant =
            res.merchants.find((m) => m.merchant_id === "merchant001") ||
            res.merchants[0];
          if (defaultMerchant) {
            setMerchantId(defaultMerchant.merchant_id);
          }
        } else {
          console.warn("[PaymentsProcessing] get-merchants failed:", res);
        }
      } catch (err) {
        console.error("[PaymentsProcessing] get-merchants error:", err);
      } finally {
        if (mounted) setMerchantsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Helper to fetch unpaid payments for a merchant
  const fetchPayments = async (currentMerchantId) => {
    if (!currentMerchantId) {
      setError("Please select a merchant.");
      return;
    }
    setError("");
    setLoading(true);
    setMarkResult(null);

    try {
      const res = await apiPost("get-payments.php", {
        merchant_id: currentMerchantId,
        // paid_filter omitted -> defaults to "unpaid"
      });
      if (!res?.success) {
        setError(res?.error || "Failed to fetch payments.");
        setOrders([]);
        setSummary([]);
      } else {
        setOrders(res.orders || []);
        setSummary(res.summary || []);
      }
    } catch (err) {
      console.error("[PaymentsProcessing] get-payments error:", err);
      setError("Network/server error while fetching payments.");
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = async (e) => {
    e.preventDefault();
    await fetchPayments(merchantId);
  };

  // Mark all unpaid confirmed/executed orders as paid for this merchant
  const handleMarkPaid = async () => {
    if (!merchantId) {
      setError("Please select a merchant before marking paid.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await apiPost("mark-payments-paid.php", {
        merchant_id: merchantId,
      });
      if (!res?.success) {
        setError(res?.error || "Failed to mark orders as paid.");
        setMarkResult(null);
      } else {
        setMarkResult(res);
        // reload unpaid queue
        await fetchPayments(merchantId);
      }
    } catch (err) {
      console.error("[PaymentsProcessing] mark-payments-paid error:", err);
      setError("Network/server error while marking orders as paid.");
    } finally {
      setLoading(false);
    }
  };

  // Merchant-level totals (all unpaid orders for this merchant)
  const totals = useMemo(() => {
    if (!orders || orders.length === 0) {
      return {
        totalBaskets: 0,
        tradeOrders: 0,
        totalDollarAmount: 0,
        totalSecurities: 0,
        totalMembers: 0,
      };
    }

    const basketSet = new Set();
    const symbolSet = new Set();
    const memberSet = new Set();
    let totalAmount = 0;

    for (const o of orders) {
      if (o.basket_id) basketSet.add(o.basket_id);
      if (o.symbol) symbolSet.add(o.symbol);
      if (o.member_id) memberSet.add(o.member_id);

      const payment =
        o.payment_amount != null
          ? Number(o.payment_amount)
          : o.executed_amount != null
          ? Number(o.executed_amount)
          : o.amount != null
          ? Number(o.amount)
          : 0;

      if (!Number.isNaN(payment)) {
        totalAmount += payment;
      }
    }

    return {
      totalBaskets: basketSet.size,
      tradeOrders: orders.length,
      totalDollarAmount: totalAmount,
      totalSecurities: symbolSet.size,
      totalMembers: memberSet.size,
    };
  }, [orders]);

  // ✅ Broker-level rows (ONE row per broker), aggregated from underlying unpaid orders
  //    and hydrated with ACH fields from summary (if available).
  const brokerRows = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    // take first summary row per broker (contains joined broker_master ACH fields)
    const summaryByBroker = new Map();
    for (const s of summary || []) {
      const b = s?.broker || "";
      if (b && !summaryByBroker.has(b)) summaryByBroker.set(b, s);
    }

    const map = new Map();

    for (const o of orders) {
      const broker = o.broker || "(missing)";
      if (!map.has(broker)) {
        map.set(broker, {
          broker,
          broker_id: "",
          ach_bank_name: "",
          ach_routing_num: "",
          ach_account_num: "",
          ach_account_type: "",
          order_count: 0,
          total_payment_amount: 0,
        });
      }

      const row = map.get(broker);
      row.order_count += 1;

      const payment =
        o.payment_amount != null
          ? Number(o.payment_amount)
          : o.executed_amount != null
          ? Number(o.executed_amount)
          : o.amount != null
          ? Number(o.amount)
          : 0;

      if (!Number.isNaN(payment)) {
        row.total_payment_amount += payment;
      }
    }

    // hydrate ACH fields from summary
    const rows = Array.from(map.values()).map((r) => {
      const s = summaryByBroker.get(r.broker);
      if (!s) return r;
      return {
        ...r,
        broker_id: s.broker_id || r.broker_id,
        ach_bank_name: s.ach_bank_name || r.ach_bank_name,
        ach_routing_num: s.ach_routing_num || r.ach_routing_num,
        ach_account_num: s.ach_account_num || r.ach_account_num,
        ach_account_type: s.ach_account_type || r.ach_account_type,
      };
    });

    // sort by largest amount due (optional)
    rows.sort(
      (a, b) =>
        Number(b.total_payment_amount || 0) - Number(a.total_payment_amount || 0)
    );

    return rows;
  }, [orders, summary]);

  const selectedMerchantLabel =
    merchants.find((m) => m.merchant_id === merchantId)?.merchant_name ||
    merchantId ||
    "";

  const handleBrokerRowClick = (broker) => {
    if (!merchantId || !broker) return;
    navigate(
      `/payments-broker?merchant_id=${encodeURIComponent(
        merchantId
      )}&broker=${encodeURIComponent(broker)}`
    );
  };

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Payments Processing</h1>
      <p className="page-deck">
        Top-level view of ACH payment obligations by broker for a selected{" "}
        <code>merchant_id</code>. From here you can drill into a specific
        broker&apos;s baskets and individual orders.
      </p>

      {/* Merchant + actions */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <form onSubmit={handleFetch} className="form-grid">
          {/* Merchant selector */}
          <div className="form-row">
            <label className="form-label">Merchant:</label>
            {merchantsLoading ? (
              <div className="body-text">Loading merchants…</div>
            ) : (
              <select
                className="form-input"
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
              >
                <option value="">Select a merchant…</option>
                {merchants.map((m) => (
                  <option key={m.merchant_id} value={m.merchant_id}>
                    {m.merchant_id}
                    {m.merchant_name ? ` – ${m.merchant_name}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div
            className="card-actions"
            style={{ gap: "0.5rem", flexWrap: "wrap" }}
          >
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Processing..." : "Load Broker Payments"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleMarkPaid}
              disabled={loading || !merchantId || orders.length === 0}
            >
              Mark All Current Orders as Paid
            </button>
          </div>
        </form>

        {error && (
          <p
            className="body-text"
            style={{ color: "#dc2626", marginTop: "0.5rem" }}
          >
            {error}
          </p>
        )}

        {markResult?.success && (
          <div
            className="body-text"
            style={{ marginTop: "0.5rem", color: "#166534" }}
          >
            <strong>Settlement batch created:</strong>{" "}
            <code>{markResult.paid_batch_id}</code>
            <br />
            <span>
              Orders marked paid:{" "}
              <strong>{markResult.affected_rows ?? 0}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Merchant totals */}
      <h2 className="subheading">
        Merchant Totals{" "}
        {selectedMerchantLabel && (
          <span className="body-text">
            (merchant <strong>{selectedMerchantLabel}</strong>, unpaid only)
          </span>
        )}
      </h2>
      <div className="card" style={{ marginBottom: "1rem" }}>
        {orders && orders.length > 0 ? (
          <div className="form-grid">
            <div className="form-row">
              <label className="form-label">Total Baskets</label>
              <div className="form-input">{totals.totalBaskets}</div>
            </div>
            <div className="form-row">
              <label className="form-label">Trade Orders</label>
              <div className="form-input">{totals.tradeOrders}</div>
            </div>
            <div className="form-row">
              <label className="form-label">Total Dollar Amount</label>
              <div className="form-input">
                ${totals.totalDollarAmount.toFixed(2)}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">
                Total Securities / Issues Purchased
              </label>
              <div className="form-input">{totals.totalSecurities}</div>
            </div>
            <div className="form-row">
              <label className="form-label">Total Members</label>
              <div className="form-input">{totals.totalMembers}</div>
            </div>
          </div>
        ) : (
          <p className="body-text">
            No orders loaded yet. Select a merchant and click &quot;Load Broker
            Payments&quot;.
          </p>
        )}
      </div>

      {/* ✅ Broker-level ACH payment summary (ONE row per broker) */}
      <h2 className="subheading">Broker ACH Payment Summary</h2>
      <div className="card">
        {brokerRows && brokerRows.length > 0 ? (
          <table className="basket-table">
            <thead>
              <tr>
                <th>Broker</th>
                <th>Broker ID</th>
                <th>ACH Bank Name</th>
                <th>ACH Routing #</th>
                <th>ACH Account #</th>
                <th>ACH Type</th>
                <th>Order Count</th>
                <th>Total Payment Due ($)</th>
              </tr>
            </thead>
            <tbody>
              {brokerRows.map((row) => (
                <tr
                  key={`${row.broker || "n/a"}-${row.broker_id || "n/a"}`}
                  style={{ cursor: "pointer" }}
                  title="Click to view this broker's baskets and details"
                  onClick={() => handleBrokerRowClick(row.broker)}
                >
                  <td style={{ textDecoration: "underline" }}>{row.broker}</td>
                  <td>{row.broker_id || "-"}</td>
                  <td>{row.ach_bank_name || "-"}</td>
                  <td>{row.ach_routing_num || "-"}</td>
                  <td>{row.ach_account_num || "-"}</td>
                  <td>{row.ach_account_type || "-"}</td>
                  <td>{row.order_count ?? 0}</td>
                  <td>{Number(row.total_payment_amount || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="body-text">
            No broker summary available. Load a merchant first.
          </p>
        )}
      </div>
    </div>
  );
}
