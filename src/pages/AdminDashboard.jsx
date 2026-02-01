// src/pages/AdminDashboard.jsx
import React, { useCallback, useEffect, useState } from "react";
import { apiPost } from "../api.js";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Users,
  UserPlus,
  CalendarDays,
  Package,
  Clock,
  Send,
  CheckCircle,
  XCircle,
  Wallet,
  Coins,
  DollarSign,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  MessageSquare,
  MessageCircle,
  Heart,
  ShoppingBasket,
  RefreshCw,
  BarChart3,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

// ── Summary Card Component ──────────────────────────────────────────────────
function SummaryCard({ title, value, subValue, icon: Icon, color = "#3b82f6" }) {
  return (
    <div className="card" style={{ padding: "1rem", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "8px",
          backgroundColor: `${color}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={20} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#6b7280", fontSize: "0.75rem", marginBottom: "0.15rem" }}>
          {title}
        </div>
        <div style={{ fontSize: "1.35rem", fontWeight: "700", color: "#111827" }}>
          {value}
        </div>
        {subValue && (
          <div style={{ color: "#9ca3af", fontSize: "0.7rem", marginTop: "0.1rem" }}>
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard Component ────────────────────────────────────────────────
export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(1);
  const [data, setData] = useState(null);
  const [realtime, setRealtime] = useState(null);
  const [activeChart, setActiveChart] = useState("orders");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, realtimeRes] = await Promise.all([
        apiPost("get-admin-metrics.php", { days }),
        apiPost("get-admin-realtime.php", {}),
      ]);

      if (analyticsRes?.success) {
        setData(analyticsRes);
      }
      if (realtimeRes?.success) {
        setRealtime(realtimeRes);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Format numbers
  const fmt = (n) => (n ? Number(n).toLocaleString() : "0");
  const fmtCurrency = (n) =>
    n ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "$0.00";

  // Prepare chart data
  const chartData = data?.daily?.map((d) => ({
    date: d.day,
    orders: parseInt(d.orders_count) || 0,
    cash: parseFloat(d.orders_cash_total) || 0,
    members: parseInt(d.new_members_count) || 0,
    points: parseInt(d.points_loaded_total) || 0,
    posts: parseInt(d.social_posts_count) || 0,
  })) || [];

  // Members by Merchant columns
  const membersByMerchantColumns = [
    { key: "merchant_name", label: "Merchant" },
    { key: "member_count", label: "Members", align: "right", render: (v) => fmt(v) },
    { key: "total_points", label: "Points", align: "right", render: (v) => fmt(v) },
    { key: "total_portfolio", label: "Portfolio", align: "right", render: (v) => fmtCurrency(v) },
  ];

  // Members by Broker columns
  const membersByBrokerColumns = [
    { key: "broker", label: "Broker" },
    { key: "member_count", label: "Members", align: "right", render: (v) => fmt(v) },
    { key: "total_points", label: "Points", align: "right", render: (v) => fmt(v) },
    { key: "total_portfolio", label: "Portfolio", align: "right", render: (v) => fmtCurrency(v) },
  ];

  // Orders by Broker columns
  const ordersByBrokerColumns = [
    { key: "broker", label: "Broker" },
    { key: "orders_count", label: "Orders", align: "right", render: (v) => fmt(v) },
    { key: "executed_count", label: "Exec/Conf", align: "right", render: (v) => fmt(v) },
    { key: "orders_amount", label: "Amount", align: "right", render: (v) => fmtCurrency(v) },
  ];

  // Points by Merchant columns
  const pointsByMerchantColumns = [
    { key: "merchant_id", label: "Merchant" },
    { key: "transaction_count", label: "Transactions", align: "right", render: (v) => fmt(v) },
    { key: "points_loaded", label: "Points Loaded", align: "right", render: (v) => fmt(v) },
  ];

  // Chart configurations
  const chartConfigs = {
    orders: { key: "orders", color: "#3b82f6", label: "Orders" },
    cash: { key: "cash", color: "#10b981", label: "Cash ($)" },
    members: { key: "members", color: "#8b5cf6", label: "New Members" },
    points: { key: "points", color: "#f59e0b", label: "Points Loaded" },
    posts: { key: "posts", color: "#ec4899", label: "Social Posts" },
  };

  return (
    <div className="app-container app-content">
      {/* Header */}
      <h1 className="page-title">Admin Dashboard</h1>
      <p className="page-deck">This admin page presents high-level statistics and key performance indicators (KPIs) for the StockLoyal platform.</p>
      
      {/* Period Filter Card */}
      <div className="card" style={{ 
        marginBottom: "1.5rem", 
        backgroundColor: "#fef3c7", 
        borderLeft: "4px solid #f59e0b",
        padding: "1rem"
      }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>Period:</span>
          {[1, 7, 30, 90, 365].map((d) => (
            <button
              key={d}
              className={days === d ? "btn-primary" : "btn-secondary"}
              onClick={() => setDays(d)}
              style={{ width: "4.00rem", padding: "0.4rem 0.75rem", fontSize: "0.85rem" }}
            >
              {d === 1 ? "Today" : `${d}d`}
            </button>
          ))}
          <button
            className="btn-secondary"
            onClick={fetchData}
            style={{ padding: "0.4rem 0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div> 

      {loading ? (
        <p className="body-text">Loading dashboard...</p>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════════
              MEMBERS SECTION
          ══════════════════════════════════════════════════════════════════ */}
          <h2 className="subheading">Members</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <SummaryCard
              title="Total Members"
              value={fmt(realtime?.members?.total)}
              icon={Users}
              color="#8b5cf6"
            />
            <SummaryCard
              title="New (7 days)"
              value={fmt(realtime?.members?.new_7d)}
              icon={UserPlus}
              color="#10b981"
            />
            <SummaryCard
              title="New (30 days)"
              value={fmt(realtime?.members?.new_30d)}
              icon={CalendarDays}
              color="#3b82f6"
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              WALLET / POINTS SECTION
          ══════════════════════════════════════════════════════════════════ */}
          <h2 className="subheading">Wallets & Points</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <SummaryCard
              title="Total Wallets"
              value={fmt(realtime?.wallets?.total_wallets)}
              icon={Wallet}
              color="#8b5cf6"
            />
            <SummaryCard
              title="Points Balance"
              value={fmt(realtime?.wallets?.total_points)}
              icon={Coins}
              color="#f59e0b"
            />
            <SummaryCard
              title="Cash Balance"
              value={fmtCurrency(realtime?.wallets?.total_cash)}
              icon={DollarSign}
              color="#10b981"
            />
            <SummaryCard
              title="Portfolio Value"
              value={fmtCurrency(realtime?.wallets?.total_portfolio)}
              icon={TrendingUp}
              color="#3b82f6"
            />
            <SummaryCard
              title="Points Loaded"
              value={fmt(realtime?.points?.total_loaded)}
              subValue={`${fmt(realtime?.points?.total_transactions)} txns`}
              icon={ArrowDownToLine}
              color="#6366f1"
            />
            <SummaryCard
              title="Points Spent"
              value={fmt(realtime?.points?.total_spent)}
              icon={ArrowUpFromLine}
              color="#ec4899"
            />
          </div>
          
          {/* ══════════════════════════════════════════════════════════════════
              ORDERS SECTION
          ══════════════════════════════════════════════════════════════════ */}
          <h2 className="subheading">Orders & Baskets</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <SummaryCard
              title="Total Orders"
              value={fmt(realtime?.orders?.total)}
              icon={Package}
              color="#3b82f6"
            />
            <SummaryCard
              title="Pending"
              value={fmt(realtime?.orders?.pending)}
              icon={Clock}
              color="#f59e0b"
            />
            <SummaryCard
              title="Placed"
              value={fmt(realtime?.orders?.placed)}
              icon={Send}
              color="#6366f1"
            />
            <SummaryCard
              title="Executed/Confirmed"
              value={fmt((parseInt(realtime?.orders?.executed) || 0) + (parseInt(realtime?.orders?.confirmed) || 0))}
              subValue={fmtCurrency(realtime?.orders?.executed_amount)}
              icon={CheckCircle}
              color="#059669"
            />
            <SummaryCard
              title="Failed/Cancelled"
              value={fmt((parseInt(realtime?.orders?.failed) || 0) + (parseInt(realtime?.orders?.cancelled) || 0))}
              icon={XCircle}
              color="#dc2626"
            />
            <SummaryCard
              title="Total Baskets"
              value={fmt(realtime?.baskets?.total)}
              icon={ShoppingBasket}
              color="#10b981"
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TRANSACTIONS LEDGER SECTION
          ══════════════════════════════════════════════════════════════════ */}
          <h2 className="subheading">Transactions Ledger</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <SummaryCard
              title="Total Transactions"
              value={fmt(realtime?.ledger?.total)}
              icon={Receipt}
              color="#3b82f6"
            />
            <SummaryCard
              title="Inbound"
              value={fmt(realtime?.ledger?.inbound)}
              subValue={`${fmt(realtime?.ledger?.inbound_points)} pts / ${fmtCurrency(realtime?.ledger?.inbound_cash)}`}
              icon={ArrowDownLeft}
              color="#10b981"
            />
            <SummaryCard
              title="Outbound"
              value={fmt(realtime?.ledger?.outbound)}
              subValue={`${fmt(realtime?.ledger?.outbound_points)} pts / ${fmtCurrency(realtime?.ledger?.outbound_cash)}`}
              icon={ArrowUpRight}
              color="#f59e0b"
            />
            <SummaryCard
              title="Pending"
              value={fmt(realtime?.ledger?.pending)}
              icon={Clock}
              color="#f59e0b"
            />
            <SummaryCard
              title="Confirmed"
              value={fmt(realtime?.ledger?.confirmed)}
              icon={CheckCircle}
              color="#10b981"
            />
            <SummaryCard
              title="Failed"
              value={fmt(realtime?.ledger?.failed)}
              icon={AlertCircle}
              color="#dc2626"
            />
            <SummaryCard
              title="Reversed"
              value={fmt(realtime?.ledger?.reversed)}
              icon={RotateCcw}
              color="#6366f1"
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SOCIAL SECTION
          ══════════════════════════════════════════════════════════════════ */}
          <h2 className="subheading">Social</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <SummaryCard
              title="Total Posts"
              value={fmt(realtime?.social?.posts)}
              subValue={`${fmt(realtime?.social?.active_posts)} active`}
              icon={MessageSquare}
              color="#ec4899"
            />
            <SummaryCard
              title="Comments"
              value={fmt(realtime?.social?.comments)}
              icon={MessageCircle}
              color="#8b5cf6"
            />
            <SummaryCard
              title="Likes"
              value={fmt(realtime?.social?.likes)}
              icon={Heart}
              color="#ef4444"
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              CHART SECTION
          ══════════════════════════════════════════════════════════════════ */}
          {chartData.length > 0 && (
            <>
              <h2 className="subheading">Daily Trends ({days === 1 ? "Today" : `Last ${days} Days`})</h2>
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  {Object.entries(chartConfigs).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setActiveChart(key)}
                      className={activeChart === key ? "btn-primary" : "btn-secondary"}
                      style={{ padding: "0.35rem 0.7rem", fontSize: "0.8rem" }}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                      }}
                      formatter={(value) =>
                        activeChart === "cash" ? fmtCurrency(value) : fmt(value)
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey={chartConfigs[activeChart].key}
                      stroke={chartConfigs[activeChart].color}
                      fill={`${chartConfigs[activeChart].color}30`}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              BREAKDOWN TABLES SECTION
          ══════════════════════════════════════════════════════════════════ */}
          <h2 className="subheading">Breakdowns (All Time)</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* Members by Merchant */}
            <div className="card">
              <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: "600" }}>
                Members by Merchant
              </h3>
              <table className="basket-table">
                <thead>
                  <tr>
                    {membersByMerchantColumns.map((col) => (
                      <th key={col.key} style={{ textAlign: col.align || "left" }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(!realtime?.members_by_merchant || realtime.members_by_merchant.length === 0) ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: "1rem" }}>No data</td></tr>
                  ) : (
                    realtime.members_by_merchant.map((row, idx) => (
                      <tr key={idx}>
                        {membersByMerchantColumns.map((col) => (
                          <td key={col.key} style={{ textAlign: col.align || "left" }}>
                            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Members by Broker */}
            <div className="card">
              <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: "600" }}>
                Members by Broker
              </h3>
              <table className="basket-table">
                <thead>
                  <tr>
                    {membersByBrokerColumns.map((col) => (
                      <th key={col.key} style={{ textAlign: col.align || "left" }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(!realtime?.members_by_broker || realtime.members_by_broker.length === 0) ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: "1rem" }}>No data</td></tr>
                  ) : (
                    realtime.members_by_broker.map((row, idx) => (
                      <tr key={idx}>
                        {membersByBrokerColumns.map((col) => (
                          <td key={col.key} style={{ textAlign: col.align || "left" }}>
                            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Orders by Broker */}
            <div className="card">
              <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: "600" }}>
                Orders by Broker
              </h3>
              <table className="basket-table">
                <thead>
                  <tr>
                    {ordersByBrokerColumns.map((col) => (
                      <th key={col.key} style={{ textAlign: col.align || "left" }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(!realtime?.orders_by_broker || realtime.orders_by_broker.length === 0) ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", padding: "1rem" }}>No data</td></tr>
                  ) : (
                    realtime.orders_by_broker.map((row, idx) => (
                      <tr key={idx}>
                        {ordersByBrokerColumns.map((col) => (
                          <td key={col.key} style={{ textAlign: col.align || "left" }}>
                            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Points by Merchant */}
            <div className="card">
              <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: "600" }}>
                Points Loaded by Merchant
              </h3>
              <table className="basket-table">
                <thead>
                  <tr>
                    {pointsByMerchantColumns.map((col) => (
                      <th key={col.key} style={{ textAlign: col.align || "left" }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(!realtime?.points_by_merchant || realtime.points_by_merchant.length === 0) ? (
                    <tr><td colSpan={3} style={{ textAlign: "center", padding: "1rem" }}>No data</td></tr>
                  ) : (
                    realtime.points_by_merchant.map((row, idx) => (
                      <tr key={idx}>
                        {pointsByMerchantColumns.map((col) => (
                          <td key={col.key} style={{ textAlign: col.align || "left" }}>
                            {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              ORDER STATUS CHART
          ══════════════════════════════════════════════════════════════════ */}
          {realtime?.orders_by_status && realtime.orders_by_status.length > 0 && (
            <>
              <h2 className="subheading">Orders by Status</h2>
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={realtime.orders_by_status} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <YAxis
                      type="category"
                      dataKey="status"
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

        </>
      )}
    </div>
  );
}
