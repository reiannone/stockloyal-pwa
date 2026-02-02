import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api"; // Use existing api helper

/**
 * SweepAdmin - Admin page for managing the sweep process
 * 
 * Features:
 * - View sweep status overview
 * - See upcoming sweep schedules
 * - View pending orders by merchant
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

  // Run sweep
  const runSweep = async (merchantId = null) => {
    if (!window.confirm(
      merchantId 
        ? `Run sweep for merchant ${merchantId}?`
        : "Run sweep for ALL eligible merchants?"
    )) {
      return;
    }

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

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "1.5rem"
      }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: "bold", color: "#1e293b" }}>
          🔄 Sweep Process Manager
        </h1>
        <button
          onClick={() => runSweep()}
          disabled={sweepRunning}
          style={{
            padding: "0.75rem 1.5rem",
            background: sweepRunning ? "#94a3b8" : "#4ECDC4",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontWeight: "600",
            cursor: sweepRunning ? "not-allowed" : "pointer"
          }}
        >
          {sweepRunning ? "Running..." : "▶️ Run Sweep Now"}
        </button>
      </div>

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
          <strong>{lastResult.success ? "✅ Sweep Completed" : "❌ Sweep Failed"}</strong>
          {lastResult.results && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Batch: {lastResult.results.batch_id} | 
              Orders Confirmed: {lastResult.results.orders_confirmed} | 
              Failed: {lastResult.results.orders_failed}
            </div>
          )}
          {lastResult.error && (
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
                            onClick={() => runSweep(m.merchant_id)}
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

          {/* Pending Orders Tab */}
          {activeTab === "pending" && (
            <div>
              <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
                <select
                  value={selectedMerchant}
                  onChange={(e) => {
                    setSelectedMerchant(e.target.value);
                    loadPendingOrders(e.target.value || null);
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
                </span>
              </div>

              <div style={{ 
                background: "#fff", 
                borderRadius: "8px", 
                border: "1px solid #e2e8f0",
                overflow: "auto",
                maxHeight: "600px"
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f8fafc" }}>
                    <tr>
                      <th style={thStyle}>Order ID</th>
                      <th style={thStyle}>Member</th>
                      <th style={thStyle}>Symbol</th>
                      <th style={thStyle}>Shares</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Broker</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Placed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrders.map((o) => (
                      <tr key={o.order_id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={tdStyle}>{o.order_id}</td>
                        <td style={tdStyle}>{o.member_id}</td>
                        <td style={{ ...tdStyle, fontWeight: "600" }}>{o.symbol}</td>
                        <td style={tdStyle}>{parseFloat(o.shares).toFixed(4)}</td>
                        <td style={tdStyle}>{formatCurrency(o.amount)}</td>
                        <td style={tdStyle}>{o.broker || "-"}</td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: "0.125rem 0.5rem",
                            background: "#fef3c7",
                            color: "#92400e",
                            borderRadius: "999px",
                            fontSize: "0.75rem"
                          }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={tdStyle}>{formatDate(o.placed_at)}</td>
                      </tr>
                    ))}
                    {pendingOrders.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#94a3b8" }}>
                          No pending orders
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                            onClick={() => runSweep(s.merchant_id)}
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
                      <th style={thStyle}>Confirmed</th>
                      <th style={thStyle}>Failed</th>
                      <th style={thStyle}>Brokers</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.batch_id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                          {h.batch_id}
                        </td>
                        <td style={tdStyle}>{formatDate(h.started_at)}</td>
                        <td style={tdStyle}>{h.duration_seconds}s</td>
                        <td style={tdStyle}>{h.merchants_processed}</td>
                        <td style={{ ...tdStyle, color: "#059669" }}>{h.orders_confirmed}</td>
                        <td style={{ ...tdStyle, color: h.orders_failed > 0 ? "#dc2626" : "#94a3b8" }}>
                          {h.orders_failed}
                        </td>
                        <td style={tdStyle}>
                          {h.brokers_notified?.join(", ") || "-"}
                        </td>
                        <td style={tdStyle}>
                          {h.has_errors ? (
                            <span style={{ color: "#dc2626" }}>⚠️ Errors</span>
                          ) : (
                            <span style={{ color: "#059669" }}>✅ OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
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
