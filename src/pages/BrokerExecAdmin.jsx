import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api";
import {
  Package, RefreshCw, CheckCircle2, XCircle, TrendingUp,
  ShoppingBasket, Clock, Landmark, ChevronUp, ChevronDown,
  Zap, Hourglass, Info, Store, Building2, ClipboardList, AlertTriangle,
} from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";

/**
 * BrokerExecAdmin — Broker Trade Execution Simulator
 *
 * Simulates the broker's side of trade processing:
 *   1. View placed orders in Merchant → Broker → Basket → Orders hierarchy
 *   2. Execute trades at merchant, broker, or basket level
 *   3. View execution history with the same hierarchy
 *
 * In production, the broker would do this automatically at market open (9:30 AM ET).
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

  // Pipeline queue counts
  const [queueCounts, setQueueCounts] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const data = await apiPost("admin-queue-counts.php");
        if (data?.success) setQueueCounts(data.counts);
      } catch (err) {
        console.warn("[BrokerExecAdmin] queue counts fetch failed:", err);
      }
    })();
  }, []);

  // Load placed orders (flat array, frontend groups into hierarchy)
  const loadPlacedOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("broker-execute.php", { action: "preview" });
      if (res.success) {
        // Flatten broker→basket→orders into a flat order array for the hierarchy
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
      <h1 className="page-title">Broker Trade Execution <em>[Simulation]</em></h1>
      <p className="page-deck">
        Simulate broker market execution for placed orders. The broker executes trades automatically at market open, 9:30AM ET.
      </p>

      {/* ── Order Pipeline ── */}
      <OrderPipeline currentStep={4} counts={queueCounts} />

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
            { key: "placed", label: <><Zap size={12} style={{ verticalAlign: "middle" }} /> Placed Orders</> },
            { key: "history", label: <><Clock size={12} style={{ verticalAlign: "middle" }} /> History</> },
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

      {/* Info Footer */}
      <div style={{
        marginTop: "1.5rem", padding: "1rem",
        background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: "8px", fontSize: "0.8rem", color: "#92400e",
      }}>
        <strong><Info size={14} style={{ verticalAlign: "middle" }} /> Simulation Mode:</strong> Executed prices are simulated with ±2% market variance
        from the target buy price. In production, the broker returns actual fill prices from the
        exchange at market open (9:30 AM ET). Orders move from <code>placed → confirmed</code> with
        executed_price, executed_shares, and executed_amount populated.
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// ExecHierarchy — Merchant → Broker → Basket → Orders tree
// Supports both "placed" (with execute buttons) and "confirmed" (read-only)
// ═══════════════════════════════════════════════════════════════════════════

function ExecHierarchy({ orders, formatCurrency, formatDate, executing, onExecuteMerchant, onExecuteBasket, mode = "placed" }) {
  const [expandedMerchants, setExpandedMerchants] = useState(new Set());
  const [expandedBrokers, setExpandedBrokers] = useState(new Set());
  const [expandedBaskets, setExpandedBaskets] = useState(new Set());

  const toggle = (setter, key) => {
    setter((prev) => {
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


// ═══════════════════════════════════════════════════════════════════════════
// ExecHistoryCard — Expandable card that lazy-loads execution orders
// ═══════════════════════════════════════════════════════════════════════════

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


// ═══════════════════════════════════════════════════════════════════════════
// Sub-Components & Styles
// ═══════════════════════════════════════════════════════════════════════════

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
