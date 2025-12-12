// src/pages/PaymentsBroker.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function PaymentsBroker() {
  const query = useQuery();
  const navigate = useNavigate();

  const merchantId = query.get("merchant_id") || "";
  const broker = query.get("broker") || "";

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [error, setError] = useState("");
  const [exportResult, setExportResult] = useState(null);

  useEffect(() => {
    if (!merchantId) {
      setError("merchant_id is required in the URL.");
      return;
    }
    setError("");
    setExportResult(null);

    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiPost("get-payments.php", {
          merchant_id: merchantId,
        });
        if (!mounted) return;
        if (!res?.success) {
          setError(res?.error || "Failed to fetch payments.");
          setOrders([]);
          setSummary([]);
        } else {
          setOrders(res.orders || []);
          setSummary(res.summary || []);
        }
      } catch (err) {
        console.error("[PaymentsBroker] get-payments error:", err);
        if (mounted) setError("Network/server error while fetching payments.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [merchantId]);

  // Filter orders to this broker
  const brokerOrders = useMemo(
    () =>
      orders.filter(
        (o) => (!broker ? true : o.broker === broker)
      ),
    [orders, broker]
  );

  // Find broker summary row (joined to broker_master)
  const brokerSummary = useMemo(() => {
    if (!broker) return null;
    return summary.find((row) => row.broker === broker) || null;
  }, [summary, broker]);

  // Group orders by basket for this broker
  const baskets = useMemo(() => {
    const map = new Map();
    for (const o of brokerOrders) {
      const basketId = o.basket_id || "(no basket)";
      if (!map.has(basketId)) {
        map.set(basketId, {
          basketId,
          orderCount: 0,
          totalPaymentAmount: 0,
          memberSet: new Set(),
          symbolSet: new Set(),
        });
      }
      const entry = map.get(basketId);
      entry.orderCount += 1;
      if (o.member_id) entry.memberSet.add(o.member_id);
      if (o.symbol) entry.symbolSet.add(o.symbol);

      const payment =
        o.payment_amount != null
          ? Number(o.payment_amount)
          : o.executed_amount != null
          ? Number(o.executed_amount)
          : o.amount != null
          ? Number(o.amount)
          : 0;
      if (!Number.isNaN(payment)) {
        entry.totalPaymentAmount += payment;
      }
    }

    return Array.from(map.values()).map((entry) => ({
      basketId: entry.basketId,
      orderCount: entry.orderCount,
      totalPaymentAmount: entry.totalPaymentAmount,
      memberCount: entry.memberSet.size,
      symbolCount: entry.symbolSet.size,
    }));
  }, [brokerOrders]);

  const brokerAchDetails = useMemo(() => {
    if (!brokerSummary) {
      return {
        brokerName: broker || "",
        brokerId: "",
        achPaymentAmount: 0,
        bankName: "",
        routingNumber: "",
        accountNumber: "",
        accountType: "",
        orderCount: brokerOrders.length,
      };
    }

    return {
      brokerName: brokerSummary.broker || broker || "",
      brokerId: brokerSummary.broker_id || "",
      achPaymentAmount: Number(brokerSummary.total_payment_amount || 0),
      bankName: brokerSummary.ach_bank_name || "",
      routingNumber: brokerSummary.ach_routing_num || "",
      accountNumber: brokerSummary.ach_account_num || "",
      accountType: brokerSummary.ach_account_type || "",
      orderCount: brokerSummary.order_count || brokerOrders.length,
    };
  }, [brokerSummary, brokerOrders, broker]);

  const handleExport = async () => {
    if (!merchantId || !broker) {
      setError("Both merchant_id and broker are required for export.");
      return;
    }
    setError("");
    setLoading(true);
    setExportResult(null);

    try {
      const res = await apiPost("export-payments-file.php", {
        merchant_id: merchantId,
        broker,
      });
      if (!res?.success) {
        setError(res?.error || "Failed to generate export file.");
      } else {
        setExportResult(res);
      }
    } catch (err) {
      console.error("[PaymentsBroker] export error:", err);
      setError("Network/server error while generating export file.");
    } finally {
      setLoading(false);
    }
  };

  const handleBasketClick = (basketId) => {
    navigate(
      `/payments-basket?merchant_id=${encodeURIComponent(
        merchantId
      )}&broker=${encodeURIComponent(broker)}&basket_id=${encodeURIComponent(
        basketId
      )}`
    );
  };

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Broker Settlement</h1>
      <p className="page-deck">
        ACH settlement view for broker <strong>{broker || "(all brokers)"}</strong>{" "}
        under merchant <code>{merchantId || "(missing)"}</code>. This page shows
        ACH details and basket-level totals for the broker.
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="card-actions" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(-1)}
          >
            &larr; Back to Payments Processing
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleExport}
            disabled={loading || !merchantId || !broker}
          >
            {loading ? "Processing…" : "Generate SFTP File for Broker"}
          </button>
        </div>

        {error && (
          <p
            className="body-text"
            style={{ color: "#dc2626", marginTop: "0.5rem" }}
          >
            {error}
          </p>
        )}

        {exportResult?.success && (
          <div className="body-text" style={{ marginTop: "0.5rem" }}>
            <strong>Export file created:</strong>{" "}
            <code>{exportResult.filename}</code>
            {exportResult?.relative_path && (
              <>
                <br />
                <span>
                  Server path: <code>{exportResult.relative_path}</code>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Broker ACH summary */}
      <h2 className="subheading">Broker ACH Details</h2>
      <div className="card" style={{ marginBottom: "1rem" }}>
        {brokerOrders && brokerOrders.length > 0 ? (
          <div className="form-grid">
            <div className="form-row">
              <label className="form-label">Broker</label>
              <div className="form-input">{brokerAchDetails.brokerName}</div>
            </div>
            <div className="form-row">
              <label className="form-label">Broker ID</label>
              <div className="form-input">
                {brokerAchDetails.brokerId || "-"}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Payment Amount</label>
              <div className="form-input">
                ${brokerAchDetails.achPaymentAmount.toFixed(2)}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Bank Name</label>
              <div className="form-input">
                {brokerAchDetails.bankName || "-"}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Routing Number</label>
              <div className="form-input">
                {brokerAchDetails.routingNumber || "-"}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Account Number</label>
              <div className="form-input">
                {brokerAchDetails.accountNumber || "-"}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Account Type</label>
              <div className="form-input">
                {brokerAchDetails.accountType || "-"}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">Total Orders</label>
              <div className="form-input">
                {brokerAchDetails.orderCount || brokerOrders.length}
              </div>
            </div>
          </div>
        ) : (
          <p className="body-text">
            No unpaid confirmed/executed orders found for this broker.
          </p>
        )}
      </div>

      {/* Basket-level totals */}
      <h2 className="subheading">Baskets for Broker</h2>
      <div className="card">
        {baskets && baskets.length > 0 ? (
          <table className="basket-table">
            <thead>
              <tr>
                <th>Basket ID</th>
                <th>Order Count</th>
                <th>Total Payment Amount ($)</th>
                <th>Unique Members</th>
                <th>Unique Securities</th>
              </tr>
            </thead>
            <tbody>
              {baskets.map((b) => (
                <tr
                  key={b.basketId}
                  style={{ cursor: "pointer" }}
                  title="Click to view order details for this basket"
                  onClick={() => handleBasketClick(b.basketId)}
                >
                  <td style={{ textDecoration: "underline" }}>{b.basketId}</td>
                  <td>{b.orderCount}</td>
                  <td>{b.totalPaymentAmount.toFixed(2)}</td>
                  <td>{b.memberCount}</td>
                  <td>{b.symbolCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="body-text">
            No baskets found for this broker. Make sure there are unpaid
            confirmed/executed orders.
          </p>
        )}
      </div>
    </div>
  );
}
