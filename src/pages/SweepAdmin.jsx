import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api"; // Use existing api helper
import { CheckCircle } from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";

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

  // ── Modal State ──
  const [modal, setModal] = useState({
    show: false,
    title: "",
    message: "",
    details: null,
    confirmText: "Confirm",
    confirmColor: "#4ECDC4",
    icon: "🔄",
    data: null,
  });

  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

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
      icon: "🔄",
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
      <OrderPipeline currentStep={2} />

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
              {sweepRunning ? "Running..." : "▶️ Run Sweep Now"}
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
              {loading ? "Loading..." : "🔄 Refresh"}
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
          background: lastResult.success ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${lastResult.success ? "#10b981" : "#ef4444"}`
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{lastResult.success ? "✅ Sweep Completed" : "❌ Sweep Failed"}</strong>
            {lastResult.results?.batch_id && (
              <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>
                {lastResult.results.batch_id}
              </span>
            )}
          </div>

          {lastResult.results && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <span>📦 Orders Placed: <strong>{lastResult.results.orders_placed ?? 0}</strong></span>
                <span>❌ Failed: <strong>{lastResult.results.orders_failed ?? 0}</strong></span>
                <span>🏪 Merchants: <strong>{lastResult.results.merchants_processed ?? 0}</strong></span>
                <span>🧺 Baskets: <strong>{lastResult.results.baskets_processed ?? 0}</strong></span>
                <span>⏱ Duration: <strong>{lastResult.results.duration_seconds ?? 0}s</strong></span>
              </div>

              {/* Per-Basket Notification Results */}
              {lastResult.results.basket_results?.length > 0 && (
                <div style={{ marginTop: "0.75rem", borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "0.75rem" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.8rem", textTransform: "uppercase", color: "#475569" }}>
                    Broker Notifications — Per Basket
                  </div>
                  {lastResult.results.basket_results.map((br, i) => (
                    <BasketResultRow key={i} br={br} formatCurrency={formatCurrency} />
                  ))}
                </div>
              )}

              {/* Errors */}
              {lastResult.results.errors?.length > 0 && (
                <div style={{ marginTop: "0.5rem", color: "#dc2626", fontSize: "0.8rem" }}>
                  {lastResult.results.errors.map((e, i) => (
                    <div key={i}>⚠️ {e}</div>
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
                    📅 Scheduled for Today ({overview.today.date})
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
                  <h3 style={{ marginBottom: "0.75rem" }}>📆 Upcoming Sweeps (Next 7 Days)</h3>
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

          {/* Pending Orders Tab - Grouped by Basket */}
          {activeTab === "pending" && (
            <div>
              <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
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
                  {pendingOrders.length} order(s) in {Object.keys(groupOrdersByBasket(pendingOrders)).length} basket(s)
                </span>
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
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
                                🧺 {basketId}
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
                            {isExpanded ? "▲" : "▼"}
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
                                    <td style={tdStyle}>{o.order_id}</td>
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
                      <th style={thStyle}>Batch ID</th>
                      <th style={thStyle}>Started</th>
                      <th style={thStyle}>Duration</th>
                      <th style={thStyle}>Merchants</th>
                      <th style={thStyle}>Placed</th>
                      <th style={thStyle}>Failed</th>
                      <th style={thStyle}>Brokers Notified</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      // brokers_notified may come as JSON string or array
                      let brokers = h.brokers_notified;
                      if (typeof brokers === "string") {
                        try { brokers = JSON.parse(brokers); } catch { brokers = [brokers]; }
                      }
                      return (
                        <HistoryRow
                          key={h.batch_id}
                          h={h}
                          brokers={brokers}
                          tdStyle={tdStyle}
                          formatDate={formatDate}
                        />
                      );
                    })}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#94a3b8" }}>
                          No sweep history yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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

// Per-Basket Result Row with expandable request/response
function BasketResultRow({ br, formatCurrency }) {
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
          <span>{br.acknowledged ? "✅" : "⚠️"}</span>
          <strong>{br.broker}</strong>
          <span style={{ color: "#64748b" }}>→</span>
          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#6366f1" }}>
            {br.basket_id}
          </span>
          <span style={{ color: "#64748b" }}>
            {br.member_id} · {br.order_count} order(s) · {formatCurrency(br.total_amount)}
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
                    {br.broker_ref}
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
            {expanded ? "▲" : "▼"}
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
                📤 Request Payload
              </div>
              <pre style={{
                margin: 0,
                padding: "0.5rem 0.75rem",
                fontSize: "0.7rem",
                fontFamily: "monospace",
                background: "#fafafa",
                overflowX: "auto",
                maxHeight: "300px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {br.request ? JSON.stringify(br.request, null, 2) : "— no request sent —"}
              </pre>
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
                <span>📥 Response Body</span>
                {br.http_status && (
                  <span style={{
                    color: br.http_status >= 200 && br.http_status < 300 ? "#059669" : "#dc2626"
                  }}>
                    HTTP {br.http_status}
                  </span>
                )}
              </div>
              <pre style={{
                margin: 0,
                padding: "0.5rem 0.75rem",
                fontSize: "0.7rem",
                fontFamily: "monospace",
                background: "#fafafa",
                overflowX: "auto",
                maxHeight: "300px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {br.response?.body
                  ? JSON.stringify(br.response.body, null, 2)
                  : br.response
                    ? JSON.stringify(br.response, null, 2)
                    : "— no response (webhook not configured) —"}
              </pre>
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

// Expandable History Row — shows errors and log_data on click
function HistoryRow({ h, brokers, tdStyle, formatDate }) {
  const [expanded, setExpanded] = useState(false);
  const hasErrors = h.has_errors || (Array.isArray(h.errors) && h.errors.length > 0);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{
          borderBottom: expanded ? "none" : "1px solid #e2e8f0",
          cursor: "pointer",
          background: expanded ? "#f8fafc" : undefined,
        }}
      >
        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
          {h.batch_id}
          <span style={{ marginLeft: 6, fontSize: "0.65rem", color: "#94a3b8" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </td>
        <td style={tdStyle}>{formatDate(h.started_at)}</td>
        <td style={tdStyle}>{h.duration_seconds || 0}s</td>
        <td style={tdStyle}>{h.merchants_processed}</td>
        <td style={{ ...tdStyle, color: "#059669" }}>{h.orders_confirmed}</td>
        <td style={{ ...tdStyle, color: h.orders_failed > 0 ? "#dc2626" : "#94a3b8" }}>
          {h.orders_failed}
        </td>
        <td style={tdStyle}>
          {Array.isArray(brokers) && brokers.length > 0 ? brokers.join(", ") : "-"}
        </td>
        <td style={tdStyle}>
          {hasErrors ? (
            <span style={{ color: "#dc2626" }}>⚠️ Errors</span>
          ) : (
            <span style={{ color: "#059669" }}>✅ OK</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
          <td colSpan={8} style={{ padding: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "80px" }}>
              {/* Errors */}
              <div style={{ borderRight: "1px solid #e2e8f0" }}>
                <div style={{
                  padding: "0.375rem 0.75rem",
                  background: hasErrors ? "#fef2f2" : "#f0fdf4",
                  fontWeight: 600,
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  color: hasErrors ? "#991b1b" : "#166534",
                }}>
                  {hasErrors ? `❌ Errors (${h.errors?.length || 0})` : "✅ No Errors"}
                </div>
                <pre style={{
                  margin: 0,
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.7rem",
                  fontFamily: "monospace",
                  background: "#fafafa",
                  maxHeight: "200px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {Array.isArray(h.errors) && h.errors.length > 0
                    ? h.errors.join("\n")
                    : "— none —"}
                </pre>
              </div>

              {/* Log Data */}
              <div>
                <div style={{
                  padding: "0.375rem 0.75rem",
                  background: "#f1f5f9",
                  fontWeight: 600,
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  color: "#475569",
                }}>
                  📋 Log ({h.log_data?.length || 0} entries)
                </div>
                <pre style={{
                  margin: 0,
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.65rem",
                  fontFamily: "monospace",
                  background: "#fafafa",
                  maxHeight: "200px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {Array.isArray(h.log_data) && h.log_data.length > 0
                    ? h.log_data.join("\n")
                    : "— no log data —"}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
