// src/pages/PaymentsProcessing.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";
import {
  CheckCircle, AlertCircle, Loader2, CreditCard, Building2, Store,
  XCircle, History, RotateCcw, RefreshCw, ChevronUp, ChevronDown,
  ShoppingBasket, FileSpreadsheet, Download, Clock, Info, Zap,
} from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";

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

  // ── Core state ──
  const [merchants, setMerchants] = useState([]);
  const [merchantsLoading, setMerchantsLoading] = useState(true);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState("");
  const [allOrders, setAllOrders] = useState([]); // flat order array for hierarchy
  const [mLoading, setMLoading] = useState(false);
  const [mError, setMError] = useState("");
  const [mOrders, setMOrders] = useState([]);
  const [mSummary, setMSummary] = useState([]);
  const [activeTab, setActiveTab] = useState("unpaid");

  // ── Batch processing ──
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(null);
  const [processResults, setProcessResults] = useState([]);

  // ── Modal ──
  const [modal, setModal] = useState({
    show: false, title: "", message: "", details: null,
    icon: <CreditCard size={20} color="#3b82f6" />,
    confirmText: "Confirm", confirmColor: "#3b82f6", data: null,
  });
  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  // ── History ──
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [cancelResults, setCancelResults] = useState(null);

  // Pipeline queue counts
  const [queueCounts, setQueueCounts] = useState(null);

  // ── Merchant funding methods (plaid vs manual_ach) ──
  const [fundingMethods, setFundingMethods] = useState({}); // { merchant_id: 'plaid' | 'manual_ach' }
  useEffect(() => {
    (async () => {
      try {
        const data = await apiPost("admin-queue-counts.php");
        if (data?.success) setQueueCounts(data.counts);
      } catch (err) {
        console.warn("[PaymentsProcessing] queue counts fetch failed:", err);
      }
    })();
  }, []);

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
        // Build funding method lookup
        const fm = {};
        for (const m of res?.merchants || []) {
          fm[m.merchant_id] = m.funding_method || "manual_ach";
        }
        setFundingMethods(fm);
      } catch (e) {
        if (mounted) setMerchants([]);
      } finally {
        if (mounted) setMerchantsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const merchantName = useMemo(() => {
    if (!merchantId) return "";
    return merchants.find((x) => x.merchant_id === merchantId)?.merchant_name || "";
  }, [merchants, merchantId]);

  const getOrderPaymentAmount = (o) =>
    safeNum(o?.payment_amount ?? o?.executed_amount ?? o?.amount ?? 0);

  // ── Load ALL merchants unpaid (flat orders array) ──
  const loadAllMerchants = useCallback(async () => {
    if (!merchants?.length) return;
    setAllLoading(true);
    setAllError("");
    try {
      const flat = [];
      await Promise.all(
        merchants.map(async (m) => {
          try {
            const res = await apiPost("get-payments.php", { merchant_id: m.merchant_id });
            const orders = Array.isArray(res?.orders) ? res.orders : [];
            for (const o of orders) {
              flat.push({ ...o, merchant_name: m.merchant_name || m.merchant_id });
            }
          } catch (e) {
            console.error("[PaymentsProcessing] get-payments failed for", m.merchant_id, e);
          }
        })
      );
      setAllOrders(flat);
    } catch (e) {
      setAllError("Failed to load merchant funding summary.");
      setAllOrders([]);
    } finally {
      setAllLoading(false);
    }
  }, [merchants]);

  // ── Load SINGLE merchant unpaid ──
  const loadSingleMerchant = useCallback(async (mid) => {
    if (!mid) return;
    setMLoading(true);
    setMError("");
    try {
      const res = await apiPost("get-payments.php", { merchant_id: mid });
      if (!res?.success) {
        setMOrders([]);
        setMSummary([]);
        setMError(res?.error || "Failed to load.");
        return;
      }
      // Tag orders with merchant_name
      const mName = merchants.find((x) => x.merchant_id === mid)?.merchant_name || mid;
      const orders = (res.orders || []).map((o) => ({ ...o, merchant_name: mName }));
      setMOrders(orders);
      setMSummary(Array.isArray(res.summary) ? res.summary : []);
    } catch (e) {
      setMOrders([]);
      setMSummary([]);
      setMError("Failed to load merchant funding data.");
    } finally {
      setMLoading(false);
    }
  }, [merchants]);

  useEffect(() => {
    if (merchantId) {
      loadSingleMerchant(merchantId);
    } else if (!merchantsLoading && merchants.length > 0) {
      loadAllMerchants();
    }
  }, [merchantId, merchantsLoading, merchants.length, loadAllMerchants, loadSingleMerchant]);

  // ── Load funding history ──
  const loadHistory = useCallback(async (loadMore = false) => {
    setHistoryLoading(true);
    try {
      const offset = loadMore ? history.length : 0;
      const res = await apiPost("get-settled-batches.php", {
        merchant_id: merchantId || null, limit: 25, offset,
      });
      if (res?.success && Array.isArray(res.batches)) {
        if (loadMore) setHistory((prev) => [...prev, ...res.batches]);
        else setHistory(res.batches);
        setHistoryHasMore(res.has_more || false);
        setHistoryTotal(res.total || 0);
      } else {
        if (!loadMore) setHistory([]);
        setHistoryHasMore(false);
      }
    } catch (err) {
      if (!loadMore) setHistory([]);
      setHistoryHasMore(false);
    } finally {
      setHistoryLoading(false);
    }
  }, [merchantId, history.length]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab]);

  // ── Broker summary map (for ACH details) ──
  const brokerDetailsMap = useMemo(() => {
    const map = {};
    for (const s of mSummary || []) {
      const b = (s?.broker || "Unknown").toString().trim();
      if (!map[b]) {
        map[b] = {
          broker_id: s.broker_id || "",
          ach_bank_name: s.ach_bank_name || "",
          ach_routing_num: s.ach_routing_num || "",
          ach_account_num: s.ach_account_num || "",
          ach_account_type: s.ach_account_type || "",
        };
      }
    }
    return map;
  }, [mSummary]);

  // ── Summary stats ──
  const orders = merchantId ? mOrders : allOrders;
  const topTotals = useMemo(() => {
    const merchantSet = new Set();
    const brokerSet = new Set();
    const basketSet = new Set();
    const memberSet = new Set();
    let totalDue = 0;
    for (const o of orders) {
      if (o.merchant_id) merchantSet.add(o.merchant_id);
      if (o.broker) brokerSet.add(o.broker);
      if (o.basket_id) basketSet.add(o.basket_id);
      if (o.member_id) memberSet.add(o.member_id);
      totalDue += getOrderPaymentAmount(o);
    }
    return {
      merchants: merchantSet.size, brokers: brokerSet.size,
      baskets: basketSet.size, members: memberSet.size,
      orders: orders.length, totalDue,
    };
  }, [orders]);

  // ── Process functions ──
  const processBroker = async (mid, broker) => {
    const method = fundingMethods[mid] || "manual_ach";

    try {
      if (method === "plaid") {
        // ── Plaid Transfer: ACH debit from merchant's linked bank ──
        const res = await apiPost("plaid-initiate-funding.php", {
          merchant_id: mid, broker,
        });
        return {
          merchant_id: mid, broker, funding_method: "plaid",
          success: res?.success || false,
          transfer_id: res?.transfer_id || null,
          authorization_id: res?.authorization_id || null,
          batch_id: res?.batch_id || null,
          order_count: res?.order_count || 0,
          total_amount: res?.amount || 0,
          status: res?.status || "pending",
          network: res?.network || "ach",
          expected_settlement: res?.expected_settlement || null,
          institution: res?.institution || null,
          account_mask: res?.account_mask || null,
          error: res?.error || null,
        };
      } else {
        // ── Manual ACH: Generate XLSX + CSV export files ──
        const res = await apiPost("export-payments-file.php", { merchant_id: mid, broker });
        return {
          merchant_id: mid, broker, funding_method: "manual_ach",
          success: res?.success || false,
          batch_id: res?.batch_id || null,
          order_count: res?.order_count || 0,
          total_amount: res?.total_amount || 0,
          error: res?.error || null,
          xlsx: res?.xlsx || null,
          detail_csv: res?.detail_csv || null,
          ach_csv: res?.ach_csv || null,
        };
      }
    } catch (err) {
      return { merchant_id: mid, broker, funding_method: method, success: false, error: err.message };
    }
  };

  const handleBatchProcess = async (type, data = {}) => {
    closeModal();
    setProcessing(true);
    setProcessResults([]);
    setProcessProgress(null);

    try {
      let results = [];

      if (type === "all") {
        // Build merchant→broker map from orders
        const map = {};
        for (const o of orders) {
          const mid = o.merchant_id || "unknown";
          const br = o.broker || "Unknown";
          if (!map[mid]) map[mid] = new Set();
          map[mid].add(br);
        }
        const pairs = [];
        for (const [mid, brokers] of Object.entries(map)) {
          for (const br of brokers) pairs.push({ mid, broker: br });
        }
        for (let i = 0; i < pairs.length; i++) {
          setProcessProgress({ current: i + 1, total: pairs.length, currentBroker: pairs[i].broker, currentMerchant: pairs[i].mid });
          results.push(await processBroker(pairs[i].mid, pairs[i].broker));
        }
      } else if (type === "merchant") {
        const mid = data.merchantId;
        const brokerSet = new Set();
        for (const o of orders) {
          if (o.merchant_id === mid && o.broker) brokerSet.add(o.broker);
        }
        const brokers = Array.from(brokerSet);
        for (let i = 0; i < brokers.length; i++) {
          setProcessProgress({ current: i + 1, total: brokers.length, currentBroker: brokers[i], currentMerchant: mid });
          results.push(await processBroker(mid, brokers[i]));
        }
      } else if (type === "broker") {
        setProcessProgress({ current: 1, total: 1, currentBroker: data.broker, currentMerchant: data.merchantId });
        results.push(await processBroker(data.merchantId, data.broker));
      }

      setProcessResults(results);

      // Refresh
      if (merchantId) await loadSingleMerchant(merchantId);
      else await loadAllMerchants();
    } catch (err) {
      console.error("[PaymentsProcessing] Batch processing error:", err);
    } finally {
      setProcessing(false);
      setProcessProgress(null);
    }
  };

  // ── Cancel funding ──
  const handleCancelFunding = async (batchId) => {
    closeModal();
    setProcessing(true);
    setCancelResults(null);
    try {
      const res = await apiPost("cancel-payment.php", { batch_id: batchId, remove_ledger: true });
      setCancelResults({
        success: res?.success || false, batch_id: batchId,
        orders_cancelled: res?.orders_cancelled || 0,
        ledger_entries_removed: res?.ledger_entries_removed || 0,
        error: res?.error || null,
      });
      if (activeTab === "history") await loadHistory();
      if (merchantId) await loadSingleMerchant(merchantId);
      else await loadAllMerchants();
    } catch (err) {
      setCancelResults({ success: false, batch_id: batchId, error: err.message });
    } finally {
      setProcessing(false);
    }
  };

  // ── Confirm handlers ──
  const confirmProcessAll = () => {
    const plaidCount = Object.values(fundingMethods).filter(m => m === "plaid").length;
    const manualCount = Object.values(fundingMethods).filter(m => m !== "plaid").length;
    setModal({
      show: true, title: "Fund IB Sweep Account",
      message: `Process IB sweep funding for ${topTotals.merchants} merchant(s), ${topTotals.brokers} broker(s), funding ${topTotals.orders} approved orders totaling ${fmtMoney(topTotals.totalDue)}.`,
      details: (
        <div style={{ fontSize: "0.82rem", color: "#92400e", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
          <strong>This will:</strong>
          {plaidCount > 0 && <div style={{ marginTop: 4 }}>⚡ Plaid merchants: Initiate ACH debit from linked bank accounts</div>}
          {manualCount > 0 && <div style={{ marginTop: 4 }}>📄 Manual merchants: Generate XLSX + CSV export files</div>}
          <div style={{ marginTop: 4 }}>Mark orders as funded, record transfers to StockLoyal IB sweep account.</div>
        </div>
      ),
      icon: <CreditCard size={20} color="#3b82f6" />,
      confirmText: "Confirm & Process", confirmColor: "#3b82f6",
      data: { type: "all" },
    });
  };

  const confirmProcessMerchant = (mid, mName, count, amount) => {
    const isPlaid = fundingMethods[mid] === "plaid";
    setModal({
      show: true, title: isPlaid ? "Plaid ACH Debit" : "Fund Merchant to IB Sweep",
      message: `Process IB sweep funding for ${mName || mid}: ${count} approved orders totaling ${fmtMoney(amount)}.${isPlaid ? " Funds will be debited from the merchant's linked bank account via Plaid." : ""}`,
      icon: isPlaid ? <Zap size={20} color="#8b5cf6" /> : <Store size={20} color="#8b5cf6" />,
      confirmText: "Confirm & Process", confirmColor: "#10b981",
      data: { type: "merchant", merchantId: mid },
    });
  };

  const confirmProcessBroker = (mid, broker, count, amount) => {
    const isPlaid = fundingMethods[mid] === "plaid";
    setModal({
      show: true, title: isPlaid ? "Plaid ACH Debit — Broker" : "Fund Broker to IB Sweep",
      message: `Process IB sweep funding for broker "${broker}": ${count} approved orders totaling ${fmtMoney(amount)}.${isPlaid ? " ACH debit via Plaid Transfer." : ""}`,
      icon: isPlaid ? <Zap size={20} color="#f59e0b" /> : <Building2 size={20} color="#f59e0b" />,
      confirmText: "Confirm & Process", confirmColor: "#f59e0b",
      data: { type: "broker", merchantId: mid, broker },
    });
  };

  const confirmCancelBatch = (batch) => {
    setModal({
      show: true, title: "Cancel Funding Batch",
      message: `Reverse batch "${batch.batch_id}"? This will restore ${batch.order_count || "?"} orders back to "approved" status.`,
      details: (
        <div style={{ fontSize: "0.82rem", color: "#991b1b", background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 6, padding: "8px 12px", marginTop: 8 }}>
          <strong>This will:</strong> Revert orders to approved, clear funding flags, remove ledger entries.
        </div>
      ),
      icon: <XCircle size={20} color="#ef4444" />,
      confirmText: "Confirm Cancel", confirmColor: "#ef4444",
      data: { type: "cancel", batchId: batch.batch_id },
    });
  };

  const handleModalConfirm = () => {
    const d = modal.data;
    if (!d) return;
    if (d.type === "all") handleBatchProcess("all");
    else if (d.type === "merchant") handleBatchProcess("merchant", d);
    else if (d.type === "broker") handleBatchProcess("broker", d);
    else if (d.type === "cancel") handleCancelFunding(d.batchId);
  };

  const loading = merchantId ? mLoading : allLoading;
  const error = merchantId ? mError : allError;

  return (
    <div className="app-container app-content">
      <ConfirmModal
        show={modal.show} title={modal.title} message={modal.message}
        details={modal.details} icon={modal.icon}
        confirmText={modal.confirmText} confirmColor={modal.confirmColor}
        onConfirm={handleModalConfirm} onCancel={closeModal}
      />

      {/* Header */}
      <h1 className="page-title">
        Fund IB Sweep Account
        {merchantId && <> — <span style={{ fontWeight: 400 }}>{merchantName || merchantId}</span></>}
      </h1>
      <p className="page-deck">
        {merchantId
          ? <>Funding for merchant <strong>{merchantName || merchantId}</strong>. Process approved orders, transfer funds to StockLoyal IB sweep account.</>
          : <>Summary of <strong>approved</strong> orders awaiting merchant funding to StockLoyal IB sweep account. Plaid-linked merchants fund automatically via ACH debit.</>
        }
      </p>

      <OrderPipeline currentStep={2} queueCounts={queueCounts} />

      {/* Action bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap",
      }}>
        {/* Tabs */}
        <div style={{ display: "inline-flex", borderRadius: 6, border: "1px solid #d1d5db", overflow: "hidden" }}>
          {[
            { key: "unpaid", label: <><CreditCard size={12} style={{ verticalAlign: "middle" }} /> Approved</> },
            { key: "history", label: <><History size={12} style={{ verticalAlign: "middle" }} /> History</> },
          ].map((t) => (
            <button
              key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                padding: "0.4rem 0.75rem", border: "none", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                background: activeTab === t.key ? "#3b82f6" : "#fff",
                color: activeTab === t.key ? "#fff" : "#374151",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {merchantId && (
            <button onClick={() => navigate("/payments-processing")}
              style={{ padding: "0.625rem 1.25rem", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: "0.875rem", cursor: "pointer" }}>
              ← All Merchants
            </button>
          )}
          <button onClick={() => merchantId ? loadSingleMerchant(merchantId) : loadAllMerchants()} disabled={loading}
            style={{ padding: "0.625rem 1.25rem", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: "0.875rem", cursor: "pointer" }}>
            <RefreshCw size={14} style={{ verticalAlign: "middle" }} /> Refresh
          </button>
          {activeTab === "unpaid" && topTotals.orders > 0 && (
            <button onClick={confirmProcessAll} disabled={processing}
              style={{
                padding: "0.625rem 1.25rem", background: processing ? "#94a3b8" : "#10b981",
                color: "#fff", border: "none", borderRadius: 6, fontSize: "0.875rem", fontWeight: 600,
                cursor: processing ? "not-allowed" : "pointer",
              }}>
              <CreditCard size={14} style={{ verticalAlign: "middle" }} /> Fund IB Account
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {activeTab === "unpaid" && topTotals.orders > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
          <StatCard label="Approved Orders" value={topTotals.orders} subtext="Awaiting merchant funding" color="#f59e0b" />
          <StatCard label="Funding Required" value={fmtMoney(topTotals.totalDue)} subtext="ACH to IB sweep" color="#10b981" />
          <StatCard label="Brokers" value={topTotals.brokers} subtext="Payees" color="#6366f1" />
          <StatCard label="Members" value={topTotals.members} subtext="Investors" color="#06b6d4" />
        </div>
      )}

      {/* Progress Indicator */}
      {processing && processProgress && (
        <div style={{
          background: "#eff6ff", border: "2px solid #3b82f6", borderRadius: 8,
          padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Loader2 size={20} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontWeight: 600, color: "#1e40af" }}>
              Processing... {processProgress.current} of {processProgress.total}
            </span>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#3730a3" }}>
            {processProgress.currentMerchant && <span>Merchant: {processProgress.currentMerchant} · </span>}
            Broker: {processProgress.currentBroker}
          </div>
          <div style={{ marginTop: 8, height: 8, background: "#dbeafe", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", background: "#3b82f6", borderRadius: 4,
              width: `${(processProgress.current / processProgress.total) * 100}%`,
              transition: "width 0.3s ease",
            }} />
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Results Banner */}
      <ResultsBanner results={processResults} onDismiss={() => setProcessResults([])} />

      {/* Cancel Results */}
      {cancelResults && (
        <div style={{
          background: cancelResults.success ? "#fef3c7" : "#fef2f2",
          border: `2px solid ${cancelResults.success ? "#f59e0b" : "#ef4444"}`,
          borderRadius: 8, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            {cancelResults.success ? <RotateCcw size={20} color="#f59e0b" /> : <AlertCircle size={20} color="#ef4444" />}
            <strong style={{ color: cancelResults.success ? "#92400e" : "#991b1b" }}>
              {cancelResults.success ? "Funding Cancelled" : "Cancel Failed"}
            </strong>
          </div>
          {cancelResults.success ? (
            <div style={{ fontSize: "0.85rem", color: "#78350f" }}>
              Batch: <code>{cancelResults.batch_id}</code> · Orders reverted: <strong>{cancelResults.orders_cancelled}</strong> · Ledger removed: <strong>{cancelResults.ledger_entries_removed}</strong>
            </div>
          ) : (
            <div style={{ color: "#991b1b" }}>{cancelResults.error}</div>
          )}
          <button onClick={() => setCancelResults(null)}
            style={{ marginTop: 8, padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", fontSize: "0.8rem" }}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: "0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", marginBottom: "1rem", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {/* ── UNPAID TAB ── */}
      {activeTab === "unpaid" && (
        <>
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Loading approved orders...</div>
          ) : orders.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "3rem", background: "#d1fae5",
              borderRadius: 8, border: "2px solid #10b981",
            }}>
              <CheckCircle size={32} color="#10b981" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#065f46" }}>All caught up! No approved orders awaiting funding.</div>
            </div>
          ) : (
            <PaymentsHierarchy
              orders={orders}
              brokerDetailsMap={merchantId ? brokerDetailsMap : {}}
              fundingMethods={fundingMethods}
              processing={processing}
              onProcessMerchant={confirmProcessMerchant}
              onProcessBroker={confirmProcessBroker}
              onNavigateMerchant={!merchantId ? (mid) => navigate(`/payments-processing?merchant_id=${encodeURIComponent(mid)}`) : null}
            />
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {historyLoading && history.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>Loading funding history...</div>
          ) : history.length === 0 ? (
            <div style={{
              padding: "2rem", textAlign: "center", color: "#94a3b8",
              background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0",
            }}>
              No funding batches found.
            </div>
          ) : (
            <>
              <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 4 }}>
                Showing {history.length} of {historyTotal} batch(es)
              </div>
              {history.map((batch) => (
                <PaymentHistoryCard
                  key={batch.batch_id}
                  batch={batch}
                  processing={processing}
                  onCancel={() => confirmCancelBatch(batch)}
                />
              ))}
              {historyHasMore && (
                <button onClick={() => loadHistory(true)} disabled={historyLoading}
                  style={{ padding: "0.75rem", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontSize: "0.85rem" }}>
                  {historyLoading ? "Loading..." : "Load More"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Info Footer */}
      <div style={{
        marginTop: "1.5rem", padding: "1rem", background: "#eff6ff",
        border: "1px solid #93c5fd", borderRadius: 8, fontSize: "0.8rem", color: "#1e40af",
      }}>
        <strong><Info size={14} style={{ verticalAlign: "middle" }} /> IB Sweep Funding:</strong> Processes approved orders to collect funding from merchants
        into the StockLoyal IB sweep account. <strong>Plaid merchants</strong> are debited automatically via ACH — no CSV needed.
        <strong> Manual ACH merchants</strong> receive XLSX + CSV export files. Orders are marked as <code>funded</code> and ready for journal funding to member accounts (Stage 3).
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// PaymentsHierarchy — Merchant → Broker → Basket → Orders tree
// ═══════════════════════════════════════════════════════════════════════════

function PaymentsHierarchy({ orders, brokerDetailsMap = {}, fundingMethods = {}, processing, onProcessMerchant, onProcessBroker, onNavigateMerchant }) {
  const [expandedMerchants, setExpandedMerchants] = useState(new Set());
  const [expandedBrokers, setExpandedBrokers] = useState(new Set());
  const [expandedBaskets, setExpandedBaskets] = useState(new Set());
  const [showAch, setShowAch] = useState(new Set());

  const toggle = (setter, key) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const getAmt = (o) => safeNum(o?.payment_amount ?? o?.executed_amount ?? o?.amount ?? 0);

  // Build hierarchy
  const hierarchy = {};
  for (const o of orders) {
    const mId = o.merchant_id || "unknown";
    const mName = o.merchant_name || o.merchant_id || "Unknown";
    const br = o.broker || "Unknown";
    const bk = o.basket_id || "no-basket";

    if (!hierarchy[mId]) {
      hierarchy[mId] = { merchant_id: mId, merchant_name: mName, brokers: {}, orders: [], totalAmount: 0, memberSet: new Set() };
    }
    hierarchy[mId].orders.push(o);
    hierarchy[mId].totalAmount += getAmt(o);
    hierarchy[mId].memberSet.add(o.member_id);

    if (!hierarchy[mId].brokers[br]) {
      hierarchy[mId].brokers[br] = { broker: br, baskets: {}, orders: [], totalAmount: 0, memberSet: new Set() };
    }
    hierarchy[mId].brokers[br].orders.push(o);
    hierarchy[mId].brokers[br].totalAmount += getAmt(o);
    hierarchy[mId].brokers[br].memberSet.add(o.member_id);

    if (!hierarchy[mId].brokers[br].baskets[bk]) {
      hierarchy[mId].brokers[br].baskets[bk] = { basket_id: bk, member_id: o.member_id, orders: [], totalAmount: 0 };
    }
    hierarchy[mId].brokers[br].baskets[bk].orders.push(o);
    hierarchy[mId].brokers[br].baskets[bk].totalAmount += getAmt(o);
  }

  const badge = (text, bg, color) => (
    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: bg, color, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );

  const rowBase = (depth) => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", paddingLeft: `${12 + depth * 24}px`,
    cursor: "pointer", fontSize: "0.82rem",
    borderBottom: "1px solid #f1f5f9", transition: "background 0.1s",
  });

  const pills = (row) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {row.memberSet && badge(`${row.memberSet.size} mbrs`, "#f0f9ff", "#0369a1")}
      {badge(`${row.orders.length} orders`, "#faf5ff", "#7c3aed")}
      {badge(fmtMoney(row.totalAmount), "#f0fdf4", "#15803d")}
    </div>
  );

  const merchantKeys = Object.keys(hierarchy).sort();

  return (
    <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
      <div style={{
        padding: "0.5rem 0.75rem", background: "#f8fafc", fontWeight: 600, fontSize: "0.8rem",
        borderBottom: "1px solid #e2e8f0", color: "#374151",
      }}>
        Approved Orders — {merchantKeys.length} merchant(s)
      </div>

      {merchantKeys.map((mId) => {
        const m = hierarchy[mId];
        const mOpen = expandedMerchants.has(mId);

        return (
          <div key={mId}>
            {/* ── Level 1: Merchant ── */}
            <div
              onClick={() => toggle(setExpandedMerchants, mId)}
              style={{ ...rowBase(0), fontWeight: 600, background: mOpen ? "#f8fafc" : "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = mOpen ? "#f8fafc" : "#fff")}
            >
              <Store size={14} color="#8b5cf6" />
              <span style={{ color: "#1e293b" }}>{m.merchant_name}</span>
              {fundingMethods[mId] === "plaid" && badge("⚡ Plaid", "#ede9fe", "#7c3aed")}
              {badge(`${Object.keys(m.brokers).length} broker(s)`, "#e0e7ff", "#3730a3")}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                {pills(m)}
                {onNavigateMerchant && (
                  <button onClick={(e) => { e.stopPropagation(); onNavigateMerchant(mId); }}
                    style={{ ...smallBtnStyle, background: "#3b82f6" }}>
                    View
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onProcessMerchant(mId, m.merchant_name, m.orders.length, m.totalAmount); }}
                  disabled={processing} style={{ ...smallBtnStyle, background: "#10b981" }}>
                  <CreditCard size={11} style={{ verticalAlign: "middle" }} /> Process
                </button>
                {mOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
              </div>
            </div>

            {/* ── Level 2: Brokers ── */}
            {mOpen && Object.keys(m.brokers).sort().map((brKey) => {
              const br = m.brokers[brKey];
              const brId = `${mId}|${brKey}`;
              const brOpen = expandedBrokers.has(brId);
              const achOpen = showAch.has(brId);
              const achDetails = brokerDetailsMap[brKey];

              return (
                <div key={brId}>
                  <div
                    onClick={() => toggle(setExpandedBrokers, brId)}
                    style={{ ...rowBase(1), fontWeight: 500, background: brOpen ? "#faf5ff" : "#fff" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#faf5ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = brOpen ? "#faf5ff" : "#fff")}
                  >
                    <Building2 size={14} color="#6366f1" />
                    <span style={{ color: "#1e293b" }}>{br.broker}</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      {pills(br)}
                      {achDetails && (
                        <button onClick={(e) => { e.stopPropagation(); toggle(setShowAch, brId); }}
                          style={{ ...smallBtnStyle, background: achOpen ? "#dbeafe" : "#f1f5f9", color: achOpen ? "#1d4ed8" : "#475569", border: `1px solid ${achOpen ? "#93c5fd" : "#cbd5e1"}` }}>
                          ACH
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); onProcessBroker(mId, brKey, br.orders.length, br.totalAmount); }}
                        disabled={processing} style={{ ...smallBtnStyle, background: "#f59e0b", color: "#fff" }}>
                        <CreditCard size={11} style={{ verticalAlign: "middle" }} /> Process
                      </button>
                      {brOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                    </div>
                  </div>

                  {/* ACH Details panel */}
                  {achOpen && achDetails && (
                    <div style={{
                      paddingLeft: `${12 + 1 * 24}px`, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
                      background: "#eff6ff", borderBottom: "1px solid #dbeafe", fontSize: "0.78rem",
                      display: "flex", gap: 24, flexWrap: "wrap",
                    }}>
                      <span>Bank: <strong>{achDetails.ach_bank_name || "-"}</strong></span>
                      <span>Routing: <strong>{achDetails.ach_routing_num || "-"}</strong></span>
                      <span>Account: <strong>{achDetails.ach_account_num || "-"}</strong></span>
                      <span>Type: <strong>{achDetails.ach_account_type || "-"}</strong></span>
                    </div>
                  )}

                  {/* ── Level 3: Baskets ── */}
                  {brOpen && Object.keys(br.baskets).sort().map((bkId) => {
                    const bk = br.baskets[bkId];
                    const bkOpen = expandedBaskets.has(bkId);

                    return (
                      <div key={bkId}>
                        <div
                          onClick={() => toggle(setExpandedBaskets, bkId)}
                          style={{ ...rowBase(2), background: bkOpen ? "#fffbeb" : "#fff" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#fffbeb")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = bkOpen ? "#fffbeb" : "#fff")}
                        >
                          <ShoppingBasket size={14} color="#d97706" />
                          <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>{bkId}</span>
                          {bk.member_id && badge(`member: ${bk.member_id}`, "#fef3c7", "#92400e")}
                          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                            {badge(`${bk.orders.length} orders`, "#faf5ff", "#7c3aed")}
                            {badge(fmtMoney(bk.totalAmount), "#f0fdf4", "#15803d")}
                            {bkOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                          </div>
                        </div>

                        {/* ── Level 4: Orders table ── */}
                        {bkOpen && (
                          <div style={{ paddingLeft: `${12 + 3 * 24}px`, paddingRight: 12, paddingBottom: 4 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  <th style={thStyle}>Order</th>
                                  <th style={thStyle}>Symbol</th>
                                  <th style={thStyle}>Amount</th>
                                  <th style={thStyle}>Exec Amount</th>
                                  <th style={thStyle}>Shares</th>
                                  <th style={thStyle}>Points</th>
                                  <th style={thStyle}>Status</th>
                                  <th style={thStyle}>Executed At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bk.orders.map((o, i) => (
                                  <tr key={o.order_id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>#{o.order_id}</td>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>{o.symbol}</td>
                                    <td style={tdStyle}>{fmtMoney(o.amount)}</td>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>{o.executed_amount != null ? fmtMoney(o.executed_amount) : "-"}</td>
                                    <td style={tdStyle}>{safeNum(o.shares).toFixed(4)}</td>
                                    <td style={tdStyle}>{parseInt(o.points_used || 0, 10).toLocaleString()}</td>
                                    <td style={tdStyle}>
                                      <span style={{
                                        fontSize: "0.7rem", fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                                        background: o.status === "approved" ? "#dbeafe" : o.status === "confirmed" ? "#d1fae5" : o.status === "executed" ? "#dbeafe" : "#fef3c7",
                                        color: o.status === "approved" ? "#1d4ed8" : o.status === "confirmed" ? "#059669" : o.status === "executed" ? "#2563eb" : "#92400e",
                                      }}>
                                        {o.status}
                                      </span>
                                    </td>
                                    <td style={{ ...tdStyle, fontSize: "0.75rem", color: "#64748b" }}>{o.executed_at || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// PaymentHistoryCard — Expandable card per funding batch
// ═══════════════════════════════════════════════════════════════════════════

function PaymentHistoryCard({ batch, processing, onCancel }) {
  const [expanded, setExpanded] = useState(false);
  const b = batch;

  return (
    <div style={{
      background: "#fff", borderRadius: 8,
      border: `1px solid ${expanded ? "#3b82f6" : "#e2e8f0"}`,
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "0.75rem 1rem", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: expanded ? "#eff6ff" : "#fff", transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>
              {b.batch_id}
            </span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#d1fae5", color: "#059669" }}>
              <CheckCircle size={12} style={{ verticalAlign: "middle" }} /> {b.order_count || 0} orders
            </span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#f0fdf4", color: "#15803d" }}>
              {fmtMoney(b.total_amount)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "#64748b" }}>
            <span>{b.merchant_id}</span>
            <span>Broker: <strong>{b.broker}</strong></span>
            <span>{b.paid_at}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            disabled={processing}
            style={{
              padding: "4px 10px", background: "#fef2f2", color: "#dc2626",
              border: "1px solid #fecaca", borderRadius: 4, cursor: processing ? "not-allowed" : "pointer",
              fontSize: "0.7rem", fontWeight: 600,
            }}
          >
            <RotateCcw size={11} style={{ verticalAlign: "middle" }} /> Cancel
          </button>
          {expanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem 1rem", fontSize: "0.82rem" }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", color: "#475569" }}>
            <span>Batch ID: <code style={{ fontSize: "0.75rem" }}>{b.batch_id}</code></span>
            <span>Merchant: <strong>{b.merchant_id}</strong></span>
            <span>Broker: <strong>{b.broker}</strong></span>
            <span>Orders: <strong>{b.order_count}</strong></span>
            <span>Amount: <strong>{fmtMoney(b.total_amount)}</strong></span>
            <span>Paid at: <strong>{b.paid_at}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// ResultsBanner — Post-processing results with download links
// ═══════════════════════════════════════════════════════════════════════════

function ResultsBanner({ results, onDismiss }) {
  if (!results || results.length === 0) return null;

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalAmount = successful.reduce((sum, r) => sum + safeNum(r.total_amount), 0);
  const totalOrders = successful.reduce((sum, r) => sum + safeNum(r.order_count), 0);

  // Group by merchant_id
  const merchantGroups = {};
  for (const r of results) {
    const mid = r.merchant_id || "unknown";
    if (!merchantGroups[mid]) merchantGroups[mid] = { successful: [], failed: [], totalAmount: 0, totalOrders: 0 };
    if (r.success) {
      merchantGroups[mid].successful.push(r);
      merchantGroups[mid].totalAmount += safeNum(r.total_amount);
      merchantGroups[mid].totalOrders += safeNum(r.order_count);
    } else {
      merchantGroups[mid].failed.push(r);
    }
  }

  const handleDownload = (fileObj) => {
    if (!fileObj?.url) return;
    let url = fileObj.url;
    if (!url.startsWith("http")) {
      const apiBase = window.__VITE_API_BASE__ || "https://api.stockloyal.com/api";
      url = `${apiBase.replace(/\/+$/, "")}/${url.replace(/^\/+/, "").replace(/^api\/+/, "")}`;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = fileObj.filename || "download";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
  };

  return (
    <div style={{
      background: successful.length > 0 ? "#ecfdf5" : "#fef2f2",
      border: `2px solid ${successful.length > 0 ? "#10b981" : "#ef4444"}`,
      borderRadius: 8, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {successful.length > 0 ? <CheckCircle size={24} color="#10b981" /> : <AlertCircle size={24} color="#ef4444" />}
        <span style={{ fontWeight: 700, fontSize: "1rem", color: successful.length > 0 ? "#065f46" : "#991b1b" }}>
          Processing Complete
        </span>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "white", borderRadius: 6, padding: 12, textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10b981" }}>{successful.length}</div>
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Successful</div>
        </div>
        {failed.length > 0 && (
          <div style={{ background: "white", borderRadius: 6, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#ef4444" }}>{failed.length}</div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Failed</div>
          </div>
        )}
        <div style={{ background: "white", borderRadius: 6, padding: 12, textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#3b82f6" }}>{totalOrders}</div>
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Orders Funded</div>
        </div>
        <div style={{ background: "white", borderRadius: 6, padding: 12, textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#8b5cf6" }}>{fmtMoney(totalAmount)}</div>
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Total Amount</div>
        </div>
      </div>

      {/* Downloads grouped by merchant */}
      {Object.keys(merchantGroups).sort().map((mid) => {
        const mg = merchantGroups[mid];
        if (mg.successful.length === 0 && mg.failed.length === 0) return null;

        return (
          <div key={mid} style={{
            background: "white", borderRadius: 8, border: "1px solid #e2e8f0",
            marginBottom: 10, overflow: "hidden",
          }}>
            {/* Merchant header */}
            <div style={{
              padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Store size={14} color="#8b5cf6" />
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>{mid}</span>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: "0.75rem" }}>
                <span style={{ padding: "1px 8px", borderRadius: 4, background: "#f0fdf4", color: "#15803d", fontWeight: 600 }}>
                  {mg.totalOrders} orders
                </span>
                <span style={{ padding: "1px 8px", borderRadius: 4, background: "#eff6ff", color: "#1d4ed8", fontWeight: 600 }}>
                  {fmtMoney(mg.totalAmount)}
                </span>
              </div>
            </div>

            {/* Broker rows */}
            {mg.successful.map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "8px 12px", borderBottom: "1px solid #f1f5f9", fontSize: "0.8rem",
              }}>
                <Building2 size={13} color="#6366f1" />
                <span style={{ fontWeight: 600, color: "#1e293b", minWidth: 100 }}>{r.broker}</span>
                <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                  {r.order_count} orders · {fmtMoney(r.total_amount)}
                </span>

                {/* Plaid result */}
                {r.funding_method === "plaid" && r.transfer_id && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#ede9fe", color: "#7c3aed" }}>
                      ⚡ Plaid
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#475569" }}>
                      ID: <code style={{ fontSize: "0.68rem" }}>{r.transfer_id.slice(0, 16)}…</code>
                    </span>
                    <span style={{
                      fontSize: "0.7rem", fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: r.status === "settled" ? "#dcfce7" : r.status === "posted" ? "#dbeafe" : "#fef3c7",
                      color: r.status === "settled" ? "#166534" : r.status === "posted" ? "#1d4ed8" : "#92400e",
                    }}>
                      {r.status || "pending"}
                    </span>
                    {r.expected_settlement && (
                      <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                        <Clock size={10} style={{ verticalAlign: "middle" }} /> Est. {r.expected_settlement}
                      </span>
                    )}
                  </div>
                )}

                {/* Manual ACH result — download buttons */}
                {r.funding_method !== "plaid" && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    {r.xlsx?.url && (
                      <button onClick={() => handleDownload(r.xlsx)}
                        style={{ ...dlBtnStyle, background: "#059669" }}>
                        <FileSpreadsheet size={12} style={{ verticalAlign: "middle" }} /> XLSX
                      </button>
                    )}
                    {r.detail_csv?.url && (
                      <button onClick={() => handleDownload(r.detail_csv)}
                        style={{ ...dlBtnStyle, background: "#64748b" }}>
                        <Download size={12} style={{ verticalAlign: "middle" }} /> Detail
                      </button>
                    )}
                    {r.ach_csv?.url && (
                      <button onClick={() => handleDownload(r.ach_csv)}
                        style={{ ...dlBtnStyle, background: "#64748b" }}>
                        <Download size={12} style={{ verticalAlign: "middle" }} /> ACH
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Failed brokers for this merchant */}
            {mg.failed.map((r, i) => (
              <div key={`fail-${i}`} style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "8px 12px", borderBottom: "1px solid #f1f5f9",
                fontSize: "0.8rem", background: "#fef2f2",
              }}>
                <AlertCircle size={13} color="#ef4444" />
                <span style={{ fontWeight: 600, color: "#991b1b" }}>{r.broker}</span>
                <span style={{ fontSize: "0.72rem", color: "#991b1b" }}>{r.error}</span>
              </div>
            ))}
          </div>
        );
      })}

      <button onClick={onDismiss}
        style={{ marginTop: 4, padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", fontSize: "0.8rem" }}>
        Dismiss
      </button>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// Sub-Components & Styles
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, subtext, color }) {
  return (
    <div style={{
      padding: "1rem", background: "#fff", borderRadius: 8,
      border: "1px solid #e2e8f0", borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#1e293b" }}>{value}</div>
      {subtext && <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{subtext}</div>}
    </div>
  );
}

const thStyle = {
  padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.7rem",
  fontWeight: 600, color: "#64748b", textTransform: "uppercase",
  letterSpacing: "0.03em", borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "0.5rem 0.75rem", fontSize: "0.82rem", color: "#334155",
};

const smallBtnStyle = {
  padding: "2px 10px", color: "#fff", border: "none", borderRadius: 4,
  fontSize: "0.68rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};

const dlBtnStyle = {
  padding: "3px 10px", color: "#fff", border: "none", borderRadius: 4,
  fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
