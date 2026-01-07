// src/pages/PaymentsBroker.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function normalizeExportResult(res) {
  // Supports:
  // A) NEW: { success:true, detail_csv:{filename,relative_path,url}, ach_csv:{...}, legacy_csv:{...} }
  // B) OLD: { success:true, detail_filename, detail_relative_path, ach_filename, ach_relative_path }
  // C) ALT: { success:true, files:[ {type:'detail'|'ach', filename, relative_path, url} ] }
  if (!res || !res.success) return null;

  let detail = null;
  let ach = null;

  // NEW canonical format
  if (res.detail_csv) {
    detail = {
      filename: res.detail_csv.filename || "",
      relative_path: res.detail_csv.relative_path || "",
      url: res.detail_csv.url || "",
    };
  }
  if (res.ach_csv) {
    ach = {
      filename: res.ach_csv.filename || "",
      relative_path: res.ach_csv.relative_path || "",
      url: res.ach_csv.url || "",
    };
  }

  // ALT array format
  if ((!detail || !ach) && Array.isArray(res.files)) {
    for (const f of res.files) {
      if (!f) continue;
      const t = String(f.type || "").toLowerCase();
      if (!detail && (t === "detail" || t === "details" || t === "orders")) {
        detail = {
          filename: f.filename || "",
          relative_path: f.relative_path || "",
          url: f.url || "",
        };
      }
      if (!ach && (t === "ach" || t === "payment" || t === "settlement")) {
        ach = {
          filename: f.filename || "",
          relative_path: f.relative_path || "",
          url: f.url || "",
        };
      }
    }
  }

  // OLD direct fields
  if (!detail && (res.detail_filename || res.detail_relative_path)) {
    detail = {
      filename: res.detail_filename || res.filename || "",
      relative_path: res.detail_relative_path || res.relative_path || "",
      url: res.detail_url || "",
    };
  }
  if (!ach && (res.ach_filename || res.ach_relative_path)) {
    ach = {
      filename: res.ach_filename || "",
      relative_path: res.ach_relative_path || "",
      url: res.ach_url || "",
    };
  }

  // Legacy (optional)
  const legacy =
    res.legacy_csv || res.filename || res.relative_path
      ? {
          filename:
            (typeof res.legacy_csv === "object" && res.legacy_csv?.filename) ||
            res.filename ||
            "",
          relative_path:
            (typeof res.legacy_csv === "object" && res.legacy_csv?.relative_path) ||
            res.relative_path ||
            "",
          url:
            (typeof res.legacy_csv === "object" && res.legacy_csv?.url) ||
            res.url ||
            "",
        }
      : null;

  return { raw: res, detail, ach, legacy };
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
        const res = await apiPost("get-payments.php", { merchant_id: merchantId });
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
    () => orders.filter((o) => (!broker ? true : o.broker === broker)),
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

      if (!Number.isNaN(payment)) entry.totalPaymentAmount += payment;
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
    // Calculate actual order count from brokerOrders (not backend's misnamed field)
    const actualOrderCount = brokerOrders.length;
    
    // Calculate unique members count
    const uniqueMembers = new Set(
      brokerOrders.map(o => o.member_id).filter(Boolean)
    ).size;
    
    // Calculate unique baskets count
    const uniqueBaskets = new Set(
      brokerOrders.map(o => o.basket_id).filter(Boolean)
    ).size;
    
    if (!brokerSummary) {
      return {
        brokerName: broker || "",
        brokerId: "",
        achPaymentAmount: 0,
        bankName: "",
        routingNumber: "",
        accountNumber: "",
        accountType: "",
        orderCount: actualOrderCount,
        uniqueMembers: uniqueMembers,
        uniqueBaskets: uniqueBaskets,
      };
    }

    return {
      brokerName: brokerSummary.broker || broker || "",
      brokerId: brokerSummary.broker_id || "",
      achPaymentAmount: Number(
        brokerSummary.total_payment_due ??
          brokerSummary.total_payment_amount ??
          brokerSummary.total_amount ??
          0
      ),
      bankName: brokerSummary.ach_bank_name || "",
      routingNumber: brokerSummary.ach_routing_num || "",
      accountNumber: brokerSummary.ach_account_num || "",
      accountType: brokerSummary.ach_account_type || "",
      orderCount: actualOrderCount, // Use calculated count, not backend's order_count field
      uniqueMembers: uniqueMembers,
      uniqueBaskets: uniqueBaskets,
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
        setError(res?.error || "Failed to generate export files.");
        setExportResult(null);
      } else {
        setExportResult(normalizeExportResult(res));
      }
    } catch (err) {
      console.error("[PaymentsBroker] export error:", err);
      setError("Network/server error while generating export files.");
      setExportResult(null);
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

  const handleDownload = async (fileObj, fileType) => {
    if (!fileObj?.url) {
      alert("No download URL available");
      return;
    }

    try {
      let downloadUrl = fileObj.url;
      
      console.log('[PaymentsBroker] Original URL:', downloadUrl);
      
      // If it's a relative path, construct the full API URL
      if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
        // Get the API base from window or default
        const apiBase = window.__VITE_API_BASE__ || 'https://api.stockloyal.com/api';
        
        // Remove leading slashes and 'api/' prefix if present
        const cleanPath = downloadUrl.replace(/^\/+/, '').replace(/^api\/+/, '');
        
        // Construct full URL
        downloadUrl = `${apiBase.replace(/\/+$/, '')}/${cleanPath}`;
      }
      
      console.log('[PaymentsBroker] Final download URL:', downloadUrl);

      // Create a temporary anchor element and trigger download
      // This bypasses CORS since it's a direct navigation, not a fetch
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileObj.filename || `${fileType}_export.csv`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup after a short delay
      setTimeout(() => {
        document.body.removeChild(a);
      }, 100);
      
      console.log('[PaymentsBroker] Download initiated successfully');
    } catch (err) {
      console.error(`[PaymentsBroker] Download error for ${fileType}:`, err);
      alert(`Failed to download ${fileType} file: ${err.message}\n\nCheck browser console for details.`);
    }
  };

  const renderDownload = (fileObj, fileType) => {
    if (!fileObj) return <code>(missing from response)</code>;

    // Preferred: clickable URL with download trigger
    if (fileObj.url) {
      return (
        <button
          type="button"
          onClick={() => handleDownload(fileObj, fileType)}
          style={{ 
            color: "#2563eb", 
            textDecoration: "underline",
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit"
          }}
        >
          {fileObj.filename || fileObj.url}
        </button>
      );
    }

    // Fallback: show filename and/or relative path
    return (
      <>
        <code>{fileObj.filename || "(no filename)"}</code>
        {fileObj.relative_path ? (
          <>
            <br />
            <span>
              Server path: <code>{fileObj.relative_path}</code>
            </span>
          </>
        ) : null}
      </>
    );
  };

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Broker Settlement</h1>
      <p className="page-deck">
        ACH settlement view for broker <strong>{broker || "(all brokers)"}</strong>{" "}
        under merchant <code>{merchantId || "(missing)"}</code>.
        <br />
        Export generates <strong>two CSV files</strong>: a detailed order file and a
        single-line ACH payment record for this broker.
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="card-actions" style={{ marginBottom: "0.75rem" }}>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            &larr; Back to Payments Processing
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleExport}
            disabled={loading || !merchantId || !broker}
            title={!broker ? "Select a broker first" : "Generate export CSVs"}
          >
            {loading ? "Processing…" : "Generate Broker CSVs (Detail + ACH)"}
          </button>
        </div>

        {error && (
          <p className="body-text" style={{ color: "#dc2626", marginTop: "0.5rem" }}>
            {error}
          </p>
        )}

        {exportResult?.raw?.success && (
          <div className="body-text" style={{ marginTop: "0.5rem" }}>
            <strong>Export created:</strong>

            <div style={{ marginTop: "0.5rem" }}>
              <div style={{ marginBottom: "0.35rem" }}>
                <strong>1) Detail CSV:</strong> {renderDownload(exportResult.detail, "detail")}
              </div>

              <div style={{ marginBottom: "0.35rem" }}>
                <strong>2) ACH CSV (single payment record):</strong>{" "}
                {renderDownload(exportResult.ach, "ach")}
              </div>

              {/* Backward-compatible legacy display */}
              {!exportResult.detail?.filename &&
              !exportResult.detail?.url &&
              exportResult.raw?.filename ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <strong>Legacy filename:</strong> <code>{exportResult.raw.filename}</code>
                </div>
              ) : exportResult.legacy?.filename || exportResult.legacy?.url ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <strong>Legacy CSV:</strong> {renderDownload(exportResult.legacy, "legacy")}
                </div>
              ) : null}
            </div>
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
              <div className="form-input">{brokerAchDetails.brokerId || "-"}</div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Payment Amount</label>
              <div className="form-input">${brokerAchDetails.achPaymentAmount.toFixed(2)}</div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Bank Name</label>
              <div className="form-input">{brokerAchDetails.bankName || "-"}</div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Routing Number</label>
              <div className="form-input">{brokerAchDetails.routingNumber || "-"}</div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Account Number</label>
              <div className="form-input">{brokerAchDetails.accountNumber || "-"}</div>
            </div>
            <div className="form-row">
              <label className="form-label">ACH Account Type</label>
              <div className="form-input">{brokerAchDetails.accountType || "-"}</div>
            </div>
            <div className="form-row">
              <label className="form-label">Total Orders</label>
              <div className="form-input">{brokerAchDetails.orderCount}</div>
            </div>
            <div className="form-row">
              <label className="form-label">Unique Members</label>
              <div className="form-input">{brokerAchDetails.uniqueMembers}</div>
            </div>
            <div className="form-row">
              <label className="form-label">Total Baskets</label>
              <div className="form-input">{brokerAchDetails.uniqueBaskets}</div>
            </div>
          </div>
        ) : (
          <p className="body-text">No unpaid confirmed/executed orders found for this broker.</p>
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
            No baskets found for this broker. Make sure there are unpaid confirmed/executed orders.
          </p>
        )}
      </div>
    </div>
  );
}
