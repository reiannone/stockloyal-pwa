import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api";
import OrderPipeline from "../components/OrderPipeline";
import ConfirmModal from "../components/ConfirmModal";

/**
 * BrokerExecAdmin — Broker Trade Execution Simulator
 *
 * Simulates the broker's side of trade processing:
 *   1. View placed orders awaiting execution (sent via sweep)
 *   2. Execute trades with simulated market prices (±2% variance)
 *   3. Orders move: placed → confirmed with executed_price, executed_shares, executed_amount
 *
 * In production, the broker would do this automatically at market open (9:30 AM ET).
 * This page lets admin trigger and observe the execution process.
 */

export default function BrokerExecAdmin() {
  const [loading, setLoading] = useState(true);
  const [brokers, setBrokers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [executingBasket, setExecutingBasket] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  // Modal state
  const [modal, setModal] = useState({
    show: false,
    title: "",
    message: "",
    icon: "⚡",
    confirmText: "Execute",
    confirmColor: "#059669",
    data: null,
  });

  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  // Load placed orders
  const loadPlacedOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost("broker-execute.php", { action: "preview" });
      if (res.success) {
        setBrokers(res.brokers || []);
        setSummary(res.summary || null);
      } else {
        console.error("Preview error:", res.error);
      }
    } catch (err) {
      console.error("Failed to load placed orders:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlacedOrders();
  }, [loadPlacedOrders]);

  // Show confirm modal for execute all
  const confirmExecuteAll = () => {
    setModal({
      show: true,
      title: "Execute All Orders",
      message: `Execute all ${summary?.total_orders || 0} placed orders? This simulates broker market execution at current prices.`,
      icon: "⚡",
      confirmText: "Execute All",
      confirmColor: "#059669",
      data: { type: "all" },
    });
  };

  // Execute all trades (after confirmation)
  const executeAll = async () => {
    closeModal();
    setExecuting(true);
    setLastResult(null);
    try {
      const res = await apiPost("broker-execute.php", { action: "execute" });
      setLastResult(res);
      await loadPlacedOrders();
    } catch (err) {
      console.error("Execution failed:", err);
      setLastResult({ success: false, error: err.message });
    }
    setExecuting(false);
  };

  // Show confirm modal for single basket
  const confirmExecuteBasket = (basketId, orderCount) => {
    setModal({
      show: true,
      title: "Execute Basket",
      message: `Execute basket ${basketId} with ${orderCount || "?"} order(s)? This simulates broker market execution.`,
      icon: "📦",
      confirmText: "Execute Basket",
      confirmColor: "#059669",
      data: { type: "basket", basketId },
    });
  };

  // Execute single basket (after confirmation)
  const executeBasketAction = async (basketId) => {
    closeModal();
    setExecutingBasket(basketId);
    try {
      const res = await apiPost("broker-execute.php", {
        action: "execute_basket",
        basket_id: basketId,
      });
      setLastResult(res);
      await loadPlacedOrders();
    } catch (err) {
      console.error("Basket execution failed:", err);
    }
    setExecutingBasket(null);
  };

  // Handle modal confirm
  const handleModalConfirm = () => {
    if (modal.data?.type === "all") {
      executeAll();
    } else if (modal.data?.type === "basket") {
      executeBasketAction(modal.data.basketId);
    }
  };

  const formatCurrency = (amt) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amt || 0);

  const formatDate = (d) => (d ? new Date(d).toLocaleString() : "-");

  const formatTime = (d) => (d ? new Date(d).toLocaleTimeString() : "-");

  return (
    <div className="app-container app-content">
      {/* Header */}
      <h1 className="page-title">Broker Trade Execution</h1>
      <p className="page-deck">
        Simulate broker market execution for placed orders. In production, the broker executes trades automatically at market open.
      </p>

      {/* ── Order Pipeline ── */}
      <OrderPipeline currentStep={3} />

      {/* Action Bar */}
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: "0.75rem",
        alignItems: "center",
        marginBottom: "1.5rem",
      }}>
        <button
          onClick={loadPlacedOrders}
          disabled={loading}
          style={{
            padding: "0.625rem 1.25rem",
            background: "#f1f5f9",
            color: "#475569",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          🔄 Refresh
        </button>
        <button
          onClick={confirmExecuteAll}
          disabled={executing || !summary?.total_orders}
          style={{
            padding: "0.625rem 1.25rem",
            background: executing ? "#94a3b8" : (!summary?.total_orders ? "#e2e8f0" : "#059669"),
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: summary?.total_orders ? "pointer" : "not-allowed",
            opacity: executing ? 0.7 : 1,
          }}
        >
          {executing ? "⏳ Executing..." : "⚡ Execute All Trades"}
        </button>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}>
          <StatCard
            label="Placed Orders"
            value={summary.total_orders}
            subtext="Awaiting execution"
            color="#f59e0b"
          />
          <StatCard
            label="Total Amount"
            value={formatCurrency(summary.total_amount)}
            subtext="Investment value"
            color="#3b82f6"
          />
          <StatCard
            label="Brokers"
            value={summary.broker_count}
            subtext="Processing"
            color="#8b5cf6"
          />
          <StatCard
            label="Baskets"
            value={summary.basket_count}
            subtext="Member orders"
            color="#06b6d4"
          />
        </div>
      )}

      {/* Execution Result Banner */}
      {lastResult && (
        <div style={{
          padding: "1rem",
          marginBottom: "1.5rem",
          borderRadius: "8px",
          background: lastResult.success ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${lastResult.success ? "#10b981" : "#ef4444"}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              {lastResult.success ? "✅ Trades Executed" : "❌ Execution Failed"}
            </strong>
            {lastResult.exec_id && (
              <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>
                {lastResult.exec_id}
              </span>
            )}
          </div>

          {lastResult.success && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <span>📈 Executed: <strong>{lastResult.orders_executed || 0}</strong></span>
                <span>❌ Failed: <strong>{lastResult.orders_failed || 0}</strong></span>
                <span>🧺 Baskets: <strong>{lastResult.baskets_processed || 0}</strong></span>
                <span>⏱ Duration: <strong>{lastResult.duration_seconds || 0}s</strong></span>
              </div>

              {/* Per-Basket Fill Results */}
              {lastResult.basket_results?.map((br, i) => (
                <BasketFillRow key={i} br={br} formatCurrency={formatCurrency} />
              ))}
            </div>
          )}

          {lastResult.error && !lastResult.success && (
            <div style={{ marginTop: "0.5rem", color: "#dc2626" }}>{lastResult.error}</div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          Loading placed orders...
        </div>
      )}

      {/* No Orders */}
      {!loading && brokers.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "3rem",
          background: "#fff",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          color: "#94a3b8",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✅</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#475569" }}>
            No Placed Orders
          </div>
          <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Run a sweep first to move pending orders to placed status.
          </div>
        </div>
      )}

      {/* Broker Groups */}
      {!loading && brokers.map((brokerGroup) => (
        <div
          key={brokerGroup.broker}
          style={{
            background: "#fff",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            marginBottom: "1rem",
            overflow: "hidden",
          }}
        >
          {/* Broker Header */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.875rem 1rem",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "1.25rem" }}>🏦</span>
              <div>
                <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "1rem" }}>
                  {brokerGroup.broker}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  {brokerGroup.order_count} order(s) · {brokerGroup.baskets.length} basket(s) · {formatCurrency(brokerGroup.total_amount)}
                </div>
              </div>
            </div>
          </div>

          {/* Baskets Table */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={thStyle}>Basket ID</th>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Merchant</th>
                <th style={thStyle}>Orders</th>
                <th style={thStyle}>Symbols</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Placed At</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {brokerGroup.baskets.map((basket) => {
                const symbols = [...new Set(basket.orders.map((o) => o.symbol))].join(", ");
                return (
                  <BasketRow
                    key={basket.basket_id}
                    basket={basket}
                    symbols={symbols}
                    executing={executingBasket === basket.basket_id}
                    onExecute={() => confirmExecuteBasket(basket.basket_id, basket.order_count)}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Info Footer */}
      <div style={{
        marginTop: "1.5rem",
        padding: "1rem",
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: "8px",
        fontSize: "0.8rem",
        color: "#92400e",
      }}>
        <strong>ℹ️ Simulation Mode:</strong> Executed prices are simulated with ±2% market variance
        from the target buy price. In production, the broker returns actual fill prices from the
        exchange at market open (9:30 AM ET). Orders move from <code>placed → confirmed</code> with
        executed_price, executed_shares, and executed_amount populated.
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        icon={modal.icon}
        confirmText={modal.confirmText}
        confirmColor={modal.confirmColor}
        onConfirm={handleModalConfirm}
        onCancel={closeModal}
      />
    </div>
  );
}


// ==================================================================
// Sub-Components
// ==================================================================

function StatCard({ label, value, subtext, color }) {
  return (
    <div style={{
      padding: "1rem",
      background: "#fff",
      borderRadius: "8px",
      border: "1px solid #e2e8f0",
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "0.25rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#1e293b" }}>
        {value}
      </div>
      {subtext && (
        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{subtext}</div>
      )}
    </div>
  );
}


// Basket row with expandable order detail
function BasketRow({ basket, symbols, executing, onExecute, formatCurrency, formatDate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{
          borderBottom: expanded ? "none" : "1px solid #f1f5f9",
          cursor: "pointer",
          background: expanded ? "#fafafa" : undefined,
        }}
      >
        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem", color: "#6366f1" }}>
          {basket.basket_id}
          <span style={{ marginLeft: 4, fontSize: "0.65rem", color: "#94a3b8" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </td>
        <td style={tdStyle}>{basket.member_id}</td>
        <td style={{ ...tdStyle, fontSize: "0.8rem" }}>{basket.merchant_name || basket.merchant_id}</td>
        <td style={{ ...tdStyle, textAlign: "center" }}>{basket.orders.length}</td>
        <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#475569" }}>{symbols}</td>
        <td style={{ ...tdStyle, fontWeight: 600 }}>{formatCurrency(basket.total_amount)}</td>
        <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#64748b" }}>
          {formatDate(basket.placed_at)}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onExecute}
            disabled={executing}
            style={{
              padding: "0.3rem 0.75rem",
              background: executing ? "#94a3b8" : "#059669",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {executing ? "⏳" : "⚡ Execute"}
          </button>
        </td>
      </tr>

      {/* Expanded Order Detail */}
      {expanded && (
        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
          <td colSpan={8} style={{ padding: 0 }}>
            <div style={{
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={subThStyle}>Order ID</th>
                    <th style={subThStyle}>Symbol</th>
                    <th style={subThStyle}>Shares</th>
                    <th style={subThStyle}>Amount</th>
                    <th style={subThStyle}>Target Price</th>
                    <th style={subThStyle}>Points Used</th>
                    <th style={subThStyle}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {basket.orders.map((o) => {
                    const targetPrice = o.shares > 0
                      ? (parseFloat(o.amount) / parseFloat(o.shares))
                      : 0;
                    return (
                      <tr key={o.order_id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={subTdStyle}>#{o.order_id}</td>
                        <td style={{ ...subTdStyle, fontWeight: 600 }}>{o.symbol}</td>
                        <td style={subTdStyle}>{parseFloat(o.shares).toFixed(4)}</td>
                        <td style={subTdStyle}>{formatCurrency(o.amount)}</td>
                        <td style={{ ...subTdStyle, color: "#6366f1" }}>
                          ${targetPrice.toFixed(2)}
                        </td>
                        <td style={subTdStyle}>
                          {parseInt(o.points_used || 0).toLocaleString()}
                        </td>
                        <td style={{ ...subTdStyle, fontSize: "0.7rem", color: "#64748b" }}>
                          {o.order_type || "market"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}


// Per-Basket Fill Result (shown after execution)
function BasketFillRow({ br, formatCurrency }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: "0.4rem" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.5rem 0.75rem",
          background: br.orders_failed > 0
            ? "rgba(239,68,68,0.08)"
            : "rgba(16,185,129,0.08)",
          borderRadius: expanded ? "6px 6px 0 0" : "6px",
          fontSize: "0.825rem",
          cursor: "pointer",
          border: `1px solid ${br.orders_failed > 0 ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}`,
          borderBottom: expanded ? "none" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span>✅</span>
          <strong>{br.broker}</strong>
          <span style={{ color: "#64748b" }}>→</span>
          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#6366f1" }}>
            {br.basket_id}
          </span>
          <span style={{ color: "#64748b" }}>
            {br.member_id} · {br.orders_executed} fill(s) · {formatCurrency(br.total_amount)}
          </span>
          {br.symbols?.length > 0 && (
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
              [{br.symbols.join(", ")}]
            </span>
          )}
        </div>
        <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Fill Detail */}
      {expanded && br.fills?.length > 0 && (
        <div style={{
          border: `1px solid rgba(16,185,129,0.2)`,
          borderTop: "none",
          borderRadius: "0 0 6px 6px",
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#ecfdf5" }}>
                <th style={fillThStyle}>Order</th>
                <th style={fillThStyle}>Symbol</th>
                <th style={fillThStyle}>Shares</th>
                <th style={fillThStyle}>Target Price</th>
                <th style={fillThStyle}>Executed Price</th>
                <th style={fillThStyle}>Variance</th>
                <th style={fillThStyle}>Executed Amount</th>
              </tr>
            </thead>
            <tbody>
              {br.fills.map((f, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #d1fae5" }}>
                  <td style={fillTdStyle}>#{f.order_id}</td>
                  <td style={{ ...fillTdStyle, fontWeight: 600 }}>{f.symbol}</td>
                  <td style={fillTdStyle}>{f.shares?.toFixed(4)}</td>
                  <td style={{ ...fillTdStyle, color: "#64748b" }}>
                    ${f.target_price?.toFixed(2)}
                  </td>
                  <td style={{ ...fillTdStyle, fontWeight: 600, color: "#059669" }}>
                    ${f.executed_price?.toFixed(4)}
                  </td>
                  <td style={{
                    ...fillTdStyle,
                    color: f.variance_pct > 0 ? "#059669" : f.variance_pct < 0 ? "#dc2626" : "#64748b",
                    fontSize: "0.7rem",
                  }}>
                    {f.variance_pct > 0 ? "+" : ""}{f.variance_pct?.toFixed(2)}%
                  </td>
                  <td style={{ ...fillTdStyle, fontWeight: 600 }}>
                    {formatCurrency(f.executed_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ==================================================================
// Styles
// ==================================================================

const thStyle = {
  padding: "0.625rem 0.75rem",
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "0.625rem 0.75rem",
  fontSize: "0.85rem",
  color: "#334155",
};

const subThStyle = {
  padding: "0.4rem 0.75rem",
  textAlign: "left",
  fontSize: "0.7rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  borderBottom: "1px solid #e2e8f0",
};

const subTdStyle = {
  padding: "0.4rem 0.75rem",
  fontSize: "0.8rem",
  color: "#334155",
};

const fillThStyle = {
  padding: "0.375rem 0.625rem",
  textAlign: "left",
  fontSize: "0.65rem",
  fontWeight: 600,
  color: "#166534",
  textTransform: "uppercase",
  borderBottom: "1px solid #d1fae5",
};

const fillTdStyle = {
  padding: "0.375rem 0.625rem",
  fontSize: "0.775rem",
  color: "#334155",
  background: "#fafafa",
};
