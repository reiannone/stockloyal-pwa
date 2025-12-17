// src/pages/PaymentsBasketDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function PaymentsBasketDetail() {
  const query = useQuery();
  const navigate = useNavigate();

  const merchantId = query.get("merchant_id") || "";
  const broker = query.get("broker") || "";
  const basketId = query.get("basket_id") || "";

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!merchantId) {
      setError("merchant_id is required in the URL.");
      return;
    }
    setError("");

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
        } else {
          setOrders(res.orders || []);
        }
      } catch (err) {
        console.error("[PaymentsBasketDetail] get-payments error:", err);
        if (mounted) setError("Network/server error while fetching payments.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [merchantId]);

  // Filter to this broker + basket
  const basketOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (broker && o.broker !== broker) return false;
        if (basketId && o.basket_id !== basketId) return false;
        return true;
      }),
    [orders, broker, basketId]
  );

  // Unique member IDs for this basket (display in summary)
  const basketMemberIds = useMemo(() => {
    const set = new Set();
    for (const o of basketOrders || []) {
      if (o?.member_id) set.add(String(o.member_id));
    }
    const arr = Array.from(set);
    arr.sort((a, b) => a.localeCompare(b));
    return arr;
  }, [basketOrders]);

  const basketMemberIdsDisplay = useMemo(() => {
    if (!basketMemberIds || basketMemberIds.length === 0) return "-";
    if (basketMemberIds.length === 1) return basketMemberIds[0];
    // If many, show a compact preview with count
    const preview = basketMemberIds.slice(0, 5).join(", ");
    const more = basketMemberIds.length > 5 ? ` … (+${basketMemberIds.length - 5} more)` : "";
    return `${preview}${more}`;
  }, [basketMemberIds]);

  const totals = useMemo(() => {
    if (!basketOrders || basketOrders.length === 0) {
      return {
        totalOrders: 0,
        totalPaymentAmount: 0,
      };
    }
    let totalPaymentAmount = 0;
    for (const o of basketOrders) {
      const payment =
        o.payment_amount != null
          ? Number(o.payment_amount)
          : o.executed_amount != null
          ? Number(o.executed_amount)
          : o.amount != null
          ? Number(o.amount)
          : 0;
      if (!Number.isNaN(payment)) {
        totalPaymentAmount += payment;
      }
    }
    return {
      totalOrders: basketOrders.length,
      totalPaymentAmount,
    };
  }, [basketOrders]);

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Basket Order Details</h1>
      <p className="page-deck">
        Detailed view of all orders in basket{" "}
        <strong>{basketId || "(missing)"}</strong> for broker{" "}
        <strong>{broker || "(missing)"}</strong> under merchant{" "}
        <code>{merchantId || "(missing)"}</code>.
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="card-actions" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(-1)}
          >
            &larr; Back to Broker View
          </button>
        </div>

        {loading && (
          <p className="body-text" style={{ marginTop: "0.5rem" }}>
            Loading...
          </p>
        )}

        {error && (
          <p
            className="body-text"
            style={{ color: "#dc2626", marginTop: "0.5rem" }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Basket totals */}
      <h2 className="subheading">Basket Totals</h2>
      <div className="card" style={{ marginBottom: "1rem" }}>
        {basketOrders && basketOrders.length > 0 ? (
          <div className="form-grid">
            <div className="form-row">
              <label className="form-label">Member ID(s)</label>
              <div className="form-input" title={basketMemberIds.join(", ")}>
                {basketMemberIdsDisplay}
              </div>
            </div>

            <div className="form-row">
              <label className="form-label">Total Orders in Basket</label>
              <div className="form-input">{totals.totalOrders}</div>
            </div>

            <div className="form-row">
              <label className="form-label">Total Payment Amount</label>
              <div className="form-input">
                ${totals.totalPaymentAmount.toFixed(2)}
              </div>
            </div>
          </div>
        ) : (
          <p className="body-text">
            No matching orders found for this basket/broker/merchant
            combination.
          </p>
        )}
      </div>

      {/* Detailed orders table */}
      <h2 className="subheading">Orders (Detail)</h2>
      <div className="card">
        {basketOrders && basketOrders.length > 0 ? (
          <div style={{ maxHeight: "400px", overflow: "auto" }}>
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  {/* Member ID removed (now shown in summary) */}
                  <th>Symbol</th>
                  <th>Status</th>
                  <th>Requested Amount ($)</th>
                  <th>Executed Amount ($)</th>
                  <th>Shares</th>
                  <th>Executed Shares</th>
                  <th>Placed At</th>
                  <th>Executed At</th>
                </tr>
              </thead>
              <tbody>
                {basketOrders.map((o) => (
                  <tr key={o.order_id}>
                    <td>{o.order_id}</td>
                    <td>{o.symbol}</td>
                    <td>{o.status}</td>
                    <td>
                      {o.amount != null ? Number(o.amount).toFixed(2) : "-"}
                    </td>
                    <td>
                      {o.executed_amount != null
                        ? Number(o.executed_amount).toFixed(2)
                        : "-"}
                    </td>
                    <td>
                      {o.shares != null ? Number(o.shares).toFixed(4) : "-"}
                    </td>
                    <td>
                      {o.executed_shares != null
                        ? Number(o.executed_shares).toFixed(4)
                        : "-"}
                    </td>
                    <td>{o.placed_at || ""}</td>
                    <td>{o.executed_at || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="body-text">No orders to display for this basket.</p>
        )}
      </div>
    </div>
  );
}
