import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api"; // Use existing api helper
import { CheckCircle, RefreshCw, ClipboardList, Upload, Download, Radio, Calendar, CalendarDays, ShoppingBasket, Play, CheckCircle2, XCircle, AlertTriangle, Package, Store, Building2, Clock, ChevronUp, ChevronDown } from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";
import { LineageLink } from "../components/LineagePopup";

/**
 * SweepAdmin - Admin page for managing the sweep process (order entry to broker)
 * 
 * Features:
 * - View sweep status overview
 * - See upcoming sweep schedules
 * - View pending orders by merchant (grouped by basket)

 * - Trigger manual sweeps
 * - View sweep execution history
 */

export default function SweepAdmin() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [history, setHistory] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [selectedMerchant, setSelectedMerchant] = useState("");
  const [preview, setPreview] = useState(null);
  const [expandedBaskets, setExpandedBaskets] = useState({});
  const [pendingView, setPendingView] = useState("webhook"); // "basket" | "webhook"
  const [jsonViewMode, setJsonViewMode] = useState("formatted"); // "formatted" | "raw"

  // ── Modal State ──
  const [modal, setModal] = useState({
    show: false,
    title: "",
    message: "",
    details: null,
    confirmText: "Confirm",
    confirmColor: "#4ECDC4",
    icon: <RefreshCw size={20} color="#4ECDC4" />,
  });

  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  // Pipeline queue counts
  const [queueCounts, setQueueCounts] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const data = await apiPost("admin-queue-counts.php");
        if (data?.success) setQueueCounts(data.counts);
      } catch (err) {
        console.warn("[SweepAdmin] queue counts fetch failed:", err);
      }
    })();
  }, []);

  // ── JSON Viewer (formatted / raw toggle) ─────────────────────────────────
  const JsonToggle = () => (
    <div style={{ display: "flex", gap: 8 }}>
      {[
        { mode: "formatted", label: <><ClipboardList size={12} style={{ verticalAlign: "middle" }} /> Formatted</> },
        { mode: "raw", label: <>{"{ }"} Raw JSON</> },
      ].map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          onClick={() => setJsonViewMode(mode)}
          style={{
            padding: "4px 12px",
            fontSize: "0.75rem",
            fontWeight: 600,
            border: "1px solid #e2e8f0",
            borderRadius: 4,
            backgroundColor: jsonViewMode === mode ? "#6366f1" : "#fff",
            color: jsonViewMode === mode ? "#fff" : "#64748b",
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const renderJsonValue = (val, depth = 0) => {
    if (val === null || val === undefined) return <span style={{ color: "#94a3b8" }}>{String(val)}</span>;
    if (typeof val === "boolean") return <span style={{ color: "#8b5cf6" }}>{val.toString()}</span>;
    if (typeof val === "number") return <span style={{ color: "#0891b2" }}>{val}</span>;
    if (typeof val === "string") {
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) return <span style={{ color: "#059669" }}>{val}</span>;
      return <span style={{ color: "#dc2626" }}>"{val}"</span>;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <span style={{ color: "#64748b" }}>[]</span>;
      return (
        <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
          {val.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 4 }}>
              <span style={{ color: "#64748b" }}>[{i}]:</span>
              {renderJsonValue(item, depth + 1)}
            </div>
          ))}
        </div>
      );
    }
    if (typeof val === "object") {
      const keys = Object.keys(val);
      if (keys.length === 0) return <span style={{ color: "#64748b" }}>{"{}"}</span>;
      return (
        <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
          {keys.map((key) => (
            <div key={key} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <span style={{ color: "#6366f1", fontWeight: 600 }}>{key}:</span>
              {renderJsonValue(val[key], depth + 1)}
            </div>
          ))}
        </div>
      );
    }
    return <span>{String(val)}</span>;
  };

  const JsonBlock = ({ data, maxHeight = 300, darkBg = false }) => {
    if (!data) return <span style={{ color: "#94a3b8" }}>—</span>;
    const parsed = typeof data === "string" ? (() => { try { return JSON.parse(data); } catch { return null; } })() : data;
    const raw = typeof data === "string" ? data : JSON.stringify(data, null, 2);

    if (jsonViewMode === "raw") {
      return (
        <pre style={{
          margin: 0,
          padding: "0.75rem",
          fontSize: "0.7rem",
          fontFamily: "monospace",
          background: darkBg ? "#1e293b" : "#fafafa",
          color: darkBg ? "#e2e8f0" : "#1e293b",
          borderRadius: darkBg ? "6px" : 0,
          maxHeight,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {raw}
        </pre>
      );
    }

    return (
      <div style={{
        padding: darkBg ? "0.75rem" : "0.5rem 0.75rem",
        fontFamily: "monospace",
        fontSize: "0.75rem",
        lineHeight: 1.6,
        maxHeight,
        overflow: "auto",
        background: darkBg ? "#f8fafc" : "#fafafa",
        borderRadius: darkBg ? "6px" : 0,
        border: darkBg ? "1px solid #e2e8f0" : "none",
      }}>
        {parsed ? renderJsonValue(parsed) : <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{raw}</pre>}
      </div>
    );
  };

  // Load overview data
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("get_sweep_status.php", { action: "overview" });
      if (res.success) {
        setOverview(res);
      }
    } catch (err) {
      console.error("Failed to load overview:", err);
    }
    setLoading(false);
  }, []);

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiPost("get_sweep_status.php", { action: "history", limit: 50 });
      if (res.success) {
        setHistory(res.history || []);
      } else {
        console.error("History load error:", res.error || res);
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, []);

  // Load pending orders
  const loadPendingOrders = useCallback(async (merchantId = null) => {
    try {
      const res = await apiPost("get_sweep_status.php", { 
        action: "pending",
        merchant_id: merchantId || undefined
      });
      if (res.success) {
        setPendingOrders(res.pending_orders || []);
      }
    } catch (err) {
      console.error("Failed to load pending orders:", err);
    }
  }, []);

  // Load schedules
  const loadSchedules = useCallback(async () => {
    try {
      const res = await apiPost("get_sweep_status.php", { action: "merchant_schedule" });
      if (res.success) {
        setSchedules(res.schedules || []);
      }
    } catch (err) {
      console.error("Failed to load schedules:", err);
    }
  }, []);

  // Preview sweep
  const previewSweep = async (merchantId = null) => {
    try {
      const res = await apiPost("trigger_sweep.php", { 
        action: "preview",
        merchant_id: merchantId || undefined
      });
      if (res.success) {
        setPreview(res.preview);
      }
    } catch (err) {
      console.error("Failed to preview sweep:", err);
    }
  };

  // Show sweep confirmation modal
  const showSweepModal = (merchantId = null) => {
    const merchantData = merchantId 
      ? overview?.pending_by_merchant?.find(m => m.merchant_id === merchantId)
      : null;

    setModal({
      show: true,
      title: merchantId ? "Run Merchant Sweep" : "Run Sweep for All Merchants",
      icon: <RefreshCw size={20} color="#4ECDC4" />,
      message: merchantId 
        ? `Run sweep for merchant "${merchantId}"?`
        : "Run sweep for ALL eligible merchants?",
      details: merchantId && merchantData ? (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span>Orders: <strong>{merchantData.pending_orders}</strong></span>
          <span>Amount: <strong>{formatCurrency(merchantData.pending_amount)}</strong></span>
        </div>
      ) : overview ? (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span>Merchants: <strong>{overview.pending_by_merchant?.length || 0}</strong></span>
          <span>Orders: <strong>{overview.total_pending_orders || 0}</strong></span>
          <span>Amount: <strong>{formatCurrency(overview.total_pending_amount)}</strong></span>
        </div>
      ) : null,
      confirmText: "Run Sweep",
      confirmColor: "#4ECDC4",
      data: { merchantId },
    });
  };

  // Execute sweep
  const executeSweep = async (merchantId = null) => {
    closeModal();
    setSweepRunning(true);
    setLastResult(null);
    
    try {
      const res = await apiPost("trigger_sweep.php", { 
        action: "run",
        merchant_id: merchantId || undefined
      });
      setLastResult(res);
      
      // Refresh data
      await loadOverview();
      await loadHistory();
      await loadPendingOrders();
    } catch (err) {
      console.error("Sweep failed:", err);
      setLastResult({ success: false, error: err.message });
    }
    
    setSweepRunning(false);
  };

  // Handle modal confirm
  const handleModalConfirm = () => {
    executeSweep(modal.data?.merchantId);
  };

  // Initial load
  useEffect(() => {
    loadOverview();
    loadHistory();
    loadPendingOrders();
    loadSchedules();
  }, [loadOverview, loadHistory, loadPendingOrders, loadSchedules]);

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount || 0);
  };

  // Get sweep day display
  const getSweepDayDisplay = (day) => {
    if (day === -1) return "Last day of month";
    if (day === null || day === undefined) return "Not scheduled";
    return `Day ${day}`;
  };

  // Group orders by basket_id
  const groupOrdersByBasket = (orders) => {
    const grouped = {};
    for (const order of orders) {
      const basketId = order.basket_id || "no-basket";
      if (!grouped[basketId]) {
        grouped[basketId] = [];
      }
      grouped[basketId].push(order);
    }
    return grouped;
  };

  // Group orders by merchant-broker combo (webhook batching)
  const groupOrdersByMerchantBroker = (orders) => {
    const grouped = {};
    for (const order of orders) {
      const key = `${order.merchant_id || "unknown"}::${order.broker || "unknown"}`;
      if (!grouped[key]) {
        grouped[key] = {
          merchant_id: order.merchant_id,
          merchant_name: order.merchant_name || order.merchant_id || "Unknown",
          broker: order.broker || "Unknown",
          orders: [],
        };
      }
      grouped[key].orders.push(order);
    }
    return grouped;
  };

  // Build webhook payload preview for a merchant-broker group
  const buildWebhookPayload = (group) => {
    // Group member orders by member_id
    const byMember = {};
    for (const o of group.orders) {
      const mid = o.member_id || "unknown";
      if (!byMember[mid]) {
        byMember[mid] = {
          member_id: mid,
          brokerage_id: o.brokerage_id || null,
          basket_id: o.basket_id,
          orders: [],
          total_amount: 0,
          total_shares: 0,
          total_points: 0,
        };
      }
      const amt = parseFloat(o.amount || 0);
      const shares = parseFloat(o.shares || 0);
      const pts = parseInt(o.points_used || 0, 10);
      byMember[mid].orders.push({
        order_id: o.order_id,
        symbol: o.symbol,
        shares: parseFloat(shares.toFixed(6)),
        amount: parseFloat(amt.toFixed(2)),
        points_used: pts,
        price: parseFloat(parseFloat(o.price || 0).toFixed(2)),
      });
      byMember[mid].total_amount += amt;
      byMember[mid].total_shares += shares;
      byMember[mid].total_points += pts;
    }

    return {
      merchant_id: group.merchant_id,
      merchant_name: group.merchant_name,
      broker: group.broker,
      total_members: Object.keys(byMember).length,
      total_orders: group.orders.length,
      total_amount: parseFloat(group.orders.reduce((s, o) => s + parseFloat(o.amount || 0), 0).toFixed(2)),
      members: Object.values(byMember).map((m) => ({
        ...m,
        total_amount: parseFloat(m.total_amount.toFixed(2)),
        total_shares: parseFloat(m.total_shares.toFixed(6)),
      })),
    };
  };

  return (
    <div className="app-container app-content">
      {/* Confirm Modal */}
      <ConfirmModal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        details={modal.details}
        confirmText={modal.confirmText}
        confirmColor={modal.confirmColor}
        icon={modal.icon}
        onConfirm={handleModalConfirm}
        onCancel={closeModal}
      />

      {/* Header */}
      <h1 className="page-title">Sweep Process — Order Entry</h1>
      <p className="page-deck">
        Submit prepared orders to brokers. This sweep process will submit orders to all brokers using the orders prepared in the previous step.
      </p>

      {/* ── Order Pipeline ── */}
      <OrderPipeline currentStep={4} queueCounts={queueCounts} />

      {/* All Caught Up Message */}
      {!loading && overview && (overview.total_pending_orders || 0) === 0 && (
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
            You're all caught up! No pending orders to sweep.
          </span>
        </div>
      )}

      {/* Summary Stats Card */}
      {!loading && overview && (overview.total_pending_orders || 0) > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#f59e0b" }}>{overview.total_pending_orders || 0}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Pending Orders</div>
            </div>
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#10b981" }}>{formatCurrency(overview.total_pending_amount)}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Total Amount</div>
            </div>
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#6366f1" }}>{overview.pending_by_merchant?.length || 0}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Merchants</div>
            </div>
            <div style={{ backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#8b5cf6" }}>{overview.today?.sweeps_run || 0}</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Sweeps Today</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              onClick={() => showSweepModal()}
              disabled={sweepRunning || (overview.total_pending_orders || 0) === 0}
              style={{
                padding: "0.75rem 1.5rem",
                background: sweepRunning || (overview.total_pending_orders || 0) === 0 ? "#94a3b8" : "#4ECDC4",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: "600",
                cursor: sweepRunning || (overview.total_pending_orders || 0) === 0 ? "not-allowed" : "pointer",
                fontSize: "14px",
              }}
            >
              {sweepRunning ? "Running..." : <><Play size={14} style={{ verticalAlign: "middle" }} /> Run Sweep Now</>}
            </button>
            <button
              onClick={loadOverview}
              disabled={loading}
              style={{
                padding: "0.75rem 1.5rem",
                background: "#f3f4f6",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontWeight: "500",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {loading ? "Loading..." : <><RefreshCw size={14} style={{ verticalAlign: "middle" }} /> Refresh</>}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        display: "flex", 
        gap: "0.5rem", 
        marginBottom: "1.5rem",
        borderBottom: "1px solid #e2e8f0",
        paddingBottom: "0.5rem"
      }}>
        {["overview", "pending", "schedules", "history"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.5rem 1rem",
              background: activeTab === tab ? "#4ECDC4" : "transparent",
              color: activeTab === tab ? "#fff" : "#64748b",
              border: "none",
              borderRadius: "6px",
              fontWeight: "500",
              cursor: "pointer",
              textTransform: "capitalize"
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Last Result Banner */}
      {lastResult && (
        <div style={{
          padding: "1rem",
          marginBottom: "1rem",
          borderRadius: "8px",
          background: lastResult.market_closed ? "#fefce8" : lastResult.success ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${lastResult.market_closed ? "#eab308" : lastResult.success ? "#10b981" : "#ef4444"}`
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              {lastResult.market_closed
                ? <><Clock size={14} style={{ verticalAlign: "middle" }} /> Market Closed — Sweep Deferred</>
                : lastResult.success
                  ? <><CheckCircle2 size={14} style={{ verticalAlign: "middle" }} /> Sweep Completed</>
                  : <><XCircle size={14} style={{ verticalAlign: "middle" }} /> Sweep Failed</>
              }
            </strong>
            {lastResult.results?.batch_id && (
              <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>
                <LineageLink id={lastResult.results.batch_id} type="sweep">{lastResult.results.batch_id}</LineageLink>
              </span>
            )}
          </div>

          {/* Market closed detail */}
          {lastResult.market_closed && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#92400e" }}>
              <p style={{ margin: "0 0 0.25rem" }}>{lastResult.message || "The US equity market is currently closed."}</p>
              {lastResult.next_market_open && (
                <p style={{ margin: 0 }}>
                  Next market open: <strong>{new Date(lastResult.next_market_open).toLocaleString()}</strong>
                </p>
              )}
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#a16207" }}>
                No orders were modified. Re-run the sweep when the market opens.
              </p>
            </div>
          )}

          {lastResult.results && !lastResult.market_closed && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <span><Package size={12} style={{ verticalAlign: "middle" }} /> Orders Placed: <strong>{lastResult.results.orders_placed ?? 0}</strong></span>
                <span><XCircle size={12} style={{ verticalAlign: "middle" }} /> Failed: <strong>{lastResult.results.orders_failed ?? 0}</strong></span>
                <span><Store size={12} style={{ verticalAlign: "middle" }} /> Merchants: <strong>{lastResult.results.merchants_processed ?? 0}</strong></span>
                <span><ShoppingBasket size={12} style={{ verticalAlign: "middle" }} /> Baskets: <strong>{lastResult.results.baskets_processed ?? 0}</strong></span>
                <span><Clock size={12} style={{ verticalAlign: "middle" }} /> Duration: <strong>{lastResult.results.duration_seconds ?? 0}s</strong></span>
              </div>

              {/* Per-Basket Notification Results */}
              {lastResult.results.basket_results?.length > 0 && (
                <div style={{ marginTop: "0.75rem", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "0.75rem" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.8rem", textTransform: "uppercase", color: "#475569" }}>
                    Broker Results — Per Merchant-Broker
                  </div>
                  {lastResult.results.basket_results.map((br, i) => (
                    <BasketResultRow key={i} br={br} formatCurrency={formatCurrency} jsonViewMode={jsonViewMode} JsonToggle={JsonToggle} JsonBlock={JsonBlock} />
                  ))}
                </div>
              )}

              {/* Errors */}
              {lastResult.results.errors?.length > 0 && (
                <div style={{ marginTop: "0.5rem", color: "#dc2626", fontSize: "0.8rem" }}>
                  {lastResult.results.errors.map((e, i) => (
                    <div key={i}><AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {lastResult.error && !lastResult.results && (
            <div style={{ marginTop: "0.5rem", color: "#dc2626" }}>{lastResult.error}</div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
          Loading...
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === "overview" && overview && (
            <div>
              {/* Stats Cards */}
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem"
              }}>
                <StatCard 
                  label="Pending Orders" 
                  value={overview.total_pending_orders || 0}
                  subtext={formatCurrency(overview.total_pending_amount)}
                  color="#f59e0b"
                />
                <StatCard 
                  label="Today's Sweeps" 
                  value={overview.today?.sweeps_run || 0}
                  subtext={`${overview.today?.orders_confirmed || 0} confirmed`}
                  color="#10b981"
                />
                <StatCard 
                  label="Scheduled Today" 
                  value={overview.today?.scheduled_merchants?.length || 0}
                  subtext="merchants"
                  color="#6366f1"
                />
                <StatCard 
                  label="Failed Today" 
                  value={overview.today?.orders_failed || 0}
                  subtext="orders"
                  color="#ef4444"
                />
              </div>

              {/* Today's Scheduled Merchants */}
              {overview.today?.scheduled_merchants?.length > 0 && (
                <div style={{ 
                  background: "#f0fdf4", 
                  padding: "1rem", 
                  borderRadius: "8px",
                  marginBottom: "1.5rem"
                }}>
                  <h3 style={{ margin: "0 0 0.5rem", color: "#166534" }}>
                    <Calendar size={16} style={{ verticalAlign: "middle" }} /> Scheduled for Today ({overview.today.date})
                  </h3>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {overview.today.scheduled_merchants.map((m) => (
                      <span 
                        key={m.merchant_id}
                        style={{
                          padding: "0.25rem 0.75rem",
                          background: "#dcfce7",
                          borderRadius: "999px",
                          fontSize: "0.875rem"
                        }}
                      >
                        {m.merchant_name || m.merchant_id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending by Merchant */}
              <h3 style={{ marginBottom: "0.75rem" }}>Pending Orders by Merchant</h3>
              <div style={{ 
                background: "#fff", 
                borderRadius: "8px", 
                border: "1px solid #e2e8f0",
                overflow: "hidden"
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>Merchant</th>
                      <th style={thStyle}>Sweep Day</th>
                      <th style={thStyle}>Pending Orders</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Oldest Order</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.pending_by_merchant?.map((m) => (
                      <tr key={m.merchant_id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={tdStyle}>{m.merchant_name || m.merchant_id}</td>
                        <td style={tdStyle}>{getSweepDayDisplay(m.sweep_day)}</td>
                        <td style={tdStyle}>{m.pending_orders}</td>
                        <td style={tdStyle}>{formatCurrency(m.pending_amount)}</td>
                        <td style={tdStyle}>{formatDate(m.oldest_order)}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => showSweepModal(m.merchant_id)}
                            disabled={sweepRunning}
                            style={smallBtnStyle}
                          >
                            Run Sweep
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!overview.pending_by_merchant || overview.pending_by_merchant.length === 0) && (
                      <tr>
                        <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#94a3b8" }}>
                          No pending orders
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Upcoming Schedule */}
              {overview.upcoming_schedule?.length > 0 && (
                <div style={{ marginTop: "1.5rem" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}><CalendarDays size={16} style={{ verticalAlign: "middle" }} /> Upcoming Sweeps (Next 7 Days)</h3>
                  <div style={{ display: "flex", gap: "1rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                    {overview.upcoming_schedule.map((day) => (
                      <div 
                        key={day.date}
                        style={{
                          minWidth: "150px",
                          padding: "1rem",
                          background: day.date === overview.today.date ? "#ecfdf5" : "#f8fafc",
                          borderRadius: "8px",
                          border: day.date === overview.today.date ? "2px solid #10b981" : "1px solid #e2e8f0"
                        }}
                      >
                        <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>{day.day_name}</div>
                        <div style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "0.5rem" }}>
                          {day.date} (Day {day.day_of_month})
                        </div>
                        <div style={{ fontSize: "0.75rem" }}>
                          {day.merchants.map((m) => m.merchant_name || m.merchant_id).join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending Orders Tab */}
          {activeTab === "pending" && (
            <div>
              {/* View Toggle + Filters */}
              <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                {/* View toggle */}
                <div style={{
                  display: "inline-flex",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  overflow: "hidden",
                }}>
                  {[
                    { key: "webhook", label: <><Radio size={12} style={{ verticalAlign: "middle" }} /> Broker View</> },
                    { key: "basket", label: <><ShoppingBasket size={12} style={{ verticalAlign: "middle" }} /> Basket View</> },
                  ].map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setPendingView(v.key)}
                      style={{
                        padding: "0.4rem 0.75rem",
                        background: pendingView === v.key ? "#4ECDC4" : "#fff",
                        color: pendingView === v.key ? "#fff" : "#374151",
                        border: "none",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <select
                  value={selectedMerchant}
                  onChange={(e) => {
                    setSelectedMerchant(e.target.value);
                    loadPendingOrders(e.target.value || null);
                    setExpandedBaskets({});
                  }}
                  style={{
                    padding: "0.5rem",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db"
                  }}
                >
                  <option value="">All Merchants</option>
                  {schedules.map((s) => (
                    <option key={s.merchant_id} value={s.merchant_id}>
                      {s.merchant_name || s.merchant_id}
                    </option>
                  ))}
                </select>
                <span style={{ color: "#64748b" }}>
                  {pendingOrders.length} order(s)
                  {pendingView === "basket"
                    ? ` in ${Object.keys(groupOrdersByBasket(pendingOrders)).length} basket(s)`
                    : ` across ${Object.keys(groupOrdersByMerchantBroker(pendingOrders)).length} broker feed(s)`}
                </span>
              </div>

              {pendingOrders.length === 0 ? (
                <div
                  style={{
                    backgroundColor: "#d1fae5",
                    border: "2px solid #10b981",
                    borderRadius: "8px",
                    padding: "1rem 1.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <CheckCircle size={24} color="#10b981" />
                  <span style={{ fontSize: "1rem", fontWeight: "600", color: "#065f46" }}>
                    No pending orders to display.
                  </span>
                </div>
              ) : pendingView === "webhook" ? (
                /* ═══════════════════════════════════════════════════════ */
                /* WEBHOOK VIEW — Merchant → Broker → Basket → Orders    */
                /* ═══════════════════════════════════════════════════════ */
                <SweepHierarchy
                  orders={pendingOrders}
                  buildWebhookPayload={buildWebhookPayload}
                  groupOrdersByMerchantBroker={groupOrdersByMerchantBroker}
                  formatCurrency={formatCurrency}
                  jsonViewMode={jsonViewMode}
                  JsonToggle={JsonToggle}
                  JsonBlock={JsonBlock}
                />
              ) : (
                /* ═══════════════════════════════════════════════════════ */
                /* BASKET VIEW — Original grouping by basket_id           */
                /* ═══════════════════════════════════════════════════════ */
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <button
                      onClick={() => {
                        const baskets = groupOrdersByBasket(pendingOrders);
                        const allExpanded = Object.keys(baskets).every(k => expandedBaskets[k]);
                        if (allExpanded) {
                          setExpandedBaskets({});
                        } else {
                          const newExpanded = {};
                          Object.keys(baskets).forEach(k => newExpanded[k] = true);
                          setExpandedBaskets(newExpanded);
                        }
                      }}
                      style={{
                        padding: "0.375rem 0.75rem",
                        background: "#f3f4f6",
                        color: "#374151",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      {Object.keys(groupOrdersByBasket(pendingOrders)).every(k => expandedBaskets[k]) ? "Collapse All" : "Expand All"}
                    </button>
                  </div>
                  {Object.entries(groupOrdersByBasket(pendingOrders)).map(([basketId, basketOrders]) => {
                    const isExpanded = expandedBaskets[basketId];
                    const totalAmount = basketOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0);
                    const totalShares = basketOrders.reduce((sum, o) => sum + parseFloat(o.shares || 0), 0);
                    const broker = basketOrders[0]?.broker || "-";
                    const merchant = basketOrders[0]?.merchant_id || "-";

                    return (
                      <div
                        key={basketId}
                        style={{
                          background: "#fff",
                          borderRadius: "8px",
                          border: `1px solid ${isExpanded ? "#4ECDC4" : "#e2e8f0"}`,
                          overflow: "hidden",
                        }}
                      >
                        {/* Basket Header - Clickable */}
                        <div
                          onClick={() => setExpandedBaskets(prev => ({ ...prev, [basketId]: !prev[basketId] }))}
                          style={{
                            padding: "0.75rem 1rem",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: isExpanded ? "#f0fdfa" : "#fff",
                            transition: "background 0.15s",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.85rem", color: "#1e293b" }}>
                                <ShoppingBasket size={14} style={{ verticalAlign: "middle" }} /> <LineageLink id={basketId} type="basket">{basketId}</LineageLink>
                              </span>
                              <span style={{
                                padding: "2px 8px",
                                background: "#fef3c7",
                                color: "#92400e",
                                borderRadius: "999px",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                              }}>
                                {basketOrders.length} orders
                              </span>
                              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                Broker: <strong>{broker}</strong>
                              </span>
                              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                Merchant: <strong>{merchant}</strong>
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "16px", fontSize: "0.8rem", color: "#475569" }}>
                              <span>Amount: <strong>{formatCurrency(totalAmount)}</strong></span>
                              <span>Shares: <strong>{totalShares.toFixed(4)}</strong></span>
                            </div>
                          </div>
                          <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </span>
                        </div>

                        {/* Expanded Orders Table */}
                        {isExpanded && (
                          <div style={{ borderTop: "1px solid #e2e8f0", overflow: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  <th style={thStyle}>Order ID</th>
                                  <th style={thStyle}>Member</th>
                                  <th style={thStyle}>Symbol</th>
                                  <th style={thStyle}>Shares</th>
                                  <th style={thStyle}>Amount</th>
                                  <th style={thStyle}>Status</th>
                                  <th style={thStyle}>Placed At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {basketOrders.map((o) => (
                                  <tr key={o.order_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td style={tdStyle}><LineageLink id={String(o.order_id)} type="order">{o.order_id}</LineageLink></td>
                                    <td style={tdStyle}>{o.member_id}</td>
                                    <td style={{ ...tdStyle, fontWeight: "600" }}>{o.symbol}</td>
                                    <td style={tdStyle}>{parseFloat(o.shares).toFixed(4)}</td>
                                    <td style={tdStyle}>{formatCurrency(o.amount)}</td>
                                    <td style={tdStyle}>
                                      <span style={{
                                        padding: "0.125rem 0.5rem",
                                        background: "#fef3c7",
                                        color: "#92400e",
                                        borderRadius: "999px",
                                        fontSize: "0.7rem"
                                      }}>
                                        {o.status}
                                      </span>
                                    </td>
                                    <td style={tdStyle}>{formatDate(o.placed_at)}</td>
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
              )}
            </div>
          )}

          {/* Schedules Tab */}
          {activeTab === "schedules" && (
            <div>
              <div style={{ 
                background: "#fff", 
                borderRadius: "8px", 
                border: "1px solid #e2e8f0",
                overflow: "hidden"
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>Merchant</th>
                      <th style={thStyle}>Sweep Day</th>
                      <th style={thStyle}>Last Modified</th>
                      <th style={thStyle}>Pending Orders</th>
                      <th style={thStyle}>Pending Amount</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.merchant_id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={tdStyle}>{s.merchant_name || s.merchant_id}</td>
                        <td style={tdStyle}>{getSweepDayDisplay(s.sweep_day)}</td>
                        <td style={tdStyle}>{formatDate(s.sweep_modified_at)}</td>
                        <td style={tdStyle}>{s.pending_orders || 0}</td>
                        <td style={tdStyle}>{formatCurrency(s.pending_amount)}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => showSweepModal(s.merchant_id)}
                            disabled={sweepRunning || !s.pending_orders}
                            style={{
                              ...smallBtnStyle,
                              opacity: s.pending_orders ? 1 : 0.5
                            }}
                          >
                            Run Sweep
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {history.length === 0 ? (
                <div style={{
                  padding: "2rem", textAlign: "center", color: "#94a3b8",
                  background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0",
                }}>
                  No sweep history yet
                </div>
              ) : history.map((h) => {
                let brokers = h.brokers_notified;
                if (typeof brokers === "string") {
                  try { brokers = JSON.parse(brokers); } catch { brokers = [brokers]; }
                }
                return (
                  <HistoryCard
                    key={h.batch_id}
                    h={h}
                    brokers={brokers}
                    formatDate={formatDate}
                    formatCurrency={formatCurrency}
                    buildWebhookPayload={buildWebhookPayload}
                    groupOrdersByMerchantBroker={groupOrdersByMerchantBroker}
                    jsonViewMode={jsonViewMode}
                    JsonToggle={JsonToggle}
                    JsonBlock={JsonBlock}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, subtext, color }) {
  return (
    <div style={{
      padding: "1rem",
      background: "#fff",
      borderRadius: "8px",
      border: "1px solid #e2e8f0",
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "0.25rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1e293b" }}>
        {value}
      </div>
      {subtext && (
        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SweepHierarchy — Merchant → Broker (webhook) → Basket → Orders tree
// ═══════════════════════════════════════════════════════════════════════════

function SweepHierarchy({ orders, buildWebhookPayload, groupOrdersByMerchantBroker, formatCurrency, jsonViewMode, JsonToggle, JsonBlock }) {
  const [expandedMerchants, setExpandedMerchants] = useState(new Set());
  const [expandedBrokers, setExpandedBrokers] = useState(new Set());
  const [expandedBaskets, setExpandedBaskets] = useState(new Set());
  const [showPayload, setShowPayload] = useState(new Set());

  const toggle = (setter, key) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Build merchant → broker → basket hierarchy from flat orders ──
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
    hierarchy[mId].totalAmount += parseFloat(o.amount || 0);
    hierarchy[mId].memberSet.add(o.member_id);

    if (!hierarchy[mId].brokers[br]) {
      hierarchy[mId].brokers[br] = { broker: br, baskets: {}, orders: [], totalAmount: 0, memberSet: new Set() };
    }
    hierarchy[mId].brokers[br].orders.push(o);
    hierarchy[mId].brokers[br].totalAmount += parseFloat(o.amount || 0);
    hierarchy[mId].brokers[br].memberSet.add(o.member_id);

    if (!hierarchy[mId].brokers[br].baskets[bk]) {
      hierarchy[mId].brokers[br].baskets[bk] = { basket_id: bk, member_id: o.member_id, orders: [], totalAmount: 0 };
    }
    hierarchy[mId].brokers[br].baskets[bk].orders.push(o);
    hierarchy[mId].brokers[br].baskets[bk].totalAmount += parseFloat(o.amount || 0);
  }

  const badge = (text, bg, color) => (
    <span style={{
      fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px",
      borderRadius: 4, background: bg, color, whiteSpace: "nowrap",
    }}>
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
    <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {row.memberSet && badge(`${row.memberSet.size} mbrs`, "#f0f9ff", "#0369a1")}
      {badge(`${row.orders.length} orders`, "#faf5ff", "#7c3aed")}
      {badge(formatCurrency(row.totalAmount), "#f0fdf4", "#15803d")}
    </div>
  );

  const basketPills = (bk) => (
    <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {badge(`${bk.orders.length} orders`, "#faf5ff", "#7c3aed")}
      {badge(formatCurrency(bk.totalAmount), "#f0fdf4", "#15803d")}
    </div>
  );

  const merchantKeys = Object.keys(hierarchy).sort();

  return (
    <div style={{
      background: "#fff", borderRadius: "8px",
      border: "1px solid #e2e8f0", overflow: "hidden",
    }}>
      <div style={{
        padding: "0.5rem 0.75rem", background: "#f8fafc",
        fontWeight: 600, fontSize: "0.8rem",
        borderBottom: "1px solid #e2e8f0", color: "#374151",
      }}>
        Broker Feeds — {merchantKeys.length} merchant(s)
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
              {badge(`${Object.keys(m.brokers).length} broker(s)`, "#e0e7ff", "#3730a3")}
              {pills(m)}
              {mOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
            </div>

            {/* ── Level 2: Brokers (webhook feeds) ── */}
            {mOpen && Object.keys(m.brokers).sort().map((brKey) => {
              const br = m.brokers[brKey];
              const brId = `${mId}|${brKey}`;
              const brOpen = expandedBrokers.has(brId);
              const payloadVisible = showPayload.has(brId);

              // Build payload for this merchant-broker combo
              const webhookGroup = {
                merchant_id: m.merchant_id,
                merchant_name: m.merchant_name,
                broker: br.broker,
                orders: br.orders,
              };

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
                    {pills(br)}
                    {brOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                  </div>

                  {brOpen && (
                    <div>
                      {/* Webhook payload toggle */}
                      <div style={{
                        paddingLeft: `${12 + 2 * 24}px`, paddingRight: 12,
                        paddingTop: 6, paddingBottom: 6,
                        display: "flex", alignItems: "center", gap: 8,
                        borderBottom: "1px solid #f1f5f9",
                        background: "#fafbff",
                      }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggle(setShowPayload, brId); }}
                          style={{
                            padding: "4px 12px", background: payloadVisible ? "#64748b" : "#6366f1",
                            color: "#fff", border: "none", borderRadius: "4px",
                            fontSize: "0.72rem", fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          {payloadVisible
                            ? "Hide Payload"
                            : <><Upload size={12} style={{ verticalAlign: "middle" }} /> Broker Payload</>
                          }
                        </button>
                        {payloadVisible && (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <JsonToggle />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(JSON.stringify(buildWebhookPayload(webhookGroup), null, 2));
                              }}
                              style={{
                                padding: "4px 12px", background: "#f3f4f6",
                                border: "1px solid #d1d5db", borderRadius: "4px",
                                fontSize: "0.7rem", cursor: "pointer", fontWeight: 500,
                              }}
                            >
                              <ClipboardList size={12} style={{ verticalAlign: "middle" }} /> Copy JSON
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Webhook payload JSON */}
                      {payloadVisible && (
                        <div style={{ paddingLeft: `${12 + 2 * 24}px`, paddingRight: 12, paddingBottom: 8 }}>
                          <JsonBlock
                            data={buildWebhookPayload(webhookGroup)}
                            maxHeight={300}
                            darkBg={jsonViewMode === "raw"}
                          />
                        </div>
                      )}

                      {/* ── Level 3: Baskets ── */}
                      {Object.keys(br.baskets).sort().map((bkId) => {
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
                              <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>
                                <LineageLink id={bkId} type="basket">{bkId}</LineageLink>
                              </span>
                              {bk.member_id && badge(`member: ${bk.member_id}`, "#fef3c7", "#92400e")}
                              {basketPills(bk)}
                              {bkOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
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
                                      <th style={thStyle}>Price</th>
                                      <th style={thStyle}>Shares</th>
                                      <th style={thStyle}>Points</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bk.orders.map((o, i) => (
                                      <tr key={o.order_id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                                          {o.order_id
                                            ? <LineageLink id={String(o.order_id)} type="order">{o.order_id}</LineageLink>
                                            : i + 1}
                                        </td>
                                        <td style={{ ...tdStyle, fontWeight: 600 }}>{o.symbol}</td>
                                        <td style={tdStyle}>{formatCurrency(o.amount)}</td>
                                        <td style={tdStyle}>
                                          {o.price ? formatCurrency(o.price) : <span style={{ color: "#ef4444", fontSize: "0.72rem" }}>—</span>}
                                        </td>
                                        <td style={tdStyle}>{parseFloat(o.shares || 0).toFixed(4)}</td>
                                        <td style={tdStyle}>{parseInt(o.points_used || 0, 10).toLocaleString()}</td>
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
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Per-Basket Result Row with expandable request/response
function BasketResultRow({ br, formatCurrency, jsonViewMode, JsonToggle, JsonBlock }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: "0.5rem" }}>
      {/* Summary Row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.5rem 0.75rem",
          background: br.acknowledged ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
          borderRadius: expanded ? "6px 6px 0 0" : "6px",
          fontSize: "0.825rem",
          cursor: "pointer",
          userSelect: "none",
          border: `1px solid ${br.acknowledged ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
          borderBottom: expanded ? "none" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span>{br.acknowledged ? <CheckCircle2 size={14} color="#10b981" /> : <AlertTriangle size={14} color="#f59e0b" />}</span>
          <strong>{br.merchant_name || br.merchant_id}</strong>
          <span style={{ color: "#64748b" }}>→</span>
          <strong style={{ color: "#6366f1" }}>{br.broker}</strong>
          {br.broker_type === "alpaca" && (
            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#fef3c7", color: "#92400e" }}>API</span>
          )}
          {br.broker_type === "webhook" && (
            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#e0e7ff", color: "#3730a3" }}>WEBHOOK</span>
          )}
          <span style={{ color: "#64748b" }}>
            {br.member_count || 1} member(s) · {br.order_count} order(s) · {formatCurrency(br.total_amount)}
          </span>
          {br.symbols && (
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
              [{br.symbols}]
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ textAlign: "right", fontSize: "0.75rem" }}>
            {br.acknowledged ? (
              <>
                <span style={{ color: "#059669", fontWeight: 600 }}>
                  ACK {br.acknowledged_at ? new Date(br.acknowledged_at).toLocaleTimeString() : ""}
                </span>
                {br.broker_ref && (
                  <span style={{ color: "#64748b", fontFamily: "monospace", marginLeft: 6 }}>
                    <LineageLink id={br.broker_ref} type="broker">{br.broker_ref}</LineageLink>
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: "#dc2626" }}>
                {br.error || "Not acknowledged"}
              </span>
            )}
          </div>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </div>

      {/* Expanded Request / Response */}
      {expanded && (
        <div style={{
          border: `1px solid ${br.acknowledged ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
          borderTop: "none",
          borderRadius: "0 0 6px 6px",
          overflow: "hidden",
        }}>
          {/* Toggle bar */}
          <div style={{ padding: "0.5rem 0.75rem", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end" }}>
            <JsonToggle />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "120px" }}>
            {/* Request */}
            <div style={{ borderRight: "1px solid #e2e8f0" }}>
              <div style={{
                padding: "0.375rem 0.75rem",
                background: "#f1f5f9",
                fontWeight: 600,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                color: "#475569",
                letterSpacing: "0.05em",
              }}>
                <Upload size={12} style={{ verticalAlign: "middle" }} /> {br.broker_type === "alpaca" ? "Alpaca API Request" : "Request Payload"}
              </div>
              {br.request ? (
                <JsonBlock data={br.request} maxHeight={300} />
              ) : (
                <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.7rem", color: "#94a3b8", fontFamily: "monospace" }}>
                  — no request sent —
                </div>
              )}
            </div>

            {/* Response */}
            <div>
              <div style={{
                padding: "0.375rem 0.75rem",
                background: br.acknowledged ? "#ecfdf5" : "#fef2f2",
                fontWeight: 600,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                color: "#475569",
                letterSpacing: "0.05em",
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span><Download size={12} style={{ verticalAlign: "middle" }} /> {br.broker_type === "alpaca" ? "Alpaca API Response" : "Response Body"}</span>
                {br.http_status && (
                  <span style={{
                    color: br.http_status >= 200 && br.http_status < 300 ? "#059669" : "#dc2626"
                  }}>
                    HTTP {br.http_status}
                  </span>
                )}
              </div>
              {(br.response?.body || br.response) ? (
                <JsonBlock data={br.response?.body || br.response} maxHeight={300} />
              ) : (
                <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.7rem", color: "#94a3b8", fontFamily: "monospace" }}>
                  — no response —
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const thStyle = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontWeight: "600",
  fontSize: "0.75rem",
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em"
};

const tdStyle = {
  padding: "0.75rem 1rem",
  fontSize: "0.875rem"
};

const smallBtnStyle = {
  padding: "0.375rem 0.75rem",
  background: "#4ECDC4",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  fontSize: "0.75rem",
  cursor: "pointer"
};

// Expandable History Card — loads sweep orders into hierarchy on expand
function HistoryCard({ h, brokers, formatDate, formatCurrency, buildWebhookPayload, groupOrdersByMerchantBroker, jsonViewMode, JsonToggle, JsonBlock }) {
  const [expanded, setExpanded] = useState(false);
  const [sweepOrders, setSweepOrders] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const hasErrors = h.has_errors || (Array.isArray(h.errors) && h.errors.length > 0);

  const loadSweepOrders = async () => {
    if (sweepOrders) return;
    setOrdersLoading(true);
    try {
      const res = await apiPost("get_sweep_status.php", { action: "sweep_orders", batch_id: h.batch_id });
      if (res.success) {
        setSweepOrders(res.orders || []);
      } else {
        console.error("sweep_orders failed:", res.error);
        setSweepOrders([]);
      }
    } catch (err) {
      console.error("sweep_orders error:", err);
      setSweepOrders([]);
    }
    setOrdersLoading(false);
  };

  const handleExpand = () => {
    if (!expanded) loadSweepOrders();
    setExpanded(!expanded);
  };

  return (
    <div style={{
      background: "#fff", borderRadius: "8px",
      border: `1px solid ${expanded ? "#6366f1" : "#e2e8f0"}`,
      overflow: "hidden",
    }}>
      {/* ── Header row ── */}
      <div
        onClick={handleExpand}
        style={{
          padding: "0.75rem 1rem", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: expanded ? "#eef2ff" : "#fff",
          transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.82rem", color: "#1e293b" }}>
              <LineageLink id={h.batch_id} type="sweep">{h.batch_id}</LineageLink>
            </span>
            {hasErrors ? (
              <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#fee2e2", color: "#dc2626" }}>
                <AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> Errors
              </span>
            ) : (
              <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#d1fae5", color: "#059669" }}>
                <CheckCircle2 size={12} style={{ verticalAlign: "middle" }} /> OK
              </span>
            )}
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#faf5ff", color: "#7c3aed" }}>
              {h.merchants_processed} merchant(s)
            </span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#f0fdf4", color: "#15803d" }}>
              {h.orders_confirmed} placed
            </span>
            {h.orders_failed > 0 && (
              <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#fee2e2", color: "#dc2626" }}>
                {h.orders_failed} failed
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "#64748b" }}>
            <span>{formatDate(h.started_at)}</span>
            <span>Duration: <strong>{h.duration_seconds || 0}s</strong></span>
            {Array.isArray(brokers) && brokers.length > 0 && (
              <span>Brokers: <strong>{brokers.join(", ")}</strong></span>
            )}
          </div>
        </div>
        <span style={{ color: "#94a3b8" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* ── Expanded: hierarchy + errors/logs ── */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e2e8f0" }}>
          {/* Order hierarchy */}
          <div style={{ padding: "0.75rem" }}>
            {ordersLoading ? (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "#64748b" }}>Loading sweep orders...</div>
            ) : sweepOrders && sweepOrders.length > 0 ? (
              <SweepHierarchy
                orders={sweepOrders}
                buildWebhookPayload={buildWebhookPayload}
                groupOrdersByMerchantBroker={groupOrdersByMerchantBroker}
                formatCurrency={formatCurrency}
                jsonViewMode={jsonViewMode}
                JsonToggle={JsonToggle}
                JsonBlock={JsonBlock}
              />
            ) : (
              <div style={{ padding: "1rem", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
                No order detail available for this sweep.
              </div>
            )}
          </div>

          {/* Errors / Logs toggle */}
          <div style={{ padding: "0 0.75rem 0.75rem" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowLogs(!showLogs); }}
              style={{
                padding: "4px 12px",
                background: showLogs ? "#64748b" : hasErrors ? "#ef4444" : "#e2e8f0",
                color: showLogs ? "#fff" : hasErrors ? "#fff" : "#374151",
                border: "none", borderRadius: "4px",
                fontSize: "0.72rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              {showLogs
                ? "Hide Logs"
                : hasErrors
                  ? <><AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> Errors ({h.errors?.length || 0}) & Logs</>
                  : <><ClipboardList size={12} style={{ verticalAlign: "middle" }} /> Logs ({h.log_data?.length || 0})</>
              }
            </button>

            {showLogs && (
              <div style={{
                marginTop: "0.5rem", display: "grid", gridTemplateColumns: "1fr 1fr",
                border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden", minHeight: "80px",
              }}>
                {/* Errors */}
                <div style={{ borderRight: "1px solid #e2e8f0" }}>
                  <div style={{
                    padding: "0.375rem 0.75rem",
                    background: hasErrors ? "#fef2f2" : "#f0fdf4",
                    fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase",
                    color: hasErrors ? "#991b1b" : "#166534",
                  }}>
                    {hasErrors
                      ? <><XCircle size={12} style={{ verticalAlign: "middle" }} /> Errors ({h.errors?.length || 0})</>
                      : <><CheckCircle2 size={12} style={{ verticalAlign: "middle" }} /> No Errors</>
                    }
                  </div>
                  <pre style={{
                    margin: 0, padding: "0.5rem 0.75rem", fontSize: "0.7rem",
                    fontFamily: "monospace", background: "#fafafa",
                    maxHeight: "200px", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {Array.isArray(h.errors) && h.errors.length > 0 ? h.errors.join("\n") : "— none —"}
                  </pre>
                </div>

                {/* Log Data */}
                <div>
                  <div style={{
                    padding: "0.375rem 0.75rem", background: "#f1f5f9",
                    fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", color: "#475569",
                  }}>
                    <ClipboardList size={12} style={{ verticalAlign: "middle" }} /> Log ({h.log_data?.length || 0} entries)
                  </div>
                  <pre style={{
                    margin: 0, padding: "0.5rem 0.75rem", fontSize: "0.65rem",
                    fontFamily: "monospace", background: "#fafafa",
                    maxHeight: "200px", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {Array.isArray(h.log_data) && h.log_data.length > 0 ? h.log_data.join("\n") : "— no log data —"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
