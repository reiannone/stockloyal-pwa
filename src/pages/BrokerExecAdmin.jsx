import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import {
  Package, RefreshCw, CheckCircle2, XCircle, TrendingUp,
  ShoppingBasket, Clock, Landmark, ChevronUp, ChevronDown,
  Zap, Hourglass, Info, Store, Building2, ClipboardList, AlertTriangle,
  Activity, Server, CalendarClock, BarChart3,
  CircleDot, CircleOff, Wifi, WifiOff, ArrowLeft,
} from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";

const makeKey = (mid, bid) => (mid && bid) ? `${mid}|${bid}` : mid ? mid : "";

function usePipelineCycles() {
  const [cycleOptions, setCycleOptions] = useState(null);
  useEffect(() => {
    apiPost("pipeline-cycles.php", { action: "list", limit: 100 })
      .then((res) => {
        if (!res.success) { setCycleOptions([]); return; }
        const open = (res.cycles || []).filter(c => ["open", "locked"].includes(c.status));
        setCycleOptions(open.map(c => ({
          key:           makeKey(c.merchant_id_str || c.merchant_id, c.broker_id),
          merchant_id:   c.merchant_id_str || c.merchant_id,
          broker_id:     c.broker_id,
          merchant_name: c.merchant_name || c.merchant_id_str || c.merchant_id,
          broker_name:   c.broker_name   || c.broker_id,
          cycle:         c,
        })));
      })
      .catch(() => setCycleOptions([]));
  }, []);
  return cycleOptions;
}

/**
 * BrokerExecAdmin — Broker Trade Execution + Cron Monitoring
 *
 * Tabs:
 *   1. Placed Orders   — View & manually execute placed orders (simulation)
 *   2. History          — Manual execution history
 *   3. Cron Runs        — Automated cron execution monitoring dashboard
 */

export default function BrokerExecAdmin() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const cycleOptions = usePipelineCycles();

  // ── URL params ────────────────────────────────────────────────────────────
  const params        = new URLSearchParams(location.search);
  const urlMerchantId = params.get("merchant_id") || "";
  const urlBrokerId   = params.get("broker_id")   || "";

  // ── Merchant·broker filter ────────────────────────────────────────────────
  const [selectedPair, setSelectedPair] = useState(makeKey(urlMerchantId, urlBrokerId));
  const filterMerchant = selectedPair.includes("|") ? selectedPair.split("|")[0] : selectedPair;

  const pipelineMerchants = useMemo(
    () => cycleOptions
      ? cycleOptions.map(o => ({ merchant_id: o.merchant_id, merchant_name: o.merchant_name }))
      : [],
    [cycleOptions]
  );

  const [activeTab, setActiveTab] = useState("placed");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [refreshPlaced, setRefreshPlaced] = useState(0);

  const formatCurrency = (amt) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amt || 0);
  const formatDate = (d) => (d ? new Date(d).toLocaleString() : "-");

  // Load execution history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiPost("broker-execute.php", { action: "history", limit: 30 });
      if (res.success) setHistory(res.history || []);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleRefresh = () => {
    setRefreshPlaced(n => n + 1);
    loadHistory();
  };

  return (
    <div className="app-container app-content">
      {/* Header */}
      <h1 className="page-title">Broker Execution Status</h1>
      <p className="page-deck">
        Read-only view of Alpaca broker responses — order fills, submissions, and cron execution history. The cron job submits placed orders to Alpaca automatically at market open.
      </p>

      {/* ── Order Pipeline ── */}
      <OrderPipeline currentStep={5} />

      {/* ── Tabs + back button ── */}
      <div style={{
        display: "flex", gap: "0.5rem", marginBottom: "1.5rem",
        borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem",
        justifyContent: "space-between", alignItems: "center", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[
            { key: "placed",  label: <><Zap     size={12} style={{ verticalAlign: "middle" }} /> Placed Orders</> },
            { key: "history", label: <><Clock   size={12} style={{ verticalAlign: "middle" }} /> Fill History</> },
            { key: "cron",    label: <><Activity size={12} style={{ verticalAlign: "middle" }} /> Cron Runs</> },
          ].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: "0.5rem 1rem",
              background: activeTab === t.key ? "#059669" : "transparent",
              color: activeTab === t.key ? "#fff" : "#64748b",
              border: "none", borderRadius: "6px", fontWeight: "500", cursor: "pointer",
            }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button onClick={handleRefresh} style={{
            padding: "0.4rem 0.75rem", background: "#f1f5f9", color: "#475569",
            border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => navigate("/pipeline-cycles")} style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.4rem 0.75rem", background: "none",
            border: "1px solid #d1d5db", borderRadius: "6px",
            color: "#6b7280", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
          }}>
            <ArrowLeft size={13} /> Pipeline Cycle Control Panel
          </button>
        </div>
      </div>

      {/* ── Merchant·broker toolbar ── */}
      <div style={{
        display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap",
        marginBottom: "1.25rem", padding: "0.75rem 1rem",
        background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Merchant · Broker
          </label>
          <select
            value={selectedPair}
            onChange={e => setSelectedPair(e.target.value)}
            style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.85rem", minWidth: 260 }}
          >
            <option value="">All Active Cycles</option>
            {(cycleOptions || []).map(opt => (
              <option key={opt.key} value={opt.key}>
                {opt.merchant_name} · {opt.broker_name}
              </option>
            ))}
            {urlMerchantId && !(cycleOptions || []).find(o => o.merchant_id === urlMerchantId) && (
              <option value={makeKey(urlMerchantId, urlBrokerId)}>
                {urlMerchantId}{urlBrokerId ? ` · ${urlBrokerId}` : ""}
              </option>
            )}
          </select>
        </div>
        {filterMerchant && (
          <span style={{ fontSize: "0.75rem", background: "#fef3c7", color: "#92400e", padding: "3px 10px", borderRadius: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {(cycleOptions || []).find(o => o.merchant_id === filterMerchant)?.merchant_name || filterMerchant}
            <button onClick={() => setSelectedPair("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", padding: 0, lineHeight: 1, fontSize: "0.9rem" }} title="Clear filter">×</button>
          </span>
        )}
      </div>

      {/* ── PLACED TAB ── */}
      {activeTab === "placed" && (
        <>
          {pipelineMerchants.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "3rem", background: "#fff",
              borderRadius: "8px", border: "1px solid #e2e8f0", color: "#94a3b8",
            }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}><CheckCircle2 size={32} color="#10b981" /></div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#475569" }}>No Active Pipeline Cycles</div>
              <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                Open a cycle in{" "}
                <a href="/#/pipeline-cycles" style={{ color: "#059669" }}>Pipeline Management</a>{" "}
                and run a sweep to generate placed orders.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {pipelineMerchants
                .filter(m => !filterMerchant || m.merchant_id === filterMerchant)
                .map((m) => (
                <MerchantExecPanel
                  key={m.merchant_id}
                  merchant={m}
                  cycleOptions={cycleOptions}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  refreshSignal={refreshPlaced}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {historyLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Loading history...</div>
          ) : history.length === 0 ? (
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
// MerchantExecPanel — Per-merchant placed orders + execute controls
// ═══════════════════════════════════════════════════════════════════════════════

function MerchantExecPanel({ merchant, cycleOptions, formatCurrency, formatDate, refreshSignal }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const cycleForM = (cycleOptions || []).find(o => o.merchant_id === merchant.merchant_id);
  const isExecutionDone = cycleForM?.cycle?.stage_execution === "completed";

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("broker-execute.php", { action: "preview", merchant_id: merchant.merchant_id });
      if (res.success) {
        const flat = [];
        for (const bg of (res.brokers || [])) {
          for (const bk of (bg.baskets || [])) {
            for (const o of (bk.orders || [])) {
              flat.push({ ...o, merchant_name: merchant.merchant_name });
            }
          }
        }
        setOrders(flat);
        setSummary(res.summary || null);
      }
    } catch (err) {
      console.error("Preview error:", err);
    }
    setLoading(false);
  }, [merchant.merchant_id, merchant.merchant_name]);

  useEffect(() => { loadOrders(); }, [loadOrders, refreshSignal]);

  const orderCount = summary?.total_orders || 0;
  const totalAmt   = summary?.total_amount || 0;

  return (
    <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
      {/* Panel header */}
      <div style={{
        padding: "0.75rem 1rem", background: "#f8fafc",
        borderBottom: collapsed ? "none" : "1px solid #e2e8f0",
        display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#94a3b8" }}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <Store size={16} color="#8b5cf6" />
        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
          {merchant.merchant_name}
        </span>
        {isExecutionDone && (
          <span style={{ fontSize: "0.68rem", fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a" }}>
            ✓ Execution Complete
          </span>
        )}
        {!loading && (
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {orderCount} order{orderCount !== 1 ? "s" : ""} · {formatCurrency(totalAmt)}
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={(e) => { e.stopPropagation(); loadOrders(); }}
            disabled={loading}
            style={{
              padding: "0.3rem 0.6rem", background: "#f1f5f9", color: "#475569",
              border: "1px solid #cbd5e1", borderRadius: "5px", fontSize: "0.75rem", cursor: "pointer",
            }}
          >
            <RefreshCw size={11} style={{ verticalAlign: "middle" }} />
          </button>
        </div>
      </div>

      {/* Orders */}
      {!collapsed && (
        <div style={{ padding: "0.75rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>Loading placed orders...</div>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8", fontSize: "0.875rem" }}>
              No placed orders for this merchant.
            </div>
          ) : (
            <ExecHierarchy
              orders={orders}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              mode="placed"
            />
          )}
        </div>
      )}
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

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadCronData, 30000);
    return () => clearInterval(interval);
  }, [loadCronData]);

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
      </div>

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
            The cron job runs automatically during market hours. Check back after market open.
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
// ExecHierarchy — Merchant -> Broker -> Basket -> Orders tree (read-only)
// ═══════════════════════════════════════════════════════════════════════════════

function ExecHierarchy({ orders, formatCurrency, formatDate, mode = "placed" }) {
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
