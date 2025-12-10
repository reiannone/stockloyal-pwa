// src/pages/PaymentsProcessing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiPost, apiGet } from "../api.js";

export default function PaymentsProcessing() {
  const [merchantId, setMerchantId] = useState("");
  const [merchants, setMerchants] = useState([]);
  const [merchantsLoading, setMerchantsLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [error, setError] = useState("");
  const [exportResult, setExportResult] = useState(null);
  const [markResult, setMarkResult] = useState(null);

  // Filters / selection
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [selectedUsername, setSelectedUsername] = useState(null);

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
    setExportResult(null);

    // reset filters on reload
    setSelectedBroker(null);
    setSelectedUsername(null);

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

  const handleExport = async () => {
    if (!merchantId) {
      setError("Please select a merchant before export.");
      return;
    }
    if (!selectedBroker) {
      setError("Please select a broker before generating the SFTP file.");
      return;
    }

    setError("");
    setLoading(true);
    setExportResult(null);

    try {
      const res = await apiPost("export-payments-file.php", {
        merchant_id: merchantId,
        broker: selectedBroker, // per-broker export
      });
      if (!res?.success) {
        setError(res?.error || "Failed to generate export file.");
      } else {
        setExportResult(res);
      }
    } catch (err) {
      console.error("[PaymentsProcessing] export error:", err);
      setError("Network/server error while generating export file.");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!merchantId) {
      setError("Please select a merchant before marking paid.");
      return;
    }
    setError("");
    setLoading(true);
    setExportResult(null);

    try {
      const res = await apiPost("mark-payments-paid.php", {
        merchant_id: merchantId,
      });
      if (!res?.success) {
        setError(res?.error || "Failed to mark orders as paid.");
        setMarkResult(null);
      } else {
        setMarkResult(res);
        await fetchPayments(merchantId); // reload unpaid queue
      }
    } catch (err) {
      console.error("[PaymentsProcessing] mark-payments-paid error:", err);
      setError("Network/server error while marking orders as paid.");
    } finally {
      setLoading(false);
    }
  };

  // Filter detail orders based on broker / username
  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (selectedBroker && o.broker !== selectedBroker) return false;
        if (selectedUsername && o.broker_username !== selectedUsername)
          return false;
        return true;
      }),
    [orders, selectedBroker, selectedUsername]
  );

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

  // List of brokers (for dropdown) from summary
  const brokerOptions = useMemo(() => {
    const set = new Set();
    summary.forEach((row) => {
      if (row.broker) set.add(row.broker);
    });
    return Array.from(set);
  }, [summary]);

  // ACH details for the selected broker, pulled from summary (joined to broker_master)
  const selectedBrokerSummary = useMemo(() => {
    if (!selectedBroker) return null;
    return summary.find((row) => row.broker === selectedBroker) || null;
  }, [summary, selectedBroker]);

  const brokerAchDetails = useMemo(() => {
    if (!selectedBrokerSummary) {
      return {
        brokerName: "",
        brokerId: "",
        achPaymentAmount: 0,
        bankName: "",
        routingNumber: "",
        accountNumber: "",
        accountType: "",
      };
    }

    return {
      brokerName: selectedBrokerSummary.broker || "",
      brokerId: selectedBrokerSummary.broker_id || "",
      achPaymentAmount: Number(
        selectedBrokerSummary.total_payment_amount || 0
      ),
      bankName: selectedBrokerSummary.ach_bank_name || "",
      routingNumber: selectedBrokerSummary.ach_routing_num || "",
      accountNumber: selectedBrokerSummary.ach_account_num || "",
      accountType: selectedBrokerSummary.ach_account_type || "",
    };
  }, [selectedBrokerSummary]);

  const selectedMerchantLabel =
    merchants.find((m) => m.merchant_id === merchantId)?.merchant_name ||
    merchantId ||
    "";

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Payments Processing</h1>
      <p className="page-deck">
        Calculate payment due per broker for confirmed / executed orders and
        generate an SFTP-ready export file for a selected{" "}
        <code>merchant_id</code>. You can also mark unpaid orders as paid once
        a settlement batch has been sent to the broker.
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

          {/* NEW: Broker selector (drives ACH + export) */}
          <div className="form-row">
            <label className="form-label">Broker (for ACH / Export):</label>
            <select
              className="form-input"
              value={selectedBroker || ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setSelectedBroker(val);
                setSelectedUsername(null);
              }}
              disabled={brokerOptions.length === 0}
            >
              <option value="">
                {brokerOptions.length === 0
                  ? "Load orders to see brokers…"
                  : "Select a broker…"}
              </option>
              {brokerOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div
            className="card-actions"
            style={{ gap: "0.5rem", flexWrap: "wrap" }}
          >
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Processing..." : "Load Confirmed/Executed Orders"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExport}
              disabled={loading || !merchantId}
            >
              Generate SFTP File
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleMarkPaid}
              disabled={loading || !merchantId || orders.length === 0}
            >
              Mark Current Orders as Paid
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

      {/* ACH + Merchant totals as structured form view */}
      <h2 className="subheading">
        Settlement Summary{" "}
        {selectedMerchantLabel && (
          <span className="body-text">
            (merchant <strong>{selectedMerchantLabel}</strong>, unpaid only)
          </span>
        )}
      </h2>
      <div className="card" style={{ marginBottom: "1rem" }}>
        {orders && orders.length > 0 ? (
          <div className="form-grid">
            {/* Broker ACH block */}
            <div className="form-row">
              <label className="form-label">Broker</label>
              <div className="form-input">
                {brokerAchDetails.brokerName ||
                  "Select a broker above or in the summary below"}
              </div>
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
                $
                {brokerAchDetails.achPaymentAmount
                  ? brokerAchDetails.achPaymentAmount.toFixed(2)
                  : "0.00"}
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

            {/* Divider */}
            <div
              className="form-row"
              style={{ borderTop: "1px solid #e5e7eb", marginTop: "0.75rem" }}
            />

            {/* Merchant totals */}
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
            No orders loaded yet. Select a merchant and click &quot;Load
            Confirmed/Executed Orders&quot;.
          </p>
        )}
      </div>

      {/* Summary by broker */}
      <h2 className="subheading">Broker Payment Summary</h2>
      <div className="card" style={{ marginBottom: "1rem" }}>
        {summary && summary.length > 0 ? (
          <table className="basket-table">
            <thead>
              <tr>
                <th>Broker</th>
                <th>Broker Username</th>
                <th>Order Count</th>
                <th>Total Payment Due ($)</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr
                  key={`${row.broker || "n/a"}-${row.broker_username || "n/a"}`}
                >
                  {/* Broker click → drives ACH + dropdown + detail filter */}
                  <td
                    style={{
                      cursor: "pointer",
                      textDecoration: "underline",
                      backgroundColor:
                        selectedBroker === row.broker
                          ? "rgba(59,130,246,0.08)"
                          : "",
                    }}
                    title="Click to drive ACH details and filter orders by this broker"
                    onClick={() => {
                      const next =
                        selectedBroker === row.broker ? null : row.broker;
                      setSelectedBroker(next);
                      setSelectedUsername(null);
                    }}
                  >
                    {row.broker}
                  </td>

                  {/* Broker Username click → filters detail only */}
                  <td
                    style={{
                      cursor: "pointer",
                      textDecoration: "underline",
                      backgroundColor:
                        selectedUsername === row.broker_username
                          ? "rgba(59,130,246,0.08)"
                          : "",
                    }}
                    title="Click to filter detail by this broker username"
                    onClick={() => {
                      const next =
                        selectedUsername === row.broker_username
                          ? null
                          : row.broker_username;
                      setSelectedUsername(next);
                      setSelectedBroker(null);
                    }}
                  >
                    {row.broker_username || "-"}
                  </td>

                  <td>{row.order_count}</td>
                  <td>{Number(row.total_payment_amount || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="body-text">No summary available. Load a merchant first.</p>
        )}
      </div>

      {/* Detail header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <h2 className="subheading" style={{ marginBottom: 0 }}>
          Confirmed / Executed Orders (Detail)
        </h2>

        {selectedBroker && (
          <span className="body-text">
            Filtering by broker: <strong>{selectedBroker}</strong>
          </span>
        )}

        {selectedUsername && (
          <span className="body-text">
            Filtering by username: <strong>{selectedUsername}</strong>
          </span>
        )}

        {(selectedBroker || selectedUsername) && (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              setSelectedBroker(null);
              setSelectedUsername(null);
            }}
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* Detail table */}
      <div className="card">
        {filteredOrders && filteredOrders.length > 0 ? (
          <div style={{ maxHeight: "400px", overflow: "auto" }}>
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Broker</th>
                  <th>Broker Username</th>
                  <th>Member ID</th>
                  <th>Basket ID</th>
                  <th>Symbol</th>
                  <th>Status</th>
                  <th>Requested Amount ($)</th>
                  <th>Executed Amount ($)</th>
                  <th>Placed At</th>
                  <th>Executed At</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.order_id}>
                    <td>{o.order_id}</td>
                    <td>{o.broker}</td>
                    <td>{o.broker_username || "-"}</td>
                    <td>{o.member_id}</td>
                    <td>{o.basket_id}</td>
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
                    <td>{o.placed_at || ""}</td>
                    <td>{o.executed_at || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="body-text">
            No confirmed or executed orders
            {selectedBroker || selectedUsername
              ? " for this filter."
              : " found for this merchant."}
          </p>
        )}
      </div>
    </div>
  );
}
