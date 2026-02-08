// src/pages/PaymentsProcessing.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";
import { CheckCircle, AlertCircle, Loader2, CreditCard, Building2, Store, XCircle, History, RotateCcw } from "lucide-react";

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

  // ✅ NEW: Batch processing state
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(null);
  const [processResults, setProcessResults] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(null); // 'all' | 'merchant' | 'broker' | 'cancel-batch' | 'cancel-order' | null
  const [selectedBroker, setSelectedBroker] = useState(null);

  // ✅ NEW: Cancel/History state
  const [showHistory, setShowHistory] = useState(false);
  const [settledBatches, setSettledBatches] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedCancelBatch, setSelectedCancelBatch] = useState(null);
  const [cancelResults, setCancelResults] = useState(null);

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

  // Amount helper
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
      brokerList: Array.from(brokerSet),
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

  // Load SINGLE merchant unpaid
  const loadSingleMerchant = useCallback(async (mid) => {
    if (!mid) return;

    setMLoading(true);
    setMError("");
    try {
      const res = await apiPost("get-payments.php", { merchant_id: mid });
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

  // Check if all caught up
  const isAllCaughtUp = useMemo(() => {
    return (
      !allLoading &&
      merchantRows.length > 0 &&
      topTotals.merchants_with_unpaid === 0 &&
      topTotals.unpaid_orders === 0
    );
  }, [allLoading, merchantRows.length, topTotals]);

  // Build per-broker basket counts
  const basketCountByBroker = useMemo(() => {
    const map = new Map();
    for (const o of mOrders || []) {
      const b = (o?.broker || "Unknown").toString().trim() || "Unknown";
      if (!map.has(b)) map.set(b, new Set());
      if (o?.basket_id) map.get(b).add(o.basket_id);
    }
    const out = new Map();
    for (const [b, set] of map.entries()) out.set(b, set.size);
    return out;
  }, [mOrders]);

  // Broker Summary rows
  const brokerRows = useMemo(() => {
    if (!merchantId) return [];

    const map = new Map();

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
      row.unpaidOrders += safeNum(s?.order_count ?? s?.orders ?? s?.unpaid_orders ?? 0);
      row.totalAch += safeNum(
        s?.total_payment_due ?? s?.total_payment_amount ?? s?.total_amount ?? s?.amount_total ?? s?.ach_total ?? 0
      );
    }

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

  // ✅ NEW: Process single broker
  const processBroker = async (mid, broker) => {
    try {
      const res = await apiPost("export-payments-file.php", {
        merchant_id: mid,
        broker: broker,
      });
      return {
        merchant_id: mid,
        broker,
        success: res?.success || false,
        batch_id: res?.batch_id || null,
        order_count: res?.order_count || 0,
        total_amount: res?.total_amount || 0,
        error: res?.error || null,
        detail_csv: res?.detail_csv || null,
        ach_csv: res?.ach_csv || null,
      };
    } catch (err) {
      return {
        merchant_id: mid,
        broker,
        success: false,
        error: err.message || "Network error",
      };
    }
  };

  // ✅ NEW: Process all brokers for a merchant
  const processMerchant = async (mid, brokers) => {
    const results = [];
    for (let i = 0; i < brokers.length; i++) {
      const broker = brokers[i];
      setProcessProgress({
        type: "merchant",
        merchant_id: mid,
        current: i + 1,
        total: brokers.length,
        currentBroker: broker,
      });
      const result = await processBroker(mid, broker);
      results.push(result);
    }
    return results;
  };

  // ✅ NEW: Process ALL merchants and brokers
  const processAll = async () => {
    const allResults = [];
    const merchantsWithUnpaid = merchantRows.filter((r) => r.unpaid_orders > 0 && r.brokerList?.length > 0);
    
    let totalBrokers = 0;
    for (const m of merchantsWithUnpaid) {
      totalBrokers += m.brokerList.length;
    }

    let processed = 0;
    for (const m of merchantsWithUnpaid) {
      for (const broker of m.brokerList) {
        processed++;
        setProcessProgress({
          type: "all",
          current: processed,
          total: totalBrokers,
          currentMerchant: m.merchant_id,
          currentBroker: broker,
        });
        const result = await processBroker(m.merchant_id, broker);
        allResults.push(result);
      }
    }
    return allResults;
  };

  // ✅ NEW: Handle batch processing
  const handleBatchProcess = async (type, broker = null) => {
    setShowConfirmModal(null);
    setProcessing(true);
    setProcessResults([]);
    setProcessProgress(null);

    try {
      let results = [];

      if (type === "all") {
        results = await processAll();
      } else if (type === "merchant" && merchantId) {
        const brokers = brokerRows.map((r) => r.broker);
        results = await processMerchant(merchantId, brokers);
      } else if (type === "broker" && merchantId && broker) {
        const result = await processBroker(merchantId, broker);
        results = [result];
      }

      setProcessResults(results);

      // Refresh data after processing
      if (merchantId) {
        await loadSingleMerchant(merchantId);
      } else {
        await loadAllMerchants();
      }
    } catch (err) {
      console.error("[PaymentsProcessing] Batch processing error:", err);
    } finally {
      setProcessing(false);
      setProcessProgress(null);
    }
  };

  // ✅ NEW: Load settled payment history
  const loadSettledHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiPost("get-settled-batches.php", {
        merchant_id: merchantId || null,
        limit: 50
      });
      if (res?.success && Array.isArray(res.batches)) {
        setSettledBatches(res.batches);
      } else {
        setSettledBatches([]);
      }
    } catch (err) {
      console.error("[PaymentsProcessing] Failed to load settled history:", err);
      setSettledBatches([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ✅ NEW: Cancel a payment batch
  const handleCancelPayment = async (batchId) => {
    setShowConfirmModal(null);
    setProcessing(true);
    setCancelResults(null);

    try {
      const res = await apiPost("cancel-payment.php", {
        batch_id: batchId,
        remove_ledger: true
      });

      setCancelResults({
        success: res?.success || false,
        batch_id: batchId,
        orders_cancelled: res?.orders_cancelled || 0,
        ledger_entries_removed: res?.ledger_entries_removed || 0,
        error: res?.error || null
      });

      // Refresh data
      if (showHistory) {
        await loadSettledHistory();
      }
      if (merchantId) {
        await loadSingleMerchant(merchantId);
      } else {
        await loadAllMerchants();
      }
    } catch (err) {
      console.error("[PaymentsProcessing] Cancel payment error:", err);
      setCancelResults({
        success: false,
        batch_id: batchId,
        error: err.message || "Network error"
      });
    } finally {
      setProcessing(false);
      setSelectedCancelBatch(null);
    }
  };

  // Navigation helpers
  const goToMerchant = (mid) => mid && navigate(`/payments-processing?merchant_id=${encodeURIComponent(mid)}`);
  const backToAll = () => navigate(`/payments-processing`);

  // ✅ Confirmation Modal
  const ConfirmModal = () => {
    if (!showConfirmModal) return null;

    const getModalContent = () => {
      if (showConfirmModal === "all") {
        return {
          title: "Process All Payments",
          icon: <CreditCard size={32} color="#3b82f6" />,
          message: `This will process payments for ${topTotals.merchants_with_unpaid} merchant(s), ${topTotals.brokers} broker(s), settling ${topTotals.unpaid_orders} orders totaling ${fmtMoney(topTotals.total_payment_due)}.`,
          confirmText: "Confirm & Process",
          confirmColor: "#3b82f6",
          onConfirm: () => handleBatchProcess("all"),
          warning: (
            <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
              <li>Generate CSV export files</li>
              <li>Mark orders as "settled"</li>
              <li>Set paid_flag = 1</li>
              <li>Record paid_at timestamp</li>
            </ul>
          ),
        };
      } else if (showConfirmModal === "merchant") {
        return {
          title: "Process Merchant Payments",
          icon: <Store size={32} color="#10b981" />,
          message: `This will process payments for ${merchantAchTotals.brokers} broker(s), settling ${merchantAchTotals.unpaidOrders} orders totaling ${fmtMoney(merchantAchTotals.totalAch)}.`,
          confirmText: "Confirm & Process",
          confirmColor: "#10b981",
          onConfirm: () => handleBatchProcess("merchant"),
          warning: (
            <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
              <li>Generate CSV export files</li>
              <li>Mark orders as "settled"</li>
              <li>Set paid_flag = 1</li>
              <li>Record paid_at timestamp</li>
            </ul>
          ),
        };
      } else if (showConfirmModal === "broker") {
        const brokerData = brokerRows.find((r) => r.broker === selectedBroker);
        return {
          title: "Process Broker Payments",
          icon: <Building2 size={32} color="#f59e0b" />,
          message: `This will process payments for broker "${selectedBroker}", settling ${brokerData?.unpaidOrders || 0} orders totaling ${fmtMoney(brokerData?.totalAch || 0)}.`,
          confirmText: "Confirm & Process",
          confirmColor: "#f59e0b",
          onConfirm: () => handleBatchProcess("broker", selectedBroker),
          warning: (
            <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
              <li>Generate CSV export files</li>
              <li>Mark orders as "settled"</li>
              <li>Set paid_flag = 1</li>
              <li>Record paid_at timestamp</li>
            </ul>
          ),
        };
      } else if (showConfirmModal === "cancel-batch") {
        const batch = settledBatches.find((b) => b.batch_id === selectedCancelBatch);
        return {
          title: "Cancel Payment Batch",
          icon: <XCircle size={32} color="#ef4444" />,
          message: `This will reverse batch "${selectedCancelBatch}", restoring ${batch?.order_count || "?"} orders totaling ${fmtMoney(batch?.total_amount || 0)} back to "executed" status.`,
          confirmText: "Confirm Cancel",
          confirmColor: "#ef4444",
          onConfirm: () => handleCancelPayment(selectedCancelBatch),
          warning: (
            <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
              <li>Revert orders to "executed" status</li>
              <li>Set paid_flag = 0</li>
              <li>Clear paid_at and paid_batch_id</li>
              <li>Remove ledger entries</li>
            </ul>
          ),
          warningColor: "#fef2f2",
          warningBorder: "#ef4444",
        };
      }
      return { title: "", icon: null, message: "", onConfirm: () => {} };
    };

    const content = getModalContent();

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
        onClick={() => setShowConfirmModal(null)}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "24px",
            maxWidth: "450px",
            width: "90%",
            boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: content.warningColor || "#eff6ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              {content.icon}
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: "700" }}>{content.title}</h2>
            <p style={{ margin: 0, color: "#6b7280", fontSize: "14px", lineHeight: 1.5 }}>{content.message}</p>
          </div>

          <div
            style={{
              backgroundColor: content.warningColor || "#fef3c7",
              border: `1px solid ${content.warningBorder || "#f59e0b"}`,
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <AlertCircle size={18} color={content.warningBorder || "#d97706"} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div style={{ fontSize: "13px", color: content.warningBorder === "#ef4444" ? "#991b1b" : "#92400e" }}>
                <strong>This action will:</strong>
                {content.warning}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setShowConfirmModal(null)}
              style={{
                flex: 1,
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                backgroundColor: "white",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
            <button
              onClick={content.onConfirm}
              style={{
                flex: 1,
                padding: "12px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: content.confirmColor || "#3b82f6",
                color: "white",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              {content.confirmText || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ✅ Progress Indicator
  const ProgressIndicator = () => {
    if (!processing || !processProgress) return null;

    return (
      <div
        style={{
          backgroundColor: "#eff6ff",
          border: "2px solid #3b82f6",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <Loader2 size={20} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontWeight: "600", color: "#1e40af" }}>
            Processing... {processProgress.current} of {processProgress.total}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "#3730a3" }}>
          {processProgress.currentMerchant && <span>Merchant: {processProgress.currentMerchant} • </span>}
          Broker: {processProgress.currentBroker}
        </div>
        <div
          style={{
            marginTop: "8px",
            height: "8px",
            backgroundColor: "#dbeafe",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              backgroundColor: "#3b82f6",
              width: `${(processProgress.current / processProgress.total) * 100}%`,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  };

  // ✅ Results Summary
  const ResultsSummary = () => {
    if (processResults.length === 0) return null;

    const successful = processResults.filter((r) => r.success);
    const failed = processResults.filter((r) => !r.success);
    const totalAmount = successful.reduce((sum, r) => sum + safeNum(r.total_amount), 0);
    const totalOrders = successful.reduce((sum, r) => sum + safeNum(r.order_count), 0);

    return (
      <div
        style={{
          backgroundColor: successful.length > 0 ? "#ecfdf5" : "#fef2f2",
          border: `2px solid ${successful.length > 0 ? "#10b981" : "#ef4444"}`,
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
          {successful.length > 0 ? (
            <CheckCircle size={24} color="#10b981" />
          ) : (
            <AlertCircle size={24} color="#ef4444" />
          )}
          <span style={{ fontWeight: "700", fontSize: "16px", color: successful.length > 0 ? "#065f46" : "#991b1b" }}>
            Processing Complete
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
          <div style={{ backgroundColor: "white", borderRadius: "6px", padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#10b981" }}>{successful.length}</div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Successful</div>
          </div>
          {failed.length > 0 && (
            <div style={{ backgroundColor: "white", borderRadius: "6px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#ef4444" }}>{failed.length}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Failed</div>
            </div>
          )}
          <div style={{ backgroundColor: "white", borderRadius: "6px", padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#3b82f6" }}>{totalOrders}</div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Orders Settled</div>
          </div>
          <div style={{ backgroundColor: "white", borderRadius: "6px", padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#8b5cf6" }}>{fmtMoney(totalAmount)}</div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Total Amount</div>
          </div>
        </div>

        {/* Batch details */}
        <div style={{ marginTop: "12px" }}>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: "500", color: "#374151" }}>
              View Details ({processResults.length} batches)
            </summary>
            <div style={{ marginTop: "8px", maxHeight: "200px", overflow: "auto" }}>
              <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f3f4f6" }}>
                    <th style={{ padding: "6px", textAlign: "left" }}>Merchant</th>
                    <th style={{ padding: "6px", textAlign: "left" }}>Broker</th>
                    <th style={{ padding: "6px", textAlign: "right" }}>Orders</th>
                    <th style={{ padding: "6px", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "6px", textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {processResults.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "6px" }}>{r.merchant_id}</td>
                      <td style={{ padding: "6px" }}>{r.broker}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{r.order_count || 0}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{fmtMoney(r.total_amount || 0)}</td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        {r.success ? (
                          <span style={{ color: "#10b981" }}>✓</span>
                        ) : (
                          <span style={{ color: "#ef4444" }} title={r.error}>✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <button
          onClick={() => setProcessResults([])}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: "white",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Dismiss
        </button>
      </div>
    );
  };

  // ✅ Cancel Results Display
  const CancelResultsDisplay = () => {
    if (!cancelResults) return null;

    return (
      <div
        style={{
          backgroundColor: cancelResults.success ? "#fef3c7" : "#fef2f2",
          border: `2px solid ${cancelResults.success ? "#f59e0b" : "#ef4444"}`,
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          {cancelResults.success ? (
            <RotateCcw size={24} color="#f59e0b" />
          ) : (
            <AlertCircle size={24} color="#ef4444" />
          )}
          <span style={{ fontWeight: "700", fontSize: "16px", color: cancelResults.success ? "#92400e" : "#991b1b" }}>
            {cancelResults.success ? "Payment Cancelled Successfully" : "Cancel Failed"}
          </span>
        </div>

        {cancelResults.success ? (
          <div style={{ fontSize: "14px", color: "#78350f" }}>
            <p style={{ margin: "0 0 4px" }}>
              Batch: <code style={{ backgroundColor: "#fef3c7", padding: "2px 6px", borderRadius: "4px" }}>{cancelResults.batch_id}</code>
            </p>
            <p style={{ margin: "0 0 4px" }}>Orders reverted: <strong>{cancelResults.orders_cancelled}</strong></p>
            <p style={{ margin: 0 }}>Ledger entries removed: <strong>{cancelResults.ledger_entries_removed}</strong></p>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "14px", color: "#991b1b" }}>{cancelResults.error}</p>
        )}

        <button
          onClick={() => setCancelResults(null)}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            backgroundColor: "white",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Dismiss
        </button>
      </div>
    );
  };

  // ✅ Payment History Panel
  const PaymentHistoryPanel = () => {
    if (!showHistory) return null;

    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 className="subheading" style={{ margin: 0 }}>
            <History size={18} style={{ marginRight: "8px", verticalAlign: "middle" }} />
            Recent Settled Payments
          </h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={loadSettledHistory}
              disabled={historyLoading}
              style={{
                padding: "6px 12px",
                backgroundColor: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </button>
            <button
              onClick={() => setShowHistory(false)}
              style={{
                padding: "6px 12px",
                backgroundColor: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Close
            </button>
          </div>
        </div>

        {historyLoading ? (
          <p className="body-text">Loading payment history...</p>
        ) : settledBatches.length === 0 ? (
          <p className="body-text">No settled payment batches found.</p>
        ) : (
          <div style={{ maxHeight: "400px", overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f3f4f6", position: "sticky", top: 0 }}>
                  <th style={{ padding: "8px", textAlign: "left" }}>Batch ID</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Merchant</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Broker</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Orders</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Amount</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Paid At</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {settledBatches.map((batch) => (
                  <tr key={batch.batch_id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: "11px" }}>
                      {batch.batch_id?.substring(0, 25)}...
                    </td>
                    <td style={{ padding: "8px" }}>{batch.merchant_id}</td>
                    <td style={{ padding: "8px" }}>{batch.broker}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{batch.order_count}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{fmtMoney(batch.total_amount)}</td>
                    <td style={{ padding: "8px", fontSize: "11px" }}>{batch.paid_at}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <button
                        onClick={() => {
                          setSelectedCancelBatch(batch.batch_id);
                          setShowConfirmModal("cancel-batch");
                        }}
                        disabled={processing}
                        style={{
                          padding: "4px 8px",
                          backgroundColor: "#fef2f2",
                          color: "#dc2626",
                          border: "1px solid #fecaca",
                          borderRadius: "4px",
                          cursor: processing ? "not-allowed" : "pointer",
                          fontSize: "11px",
                          fontWeight: "500",
                        }}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // =========================================================
  // MODE B RENDER: Merchant Drilldown
  // =========================================================
  if (merchantId) {
    return (
      <div className="app-container app-content">
        <ConfirmModal />

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
                disabled={mLoading || processing}
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

        <ProgressIndicator />
        <ResultsSummary />
        <CancelResultsDisplay />
        <PaymentHistoryPanel />

        {/* ACH Totals for Merchant */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <h2 className="subheading" style={{ margin: 0 }}>ACH Totals for Merchant</h2>
            
            {/* ✅ Process All Brokers Button */}
            {merchantAchTotals.unpaidOrders > 0 && (
              <button
                onClick={() => setShowConfirmModal("merchant")}
                disabled={processing || mLoading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: processing ? "not-allowed" : "pointer",
                  fontWeight: "600",
                  fontSize: "14px",
                }}
              >
                <CreditCard size={18} />
                Process All Brokers ({merchantAchTotals.brokers})
              </button>
            )}
            
            {/* ✅ View History Button */}
            <button
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) loadSettledHistory();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                backgroundColor: showHistory ? "#fef3c7" : "#f3f4f6",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "500",
                fontSize: "14px",
              }}
            >
              <History size={18} />
              {showHistory ? "Hide History" : "Payment History"}
            </button>
          </div>

          {mLoading ? (
            <p className="body-text">Loading…</p>
          ) : (
            <div className="form-grid" style={{ marginTop: "12px" }}>
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

        {/* Broker Summary Table */}
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
                  <th style={{ textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {brokerRows.map((r) => (
                  <tr key={r.broker}>
                    <td style={{ fontWeight: "500" }}>{r.broker}</td>
                    <td>{r.unpaidOrders}</td>
                    <td>{r.unpaidBaskets}</td>
                    <td>{fmtMoney(r.totalAch)}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => {
                          setSelectedBroker(r.broker);
                          setShowConfirmModal("broker");
                        }}
                        disabled={processing || r.unpaidOrders === 0}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: r.unpaidOrders > 0 ? "#3b82f6" : "#d1d5db",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: r.unpaidOrders > 0 && !processing ? "pointer" : "not-allowed",
                          fontSize: "12px",
                          fontWeight: "500",
                        }}
                      >
                        Process
                      </button>
                    </td>
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
      <ConfirmModal />

      <h1 className="page-title">Payments Processing</h1>
      <p className="page-deck">
        Summary of <strong>unpaid</strong> ACH obligations across all merchants.
      </p>

      <ProgressIndicator />
      <ResultsSummary />
      <CancelResultsDisplay />
      <PaymentHistoryPanel />

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
          <CheckCircle size={24} color="#10b981" />
          <span style={{ fontSize: "1.125rem", fontWeight: "600", color: "#065f46" }}>
            You're all caught up! No pending payments.
          </span>
        </div>
      )}

      {/* Top summary card */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          <div className="body-text">
            {merchantsLoading ? (
              <>Loading merchants…</>
            ) : (
              <>
                Merchants: <strong>{merchants.length}</strong> • With unpaid:{" "}
                <strong>{topTotals.merchants_with_unpaid}</strong>
              </>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        {!allLoading && topTotals.unpaid_orders > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937" }}>{topTotals.unpaid_orders}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Orders</div>
            </div>
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937" }}>{topTotals.unpaid_baskets}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Baskets</div>
            </div>
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937" }}>{topTotals.brokers}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Brokers</div>
            </div>
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#10b981" }}>{fmtMoney(topTotals.total_payment_due)}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Total Due</div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadAllMerchants}
            disabled={allLoading || merchantsLoading || merchants.length === 0 || processing}
          >
            {allLoading ? "Loading…" : "Refresh"}
          </button>

          {/* ✅ Process All Button */}
          {topTotals.unpaid_orders > 0 && (
            <button
              onClick={() => setShowConfirmModal("all")}
              disabled={processing || allLoading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 24px",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: processing ? "not-allowed" : "pointer",
                fontWeight: "600",
                fontSize: "14px",
              }}
            >
              <CreditCard size={18} />
              Process All Payments
            </button>
          )}

          {/* ✅ View History Button */}
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) loadSettledHistory();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              backgroundColor: showHistory ? "#fef3c7" : "#f3f4f6",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "500",
              fontSize: "14px",
            }}
          >
            <History size={18} />
            {showHistory ? "Hide History" : "Payment History"}
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
      </div>

      {/* Merchant table */}
      <div className="card">
        <h2 className="subheading">Merchant Summary (Unpaid)</h2>

        {allLoading ? (
          <p className="body-text">Loading…</p>
        ) : merchantRows.length === 0 ? (
          <p className="body-text">No merchants loaded.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Unpaid Orders</th>
                  <th>Baskets</th>
                  <th>Brokers</th>
                  <th>Total Due ($)</th>
                  <th style={{ textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {merchantRows
                  .filter((r) => r.unpaid_orders > 0)
                  .map((r) => (
                    <tr key={r.merchant_id}>
                      <td
                        style={{ cursor: "pointer", textDecoration: "underline", color: "#2563eb" }}
                        onClick={() => goToMerchant(r.merchant_id)}
                      >
                        {r.merchant_name || r.merchant_id}
                      </td>
                      <td>{r.unpaid_orders}</td>
                      <td>{r.unpaid_baskets}</td>
                      <td>{r.brokers}</td>
                      <td>{fmtMoney(r.total_payment_due)}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => goToMerchant(r.merchant_id)}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#3b82f6",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "500",
                          }}
                        >
                          View / Process
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
