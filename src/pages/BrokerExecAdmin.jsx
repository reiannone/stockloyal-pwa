import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api";
import {
  Package, RefreshCw, CheckCircle2, XCircle, TrendingUp,
  ShoppingBasket, Clock, Landmark, ChevronUp, ChevronDown,
  Zap, Hourglass, Info, Store, Building2, ClipboardList, AlertTriangle,
  Timer, Play, Activity, Server, CalendarClock, BarChart3,
  CircleDot, CircleOff, Wifi, WifiOff,
} from "lucide-react";
import OrderPipeline, { usePipelineStatus } from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";

/**
 * BrokerExecAdmin — Broker Trade Execution + Cron Monitoring
 *
 * Tabs:
 *   1. Placed Orders   — View & manually execute placed orders (simulation)
 *   2. History          — Manual execution history
 *   3. Cron Runs        — Automated cron execution monitoring dashboard
 */

export default function BrokerExecAdmin() {
  const [activeTab, setActiveTab] = useState("placed");
  const [loading, setLoading] = useState(true);
  const [placedOrders, setPlacedOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // Modal state
  const [modal, setModal] = useState({
    show: false, title: "", message: "", details: null,
    icon: <Zap size={20} color="#f59e0b" />,
    confirmText: "Execute", confirmColor: "#059669", data: null,
  });
  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  // Load placed orders (flat array, frontend groups into hierarchy)
  const loadPlacedOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("broker-execute.php", { action: "preview" });
      if (res.success) {
        const flat = [];
        for (const bg of (res.brokers || [])) {
          for (const bk of (bg.baskets || [])) {
            for (const o of (bk.orders || [])) {
              flat.push({ ...o, merchant_name: bk.merchant_name || bk.merchant_id });
            }
          }
        }
        setPlacedOrders(flat);
        setSummary(res.summary || null);
      } else {
        console.error("Preview error:", res.error);
      }
    } catch (err) {
      console.error("Failed to load placed orders:", err);
    }
    setLoading(false);
  }, []);

  // Load execution history
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiPost("broker-execute.php", { action: "history", limit: 30 });
      if (res.success) {
        setHistory(res.history || []);
      } else {
        console.error("History load error:", res.error);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, []);

  useEffect(() => {
    loadPlacedOrders();
    loadHistory();
  }, [loadPlacedOrders, loadHistory]);

  // ── Execute actions ──

  const doExecute = async (action, params = {}) => {
    closeModal();
    setExecuting(true);
    setLastResult(null);
    try {
      const res = await apiPost("broker-execute.php", { action, ...params });
      setLastResult(res);
      await loadPlacedOrders();
      await loadHistory();
    } catch (err) {
      console.error("Execution failed:", err);
      setLastResult({ success: false, error: err.message });
    }
    setExecuting(false);
  };

  const confirmExecuteAll = () => {
    setModal({
      show: true,
      title: "Execute All Orders",
      message: `Execute all ${summary?.total_orders || 0} placed orders?`,
      details: summary ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>Orders: <strong>{summary.total_orders}</strong></span>
          <span>Amount: <strong>{formatCurrency(summary.total_amount)}</strong></span>
          <span>Brokers: <strong>{summary.broker_count}</strong></span>
        </div>
      ) : null,
      icon: <Zap size={20} color="#f59e0b" />,
      confirmText: "Execute All", confirmColor: "#059669",
      data: { type: "all" },
    });
  };

  const confirmExecuteMerchant = (merchantId, merchantName, count, amount) => {
    setModal({
      show: true,
      title: "Execute Merchant Orders",
      message: `Execute all placed orders for ${merchantName || merchantId}?`,
      details: (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>Orders: <strong>{count}</strong></span>
          <span>Amount: <strong>{formatCurrency(amount)}</strong></span>
        </div>
      ),
      icon: <Store size={20} color="#8b5cf6" />,
      confirmText: "Execute Merchant", confirmColor: "#059669",
      data: { type: "merchant", merchantId },
    });
  };

  const confirmExecuteBasket = (basketId, count) => {
    setModal({
      show: true,
      title: "Execute Basket",
      message: `Execute basket ${basketId} with ${count || "?"} order(s)?`,
      icon: <ShoppingBasket size={20} color="#d97706" />,
      confirmText: "Execute Basket", confirmColor: "#059669",
      data: { type: "basket", basketId },
    });
  };

  const handleModalConfirm = () => {
    const d = modal.data;
    if (d?.type === "all") doExecute("execute");
    else if (d?.type === "merchant") doExecute("execute_merchant", { merchant_id: d.merchantId });
    else if (d?.type === "basket") doExecute("execute_basket", { basket_id: d.basketId });
  };

  const formatCurrency = (amt) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amt || 0);
  const formatDate = (d) => (d ? new Date(d).toLocaleString() : "-");

  return (
    <div className="app-container app-content">
      {/* Confirm Modal */}
      <ConfirmModal
        show={modal.show} title={modal.title} message={modal.message}
        details={modal.details} icon={modal.icon}
        confirmText={modal.confirmText} confirmColor={modal.confirmColor}
        onConfirm={handleModalConfirm} onCancel={closeModal}
      />

      {/* Header */}
      <h1 className="page-title">Broker Trade Execution</h1>
      <p className="page-deck">
        Monitor automated broker execution and manually execute placed orders. The cron job submits orders to Alpaca at market open.
      </p>

      {/* ── Order Pipeline ── */}
      <OrderPipeline currentStep={5} />

      {/* Action Bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap",
      }}>
        {/* Tabs */}
        <div style={{
          display: "inline-flex", borderRadius: "6px",
          border: "1px solid #d1d5db", overflow: "hidden",
        }}>
          {[
            { key: "placed", label: <><Zap size={12} style={{ verticalAlign: "middle" }} /> Placed</> },
            { key: "history", label: <><Clock size={12} style={{ verticalAlign: "middle" }} /> History</> },
            { key: "cron", label: <><Timer size={12} style={{ verticalAlign: "middle" }} /> Cron Runs</> },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "0.4rem 0.75rem",
                background: activeTab === t.key ? "#059669" : "#fff",
                color: activeTab === t.key ? "#fff" : "#374151",
                border: "none", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => { loadPlacedOrders(); loadHistory(); }}
            disabled={loading}
            style={{
              padding: "0.625rem 1.25rem", background: "#f1f5f9", color: "#475569",
              border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "0.875rem", cursor: "pointer",
            }}
          >
            <RefreshCw size={14} style={{ verticalAlign: "middle" }} /> Refresh
          </button>
          {activeTab === "placed" && (
            <button
              onClick={confirmExecuteAll}
              disabled={executing || !summary?.total_orders}
              style={{
                padding: "0.625rem 1.25rem",
                background: executing ? "#94a3b8" : (!summary?.total_orders ? "#e2e8f0" : "#059669"),
                color: "#fff", border: "none", borderRadius: "6px",
                fontSize: "0.875rem", fontWeight: 600,
                cursor: summary?.total_orders ? "pointer" : "not-allowed",
                opacity: executing ? 0.7 : 1,
              }}
            >
              {executing
                ? <><Hourglass size={14} style={{ verticalAlign: "middle" }} /> Executing...</>
                : <><Zap size={14} style={{ verticalAlign: "middle" }} /> Execute All Trades</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {activeTab === "placed" && summary && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem", marginBottom: "1.5rem",
        }}>
          <StatCard label="Placed Orders" value={summary.total_orders} subtext="Awaiting execution" color="#f59e0b" />
          <StatCard label="Total Amount" value={formatCurrency(summary.total_amount)} subtext="Investment value" color="#3b82f6" />
          <StatCard label="Brokers" value={summary.broker_count} subtext="Processing" color="#8b5cf6" />
          <StatCard label="Baskets" value={summary.basket_count} subtext="Member orders" color="#06b6d4" />
        </div>
      )}

      {/* Execution Result Banner */}
      {lastResult && (
        <div style={{
          padding: "1rem", marginBottom: "1.5rem", borderRadius: "8px",
          background: lastResult.success ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${lastResult.success ? "#10b981" : "#ef4444"}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              {lastResult.success
                ? <><CheckCircle2 size={14} style={{ verticalAlign: "middle" }} /> Trades Executed</>
                : <><XCircle size={14} style={{ verticalAlign: "middle" }} /> Execution Failed</>
              }
            </strong>
            {lastResult.exec_id && (
              <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>
                {lastResult.exec_id}
              </span>
            )}
          </div>
          {lastResult.success && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <span><TrendingUp size={12} style={{ verticalAlign: "middle" }} /> Executed: <strong>{lastResult.orders_executed || 0}</strong></span>
              <span><XCircle size={12} style={{ verticalAlign: "middle" }} /> Failed: <strong>{lastResult.orders_failed || 0}</strong></span>
              <span><ShoppingBasket size={12} style={{ verticalAlign: "middle" }} /> Baskets: <strong>{lastResult.baskets_processed || 0}</strong></span>
              <span><Clock size={12} style={{ verticalAlign: "middle" }} /> Duration: <strong>{lastResult.duration_seconds || 0}s</strong></span>
            </div>
          )}
          {lastResult.error && !lastResult.success && (
            <div style={{ marginTop: "0.5rem", color: "#dc2626" }}>{lastResult.error}</div>
          )}
        </div>
      )}

      {/* ── PLACED TAB ── */}
      {activeTab === "placed" && (
        <>
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Loading placed orders...</div>
          ) : placedOrders.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "3rem", background: "#fff",
              borderRadius: "8px", border: "1px solid #e2e8f0", color: "#94a3b8",
            }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}><CheckCircle2 size={32} color="#10b981" /></div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#475569" }}>No Placed Orders</div>
              <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                Run a sweep first to move pending orders to placed status.
              </div>
            </div>
          ) : (
            <ExecHierarchy
              orders={placedOrders}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              executing={executing}
              onExecuteMerchant={confirmExecuteMerchant}
              onExecuteBasket={confirmExecuteBasket}
              mode="placed"
            />
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {history.length === 0 ? (
            <div style={{
              padding: "2rem", textAlign: "center", color: "#94a3b8",
              background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0",
            }}>
              No execution history yet
            </div>
          ) : history.map((h) => (
            <ExecHistoryCard
              key={h.exec_id}
              h={h}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {/* ── CRON RUNS TAB ── */}
      {activeTab === "cron" && (
        <CronRunsTab formatCurrency={formatCurrency} formatDate={formatDate} />
      )}

      {/* Info Footer */}
      <div style={{
        marginTop: "1.5rem", padding: "1rem",
        background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: "8px", fontSize: "0.8rem", color: "#92400e",
      }}>
        <strong><Info size={14} style={{ verticalAlign: "middle" }} /> Execution Pipeline:</strong>{" "}
        The cron job runs every 5 minutes on EC2. Before submitting orders, it checks
        Alpaca's <strong>Market Calendar</strong> (holidays, early closes) and <strong>Clock API</strong> (real-time
        status). On trading days, it picks up <code>placed</code> orders, submits to Alpaca's Broker
        API, and updates status to <code>submitted</code>. Alpaca sends fill webhooks back, moving
        orders to <code>confirmed</code>. On early close days (e.g. day before Thanksgiving, close at 1:00 PM),
        the cron respects the shortened window. Manual triggers bypass market-hour checks.
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// CronRunsTab — Automated execution monitoring dashboard
// ═══════════════════════════════════════════════════════════════════════════════

function CronRunsTab({ formatCurrency, formatDate }) {
  const [cronRuns, setCronRuns] = useState([]);
  const [cronStats, setCronStats] = useState(null);
  const [cronLoading, setCronLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [filter, setFilter] = useState(null);

  const loadCronData = useCallback(async () => {
    setCronLoading(true);
    try {
      const [runsRes, statsRes] = await Promise.all([
        apiPost("cron-exec-log.php", { action: "runs", limit: 30, filter }),
        apiPost("cron-exec-log.php", { action: "stats" }),
      ]);
      if (runsRes.success) setCronRuns(runsRes.runs || []);
      if (statsRes.success) setCronStats(statsRes);
    } catch (err) {
      console.error("Cron data load failed:", err);
    }
    setCronLoading(false);
  }, [filter]);

  useEffect(() => { loadCronData(); }, [loadCronData]);

  // Auto-refresh every 30s when tab is visible
  useEffect(() => {
    const interval = setInterval(loadCronData, 30000);
    return () => clearInterval(interval);
  }, [loadCronData]);

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await apiPost("cron-exec-log.php", { action: "trigger" });
      setTriggerResult(res);
      // Reload after a brief delay to catch the new run
      setTimeout(loadCronData, 3000);
    } catch (err) {
      setTriggerResult({ success: false, error: err.message });
    }
    setTriggering(false);
  };

  const s24 = cronStats?.last_24h || {};
  const sAll = cronStats?.all_time || {};
  const pending = cronStats?.pending || {};

  return (
    <div>
      {/* Cron Stats Dashboard */}
      {cronStats && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
          gap: "0.75rem", marginBottom: "1.25rem",
        }}>
          <StatCard
            label="Pending Orders"
            value={pending.count || 0}
            subtext={pending.amount ? formatCurrency(pending.amount) + " waiting" : "None queued"}
            color={parseInt(pending.count) > 0 ? "#f59e0b" : "#10b981"}
          />
          <StatCard
            label="Runs (24h)"
            value={s24.total_runs || 0}
            subtext={`${s24.completed_runs || 0} ok · ${s24.failed_runs || 0} failed`}
            color="#3b82f6"
          />
          <StatCard
            label="Submitted (24h)"
            value={s24.total_submitted || 0}
            subtext={`${s24.total_filled || 0} filled`}
            color="#059669"
          />
          <StatCard
            label="Avg Duration"
            value={s24.avg_duration_ms ? `${Math.round(s24.avg_duration_ms)}ms` : "-"}
            subtext="Per cron run"
            color="#8b5cf6"
          />
          <StatCard
            label="Last Run"
            value={sAll.last_run ? new Date(sAll.last_run).toLocaleTimeString() : "Never"}
            subtext={sAll.last_run ? new Date(sAll.last_run).toLocaleDateString() : "No runs yet"}
            color="#06b6d4"
          />
        </div>
      )}

      {/* Action bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap",
      }}>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {[
            { key: null, label: "All" },
            { key: "completed", label: "Completed" },
            { key: "failed", label: "Failed" },
            { key: "no_orders", label: "Empty" },
          ].map(f => (
            <button
              key={f.key ?? "all"}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "0.3rem 0.6rem",
                borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600,
                border: `1px solid ${filter === f.key ? "#059669" : "#d1d5db"}`,
                background: filter === f.key ? "#ecfdf5" : "#fff",
                color: filter === f.key ? "#059669" : "#64748b",
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={loadCronData}
            disabled={cronLoading}
            style={{
              padding: "0.5rem 1rem", background: "#f1f5f9", color: "#475569",
              border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={13} style={{ verticalAlign: "middle" }} /> Refresh
          </button>
          <button
            onClick={handleTrigger}
            disabled={triggering}
            style={{
              padding: "0.5rem 1rem",
              background: triggering ? "#94a3b8" : "#1e40af",
              color: "#fff", border: "none", borderRadius: "6px",
              fontSize: "0.8rem", fontWeight: 600, cursor: triggering ? "wait" : "pointer",
            }}
          >
            {triggering
              ? <><Hourglass size={13} style={{ verticalAlign: "middle" }} /> Triggering...</>
              : <><Play size={13} style={{ verticalAlign: "middle" }} /> Trigger Now</>
            }
          </button>
        </div>
      </div>

      {/* Manual trigger result */}
      {triggerResult && (
        <div style={{
          padding: "0.75rem", marginBottom: "1rem", borderRadius: "6px",
          background: triggerResult.success ? "#dbeafe" : "#fee2e2",
          border: `1px solid ${triggerResult.success ? "#3b82f6" : "#ef4444"}`,
          fontSize: "0.82rem",
        }}>
          {triggerResult.success
            ? <><Activity size={14} style={{ verticalAlign: "middle" }} /> Manual execution triggered — refreshing in 3s...</>
            : <><XCircle size={14} style={{ verticalAlign: "middle" }} /> Trigger failed: {triggerResult.error}</>
          }
        </div>
      )}

      {/* Cron Runs List */}
      {cronLoading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Loading cron runs...</div>
      ) : cronRuns.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "3rem", background: "#fff",
          borderRadius: "8px", border: "1px solid #e2e8f0", color: "#94a3b8",
        }}>
          <Server size={32} color="#cbd5e1" />
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#475569", marginTop: "0.5rem" }}>
            No Cron Runs {filter ? `(${filter})` : ""}
          </div>
          <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
            The cron job runs automatically during market hours, or click "Trigger Now" to start one.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {cronRuns.map((run) => (
            <CronRunCard key={run.run_id} run={run} formatCurrency={formatCurrency} formatDate={formatDate} />
          ))}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// CronRunCard — Expandable card for a single cron execution run
// ═══════════════════════════════════════════════════════════════════════════════

function CronRunCard({ run, formatCurrency, formatDate }) {
  const [expanded, setExpanded] = useState(false);
  const [orders, setOrders] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const loadOrders = async () => {
    if (orders) return;
    setOrdersLoading(true);
    try {
      const res = await apiPost("cron-exec-log.php", { action: "run_orders", run_id: run.run_id });
      if (res.success) setOrders(res.orders || []);
      else setOrders([]);
    } catch (err) {
      console.error("Failed to load run orders:", err);
      setOrders([]);
    }
    setOrdersLoading(false);
  };

  const handleExpand = () => {
    if (!expanded && run.orders_found > 0) loadOrders();
    setExpanded(!expanded);
  };

  const statusConfig = {
    completed:  { bg: "#d1fae5", color: "#059669", icon: <CheckCircle2 size={13} /> },
    failed:     { bg: "#fee2e2", color: "#dc2626", icon: <XCircle size={13} /> },
    no_orders:  { bg: "#f1f5f9", color: "#64748b", icon: <CircleOff size={13} /> },
    processing: { bg: "#fef3c7", color: "#d97706", icon: <Hourglass size={13} /> },
    started:    { bg: "#dbeafe", color: "#2563eb", icon: <Activity size={13} /> },
  };

  const sc = statusConfig[run.status] || statusConfig.started;

  const triggerConfig = {
    cron:    { bg: "#f0f9ff", color: "#0369a1", label: "CRON" },
    manual:  { bg: "#faf5ff", color: "#7c3aed", label: "MANUAL" },
    webhook: { bg: "#fef3c7", color: "#92400e", label: "HOOK" },
  };
  const tc = triggerConfig[run.trigger_type] || triggerConfig.cron;

  return (
    <div style={{
      background: "#fff", borderRadius: "8px",
      border: `1px solid ${expanded ? "#059669" : "#e2e8f0"}`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={handleExpand}
        style={{
          padding: "0.6rem 0.75rem", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: expanded ? "#ecfdf5" : "#fff", transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Run ID */}
            <span style={{
              fontWeight: 700, fontFamily: "monospace", fontSize: "0.75rem", color: "#1e293b",
              maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {run.run_id}
            </span>

            {/* Status badge */}
            <span style={{
              fontSize: "0.65rem", fontWeight: 700, padding: "1px 7px", borderRadius: 4,
              background: sc.bg, color: sc.color, display: "inline-flex", alignItems: "center", gap: 3,
            }}>
              {sc.icon} {run.status.toUpperCase()}
            </span>

            {/* Trigger badge */}
            <span style={{
              fontSize: "0.62rem", fontWeight: 700, padding: "1px 6px", borderRadius: 3,
              background: tc.bg, color: tc.color, letterSpacing: "0.04em",
            }}>
              {tc.label}
            </span>

            {/* Env badge */}
            <span style={{
              fontSize: "0.62rem", fontWeight: 600, padding: "1px 6px", borderRadius: 3,
              background: run.alpaca_env === "live" ? "#fef3c7" : "#f1f5f9",
              color: run.alpaca_env === "live" ? "#92400e" : "#64748b",
            }}>
              {(run.alpaca_env || "paper").toUpperCase()}
            </span>

            {/* Market status */}
            {run.market_status && (
              <span style={{
                fontSize: "0.62rem", fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                background: run.market_status === "open" || run.market_status === "early_close"
                  ? "#d1fae5" : run.market_status === "holiday" ? "#fef3c7" : "#fee2e2",
                color: run.market_status === "open" || run.market_status === "early_close"
                  ? "#059669" : run.market_status === "holiday" ? "#92400e" : "#dc2626",
                display: "inline-flex", alignItems: "center", gap: 2,
              }}>
                {run.market_status === "open" || run.market_status === "early_close"
                  ? <Wifi size={9} /> : <WifiOff size={9} />}
                MKT {run.market_status.toUpperCase()}
              </span>
            )}

            {/* Calendar open/close times */}
            {run.market_open && run.market_close && (
              <span style={{
                fontSize: "0.6rem", fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                background: run.market_close !== "16:00" ? "#fef3c7" : "#f1f5f9",
                color: run.market_close !== "16:00" ? "#92400e" : "#64748b",
                fontFamily: "monospace",
              }}>
                {run.market_open}–{run.market_close}
                {run.market_close !== "16:00" && " ⚡"}
              </span>
            )}
          </div>

          {/* Second line: counters */}
          <div style={{ display: "flex", gap: 14, fontSize: "0.75rem", color: "#64748b", flexWrap: "wrap" }}>
            <span>{formatDate(run.started_at)}</span>
            <span>Duration: <strong>{run.duration_ms || 0}ms</strong></span>
            <span>Found: <strong>{run.orders_found}</strong></span>
            {run.orders_submitted > 0 && (
              <span style={{ color: "#059669" }}>Submitted: <strong>{run.orders_submitted}</strong></span>
            )}
            {run.orders_failed > 0 && (
              <span style={{ color: "#dc2626" }}>Failed: <strong>{run.orders_failed}</strong></span>
            )}
            {run.orders_filled > 0 && (
              <span style={{ color: "#7c3aed" }}>Filled: <strong>{run.orders_filled}</strong></span>
            )}
            {run.total_amount > 0 && (
              <span style={{ color: "#15803d" }}>{formatCurrency(run.total_amount)}</span>
            )}
          </div>
        </div>

        <span style={{ color: "#94a3b8", flexShrink: 0 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded: order table */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem" }}>
          {/* Error message if present */}
          {run.error_message && (
            <div style={{
              padding: "0.5rem 0.75rem", marginBottom: "0.75rem", borderRadius: "6px",
              background: "#fee2e2", border: "1px solid #fca5a5", fontSize: "0.8rem", color: "#dc2626",
            }}>
              <AlertTriangle size={13} style={{ verticalAlign: "middle" }} /> {run.error_message}
            </div>
          )}

          {/* Hostname info */}
          {run.hostname && (
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginBottom: "0.5rem" }}>
              <Server size={11} style={{ verticalAlign: "middle" }} /> {run.hostname}
            </div>
          )}

          {run.orders_found === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
              No orders to process in this run.
            </div>
          ) : ordersLoading ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#64748b" }}>Loading order details...</div>
          ) : orders && orders.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={thStyle}>Order</th>
                    <th style={thStyle}>Member</th>
                    <th style={thStyle}>Symbol</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Shares</th>
                    <th style={thStyle}>Alpaca ID</th>
                    <th style={thStyle}>Submit</th>
                    <th style={thStyle}>Fill Price</th>
                    <th style={thStyle}>Fill Qty</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, i) => {
                    const submitColor = {
                      submitted: "#059669",
                      rejected:  "#dc2626",
                      error:     "#dc2626",
                    }[o.submit_status] || "#64748b";

                    const alpacaColor = {
                      filled:     "#059669",
                      new:        "#3b82f6",
                      accepted:   "#2563eb",
                      canceled:   "#dc2626",
                      rejected:   "#dc2626",
                      expired:    "#92400e",
                    }[o.alpaca_status] || "#64748b";

                    return (
                      <tr key={o.order_id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.72rem" }}>
                          #{o.order_id}
                        </td>
                        <td style={{ ...tdStyle, fontSize: "0.75rem" }}>{o.member_id}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{o.symbol}</td>
                        <td style={tdStyle}>${parseFloat(o.amount || 0).toFixed(2)}</td>
                        <td style={tdStyle}>{parseFloat(o.shares || 0).toFixed(4)}</td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.65rem", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {o.alpaca_order_id || "-"}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 600, padding: "1px 6px",
                            borderRadius: 3, background: o.submit_status === "submitted" ? "#d1fae5" : "#fee2e2",
                            color: submitColor,
                          }}>
                            {o.submit_status || "-"}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "#059669" }}>
                          {o.filled_price ? `$${parseFloat(o.filled_price).toFixed(4)}` : "-"}
                        </td>
                        <td style={tdStyle}>
                          {o.filled_qty ? parseFloat(o.filled_qty).toFixed(4) : "-"}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 600, padding: "1px 6px",
                            borderRadius: 3,
                            background: o.alpaca_status === "filled" ? "#d1fae5" : "#f1f5f9",
                            color: alpacaColor,
                          }}>
                            {o.alpaca_status || "pending"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "1rem", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
              No order detail available for this run.
            </div>
          )}

          {/* Error details (JSON) */}
          {run.error_details && (
            <details style={{ marginTop: "0.5rem" }}>
              <summary style={{ fontSize: "0.72rem", color: "#94a3b8", cursor: "pointer" }}>
                Error Details (JSON)
              </summary>
              <pre style={{
                fontSize: "0.7rem", background: "#f8fafc", padding: "0.5rem",
                borderRadius: "4px", overflow: "auto", maxHeight: 200,
              }}>
                {JSON.stringify(typeof run.error_details === 'string' ? JSON.parse(run.error_details) : run.error_details, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ExecHistoryCard — Expandable card that lazy-loads execution orders
// ═══════════════════════════════════════════════════════════════════════════════

function ExecHistoryCard({ h, formatCurrency, formatDate }) {
  const [expanded, setExpanded] = useState(false);
  const [execOrders, setExecOrders] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const loadExecOrders = async () => {
    if (execOrders) return;
    setOrdersLoading(true);
    try {
      const res = await apiPost("broker-execute.php", { action: "exec_orders", exec_id: h.exec_id });
      if (res.success) {
        setExecOrders(res.orders || []);
      } else {
        console.error("exec_orders failed:", res.error);
        setExecOrders([]);
      }
    } catch (err) {
      console.error("exec_orders error:", err);
      setExecOrders([]);
    }
    setOrdersLoading(false);
  };

  const handleExpand = () => {
    if (!expanded) loadExecOrders();
    setExpanded(!expanded);
  };

  return (
    <div style={{
      background: "#fff", borderRadius: "8px",
      border: `1px solid ${expanded ? "#059669" : "#e2e8f0"}`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={handleExpand}
        style={{
          padding: "0.75rem 1rem", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: expanded ? "#ecfdf5" : "#fff", transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.82rem", color: "#1e293b" }}>
              {h.exec_id}
            </span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#d1fae5", color: "#059669" }}>
              <CheckCircle2 size={12} style={{ verticalAlign: "middle" }} /> {h.orders_executed} executed
            </span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#faf5ff", color: "#7c3aed" }}>
              {h.baskets_processed} basket(s)
            </span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#f0fdf4", color: "#15803d" }}>
              {formatCurrency(h.total_amount)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "#64748b" }}>
            <span>{formatDate(h.started_at)}</span>
            <span>Duration: <strong>{h.duration_seconds || 0}s</strong></span>
            {Array.isArray(h.brokers) && h.brokers.length > 0 && (
              <span>Brokers: <strong>{h.brokers.join(", ")}</strong></span>
            )}
          </div>
        </div>
        <span style={{ color: "#94a3b8" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded: order hierarchy */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem" }}>
          {ordersLoading ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#64748b" }}>Loading execution orders...</div>
          ) : execOrders && execOrders.length > 0 ? (
            <ExecHierarchy
              orders={execOrders}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              executing={false}
              onExecuteMerchant={() => {}}
              onExecuteBasket={() => {}}
              mode="confirmed"
            />
          ) : (
            <div style={{ padding: "1rem", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
              No order detail available for this execution.
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ExecHierarchy — Merchant → Broker → Basket → Orders tree
// Supports both "placed" (with execute buttons) and "confirmed" (read-only)
// ═══════════════════════════════════════════════════════════════════════════════

function ExecHierarchy({ orders, formatCurrency, formatDate, executing, onExecuteMerchant, onExecuteBasket, mode = "placed" }) {
  const [expandedMerchants, setExpandedMerchants] = useState(new Set());
  const [expandedBrokers, setExpandedBrokers] = useState(new Set());
  const [expandedBaskets, setExpandedBaskets] = useState(new Set());

  const toggle = (setter, key) => {
    setter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Build hierarchy from flat orders
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
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {row.memberSet && badge(`${row.memberSet.size} mbrs`, "#f0f9ff", "#0369a1")}
      {badge(`${row.orders.length} orders`, "#faf5ff", "#7c3aed")}
      {badge(formatCurrency(row.totalAmount), "#f0fdf4", "#15803d")}
    </div>
  );

  const isConfirmed = mode === "confirmed";
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
        {isConfirmed ? "Confirmed" : "Placed"} Orders — {merchantKeys.length} merchant(s)
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
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                {pills(m)}
                {!isConfirmed && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onExecuteMerchant(mId, m.merchant_name, m.orders.length, m.totalAmount); }}
                    disabled={executing}
                    style={execBtnStyle}
                  >
                    <Zap size={11} style={{ verticalAlign: "middle" }} /> Execute
                  </button>
                )}
                {mOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
              </div>
            </div>

            {/* ── Level 2: Brokers ── */}
            {mOpen && Object.keys(m.brokers).sort().map((brKey) => {
              const br = m.brokers[brKey];
              const brId = `${mId}|${brKey}`;
              const brOpen = expandedBrokers.has(brId);

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
                      {brOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                    </div>
                  </div>

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
                          <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#1e293b" }}>
                            {bkId}
                          </span>
                          {bk.member_id && badge(`member: ${bk.member_id}`, "#fef3c7", "#92400e")}
                          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                            {badge(`${bk.orders.length} orders`, "#faf5ff", "#7c3aed")}
                            {badge(formatCurrency(bk.totalAmount), "#f0fdf4", "#15803d")}
                            {!isConfirmed && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onExecuteBasket(bkId, bk.orders.length); }}
                                disabled={executing}
                                style={execBtnStyle}
                              >
                                <Zap size={11} style={{ verticalAlign: "middle" }} /> Execute
                              </button>
                            )}
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
                                  <th style={thStyle}>Target Price</th>
                                  <th style={thStyle}>Shares</th>
                                  <th style={thStyle}>Points</th>
                                  {isConfirmed && <th style={thStyle}>Exec Price</th>}
                                  {isConfirmed && <th style={thStyle}>Exec Amount</th>}
                                  <th style={thStyle}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bk.orders.map((o, i) => {
                                  const shares = parseFloat(o.shares || 0);
                                  const amount = parseFloat(o.amount || 0);
                                  const targetPrice = shares > 0 ? amount / shares : 0;
                                  return (
                                    <tr key={o.order_id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                                        #{o.order_id || i + 1}
                                      </td>
                                      <td style={{ ...tdStyle, fontWeight: 600 }}>{o.symbol}</td>
                                      <td style={tdStyle}>{formatCurrency(amount)}</td>
                                      <td style={{ ...tdStyle, color: "#6366f1" }}>${targetPrice.toFixed(2)}</td>
                                      <td style={tdStyle}>{shares.toFixed(4)}</td>
                                      <td style={tdStyle}>{parseInt(o.points_used || 0, 10).toLocaleString()}</td>
                                      {isConfirmed && (
                                        <td style={{ ...tdStyle, fontWeight: 600, color: "#059669" }}>
                                          ${parseFloat(o.executed_price || 0).toFixed(4)}
                                        </td>
                                      )}
                                      {isConfirmed && (
                                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                                          {formatCurrency(o.executed_amount)}
                                        </td>
                                      )}
                                      <td style={tdStyle}>
                                        <span style={{
                                          fontSize: "0.7rem", fontWeight: 600, padding: "1px 6px",
                                          borderRadius: 4,
                                          background: o.status === "confirmed" ? "#d1fae5" : "#fef3c7",
                                          color: o.status === "confirmed" ? "#059669" : "#92400e",
                                        }}>
                                          {o.status}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
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


// ═══════════════════════════════════════════════════════════════════════════════
// Sub-Components & Styles
// ═══════════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, subtext, color }) {
  return (
    <div style={{
      padding: "1rem", background: "#fff", borderRadius: "8px",
      border: "1px solid #e2e8f0", borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#1e293b" }}>{value}</div>
      {subtext && <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{subtext}</div>}
    </div>
  );
}

const thStyle = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "0.5rem 0.75rem",
  fontSize: "0.82rem",
  color: "#334155",
};

const execBtnStyle = {
  padding: "2px 10px",
  background: "#059669",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  fontSize: "0.68rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
