// src/pages/AlpacaBrokerAdmin.jsx
import React, { useCallback, useEffect, useState } from "react";
import { apiPost } from "../api.js";
import {
  RefreshCw, Building2, Users, ArrowLeftRight,
  ShoppingCart, BookOpen, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Clock, XCircle,
} from "lucide-react";

// ── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const s = (status || "").toLowerCase();
  let bg = "#fef3c7", color = "#92400e";
  if (["complete", "completed", "filled", "executed", "approved"].includes(s))  { bg = "#d1fae5"; color = "#065f46"; }
  else if (["pending", "pending_approval", "queued"].includes(s))               { bg = "#fef3c7"; color = "#92400e"; }
  else if (["rejected", "failed", "canceled", "cancelled"].includes(s))         { bg = "#fee2e2"; color = "#991b1b"; }
  else if (["partially_filled", "partial"].includes(s))                         { bg = "#f3e8ff"; color = "#6b21a8"; }
  else if (["accepted", "new"].includes(s))                                     { bg = "#dbeafe"; color = "#1e40af"; }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 8px",
      borderRadius: 999, fontSize: "0.7rem", fontWeight: 600,
      backgroundColor: bg, color, textTransform: "capitalize", whiteSpace: "nowrap",
    }}>
      {status || "—"}
    </span>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = "#2563eb" }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
      padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: color + "18", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: "0.72rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827" }}>{value ?? "—"}</div>
        {sub && <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
        fontSize: "0.85rem", fontWeight: active ? 700 : 500,
        background: active ? "#2563eb" : "#f3f4f6",
        color: active ? "#fff" : "#374151",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      {label}
      {count != null && (
        <span style={{
          background: active ? "rgba(255,255,255,0.25)" : "#e5e7eb",
          color: active ? "#fff" : "#6b7280",
          borderRadius: 999, padding: "1px 6px", fontSize: "0.7rem", fontWeight: 700,
        }}>{count}</span>
      )}
    </button>
  );
}

// ── fmt helpers ──────────────────────────────────────────────────────────────
const fmt$ = (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtDt = (v) => v ? new Date(v).toLocaleString() : "—";
const fmtDate = (v) => v ? new Date(v).toLocaleDateString() : "—";

// ─────────────────────────────────────────────────────────────────────────────
export default function AlpacaBrokerAdmin() {
  const [activeTab, setActiveTab]     = useState("overview");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // Overview / firm
  const [firmAccount, setFirmAccount] = useState(null);

  // Accounts
  const [accounts, setAccounts]       = useState([]);
  const [acctFilter, setAcctFilter]   = useState("");

  // Transfers
  const [transfers, setTransfers]     = useState([]);
  const [xferFilter, setXferFilter]   = useState("");

  // Orders
  const [brokerOrders, setBrokerOrders] = useState([]);
  const [orderFilter, setOrderFilter]   = useState("");

  // Journals
  const [journals, setJournals]       = useState([]);
  const [journalFilter, setJournalFilter] = useState("");

  // Detail expand
  const [expandedRow, setExpandedRow] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("alpaca-broker-admin.php", { action: "all" });
      if (!data?.success) { setError(data?.error || "Failed to load broker data."); return; }
      setFirmAccount(data.firm_account || null);
      setAccounts(data.accounts || []);
      setTransfers(data.transfers || []);
      setBrokerOrders(data.orders || []);
      setJournals(data.journals || []);
    } catch (e) {
      setError("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTab = useCallback(async (tab) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("alpaca-broker-admin.php", { action: tab });
      if (!data?.success) { setError(data?.error || "Failed to load data."); return; }
      if (tab === "accounts")   setAccounts(data.accounts || []);
      if (tab === "transfers")  setTransfers(data.transfers || []);
      if (tab === "orders")     setBrokerOrders(data.orders || []);
      if (tab === "journals")   setJournals(data.journals || []);
    } catch (e) {
      setError("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setExpandedRow(null);
  };

  // ── Filtered lists ─────────────────────────────────────────────────────────
  const filteredAccounts = accounts.filter(a => {
    if (!acctFilter) return true;
    const q = acctFilter.toLowerCase();
    return (a.id || "").toLowerCase().includes(q)
      || (a.account_number || "").toLowerCase().includes(q)
      || (a.status || "").toLowerCase().includes(q);
  });

  const filteredTransfers = transfers.filter(t => {
    if (!xferFilter) return true;
    const q = xferFilter.toLowerCase();
    return (t.id || "").toLowerCase().includes(q)
      || (t.account_id || "").toLowerCase().includes(q)
      || (t.type || "").toLowerCase().includes(q)
      || (t.status || "").toLowerCase().includes(q);
  });

  const filteredOrders = brokerOrders.filter(o => {
    if (!orderFilter) return true;
    const q = orderFilter.toLowerCase();
    return (o.id || "").toLowerCase().includes(q)
      || (o.account_id || "").toLowerCase().includes(q)
      || (o.symbol || "").toLowerCase().includes(q)
      || (o.status || "").toLowerCase().includes(q);
  });

  const filteredJournals = journals.filter(j => {
    if (!journalFilter) return true;
    const q = journalFilter.toLowerCase();
    return (j.id || "").toLowerCase().includes(q)
      || (j.from_account_id || "").toLowerCase().includes(q)
      || (j.to_account_id || "").toLowerCase().includes(q)
      || (j.entry_type || "").toLowerCase().includes(q)
      || (j.status || "").toLowerCase().includes(q);
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="admin-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 120px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Alpaca Broker Dashboard</h1>
          <p className="page-deck" style={{ margin: "4px 0 0" }}>
            Firm balance, member accounts, transfers, orders, and journal entries via Alpaca Broker API.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={fetchAll}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ background: "#fef2f2", borderLeft: "4px solid #ef4444", padding: "12px 16px", marginBottom: "1rem", color: "#991b1b", display: "flex", gap: 10, alignItems: "center" }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" }}>
        <TabBtn label="Overview"  active={activeTab === "overview"}   onClick={() => handleTabChange("overview")} />
        <TabBtn label="Accounts"  active={activeTab === "accounts"}   onClick={() => handleTabChange("accounts")}  count={accounts.length || null} />
        <TabBtn label="Transfers" active={activeTab === "transfers"}  onClick={() => handleTabChange("transfers")} count={transfers.length || null} />
        <TabBtn label="Orders"    active={activeTab === "orders"}     onClick={() => handleTabChange("orders")}    count={brokerOrders.length || null} />
        <TabBtn label="Journals"  active={activeTab === "journals"}   onClick={() => handleTabChange("journals")}  count={journals.length || null} />
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <>
          {firmAccount ? (
            <>
              {/* Firm balance summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: "1rem" }}>
                <StatCard label="Last Equity"     value={fmt$(firmAccount.last_equity)}      icon={Building2}      color="#2563eb" />
                <StatCard label="Account #"       value={firmAccount.account_number}         icon={Building2}      color="#059669" sub={firmAccount.status} />
                <StatCard label="Trading Type"    value={firmAccount.trading_type}           icon={Building2}      color="#7c3aed" />
                <StatCard label="Currency"        value={firmAccount.currency}               icon={Building2}      color="#d97706" />
              </div>

              {/* Firm account details */}
              <div className="card" style={{ marginBottom: "1rem" }}>
                <h2 className="subheading" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Building2 size={16} /> Firm Account
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px 24px" }}>
                  {[
                    ["Account ID",        firmAccount.id],
                    ["Account Number",    firmAccount.account_number],
                    ["Account Name",      firmAccount.account_name],
                    ["Status",            firmAccount.status],
                    ["Currency",          firmAccount.currency],
                    ["Last Equity",       fmt$(firmAccount.last_equity)],
                    ["Trading Type",      firmAccount.trading_type],
                    ["Crypto Status",     firmAccount.crypto_status],
                    ["Enabled Assets",    (firmAccount.enabled_assets || []).join(", ")],
                    ["Created At",        fmtDate(firmAccount.created_at)],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: "0.72rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{val ?? "—"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick counts */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <StatCard label="Member Accounts" value={accounts.length}   icon={Users}          color="#2563eb" sub="Click Accounts tab" />
                <StatCard label="Transfers"        value={transfers.length}  icon={ArrowLeftRight} color="#059669" sub="Click Transfers tab" />
                <StatCard label="Orders"           value={brokerOrders.length} icon={ShoppingCart} color="#d97706" sub="Click Orders tab" />
                <StatCard label="Journals"         value={journals.length}   icon={BookOpen}       color="#7c3aed" sub="Click Journals tab" />
              </div>
            </>
          ) : (
            !loading && (
              <div className="card" style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
                <Building2 size={36} color="#d1d5db" style={{ marginBottom: 8 }} />
                <div>No firm account data. Click Refresh to load.</div>
              </div>
            )
          )}
        </>
      )}

      {/* ── Accounts ── */}
      {activeTab === "accounts" && (
        <>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Search:</label>
              <input
                className="form-input"
                style={{ maxWidth: 280 }}
                placeholder="Account ID, number, or status…"
                value={acctFilter}
                onChange={e => setAcctFilter(e.target.value)}
              />
              <button type="button" className="btn-secondary" onClick={() => fetchTab("accounts")} disabled={loading} style={{ marginLeft: "auto" }}>
                <RefreshCw size={12} /> Refresh
              </button>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{filteredAccounts.length} of {accounts.length} accounts</span>
            </div>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Account ID</th>
                  <th>Account #</th>
                  <th>Status</th>
                  <th>KYC</th>
                  <th style={{ textAlign: "right" }}>Last Equity</th>
                  <th>Member</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No accounts found.</td></tr>
                ) : filteredAccounts.map((a, i) => (
                  <React.Fragment key={a.id || a._member_id || i}>
                    <tr
                      style={{ cursor: "pointer", background: expandedRow === (a.id || a._member_id) ? "#f0f9ff" : undefined }}
                      onClick={() => setExpandedRow(expandedRow === (a.id || a._member_id) ? null : (a.id || a._member_id))}
                    >
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{a.id}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{a.account_number || "—"}</td>
                      <td><StatusPill status={a.status} /></td>
                      <td><StatusPill status={a.kyc_results?.summary || "—"} /></td>
                      <td style={{ textAlign: "right" }}>{fmt$(a.last_equity)}</td>
                      <td style={{ textAlign: "right" }}>{a._member_id || "—"}</td>
                      <td style={{ fontSize: "0.8rem" }}>{fmtDate(a.created_at)}</td>
                      <td>{expandedRow === (a.id || a._member_id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    </tr>
                    {expandedRow === (a.id || a._member_id) && (
                      <tr>
                        <td colSpan={8} style={{ background: "#f8fafc", padding: "12px 16px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px 24px" }}>
                            {[
                              ["Member ID",        a._member_id],
                              ["Currency",         a.currency],
                              ["Last Equity",      fmt$(a.last_equity)],
                              ["Trading Type",     a.trading_type],
                              ["Crypto Status",    a.crypto_status],
                              ["Account Type",     a.account_type],
                              ["Enabled Assets",   (a.enabled_assets || []).join(", ")],
                              ["Country",          a.identity?.country_of_citizenship || a.identity?.country_of_tax_residence],
                              ["Email",            a.contact?.email_address],
                              ["Updated",          fmtDt(a.updated_at)],
                            ].map(([label, val]) => (
                              <div key={label}>
                                <div style={{ fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                                <div style={{ fontSize: "0.85rem" }}>{val ?? "—"}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Transfers ── */}
      {activeTab === "transfers" && (
        <>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Search:</label>
              <input
                className="form-input"
                style={{ maxWidth: 280 }}
                placeholder="Transfer ID, account, type, status…"
                value={xferFilter}
                onChange={e => setXferFilter(e.target.value)}
              />
              <button type="button" className="btn-secondary" onClick={() => fetchTab("transfers")} disabled={loading} style={{ marginLeft: "auto" }}>
                <RefreshCw size={12} /> Refresh
              </button>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{filteredTransfers.length} of {transfers.length} transfers</span>
            </div>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Transfer ID</th>
                  <th>Account ID</th>
                  <th>Type</th>
                  <th>Direction</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No transfers found.</td></tr>
                ) : filteredTransfers.map(t => (
                  <React.Fragment key={t.id}>
                    <tr
                      style={{ cursor: "pointer", background: expandedRow === t.id ? "#f0f9ff" : undefined }}
                      onClick={() => setExpandedRow(expandedRow === t.id ? null : t.id)}
                    >
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.id}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.account_id}</td>
                      <td>{t.type || "—"}</td>
                      <td>{t.direction || "—"}</td>
                      <td style={{ textAlign: "right" }}>{fmt$(t.amount)}</td>
                      <td><StatusPill status={t.status} /></td>
                      <td style={{ fontSize: "0.8rem" }}>{fmtDate(t.created_at)}</td>
                      <td>{expandedRow === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    </tr>
                    {expandedRow === t.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "#f8fafc", padding: "12px 16px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px 24px" }}>
                            {[
                              ["Relationship ID", t.relationship_id],
                              ["Bank Name", t.bank_name],
                              ["Reason", t.reason],
                              ["Expires At", fmtDt(t.expires_at)],
                              ["Updated At", fmtDt(t.updated_at)],
                              ["Requested Amount", fmt$(t.requested_amount)],
                              ["Fee", fmt$(t.fee)],
                              ["Currency", t.currency],
                            ].map(([label, val]) => (
                              <div key={label}>
                                <div style={{ fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                                <div style={{ fontSize: "0.85rem" }}>{val ?? "—"}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Orders ── */}
      {activeTab === "orders" && (
        <>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Search:</label>
              <input
                className="form-input"
                style={{ maxWidth: 280 }}
                placeholder="Order ID, account, symbol, status…"
                value={orderFilter}
                onChange={e => setOrderFilter(e.target.value)}
              />
              <button type="button" className="btn-secondary" onClick={() => fetchTab("orders")} disabled={loading} style={{ marginLeft: "auto" }}>
                <RefreshCw size={12} /> Refresh
              </button>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{filteredOrders.length} of {brokerOrders.length} orders</span>
            </div>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Account ID</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Filled Qty</th>
                  <th style={{ textAlign: "right" }}>Filled Avg $</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No orders found.</td></tr>
                ) : filteredOrders.map(o => (
                  <React.Fragment key={o.id}>
                    <tr
                      style={{ cursor: "pointer", background: expandedRow === o.id ? "#f0f9ff" : undefined }}
                      onClick={() => setExpandedRow(expandedRow === o.id ? null : o.id)}
                    >
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{o.id}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{o.account_id}</td>
                      <td style={{ fontWeight: 600 }}>{o.symbol}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700,
                          background: o.side === "buy" ? "#d1fae5" : "#fee2e2",
                          color: o.side === "buy" ? "#065f46" : "#991b1b",
                        }}>{o.side}</span>
                      </td>
                      <td>{o.type}</td>
                      <td style={{ textAlign: "right" }}>{o.qty ?? o.notional ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{o.filled_qty ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{o.filled_avg_price ? fmt$(o.filled_avg_price) : "—"}</td>
                      <td><StatusPill status={o.status} /></td>
                      <td style={{ fontSize: "0.8rem" }}>{fmtDate(o.submitted_at)}</td>
                      <td>{expandedRow === o.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    </tr>
                    {expandedRow === o.id && (
                      <tr>
                        <td colSpan={11} style={{ background: "#f8fafc", padding: "12px 16px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px 24px" }}>
                            {[
                              ["Client Order ID", o.client_order_id],
                              ["Time In Force", o.time_in_force],
                              ["Limit Price", fmt$(o.limit_price)],
                              ["Stop Price", fmt$(o.stop_price)],
                              ["Notional", fmt$(o.notional)],
                              ["Created At", fmtDt(o.created_at)],
                              ["Updated At", fmtDt(o.updated_at)],
                              ["Filled At", fmtDt(o.filled_at)],
                              ["Expired At", fmtDt(o.expired_at)],
                              ["Canceled At", fmtDt(o.canceled_at)],
                              ["Extended Hours", o.extended_hours ? "Yes" : "No"],
                              ["Commission", fmt$(o.commission)],
                            ].map(([label, val]) => (
                              <div key={label}>
                                <div style={{ fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                                <div style={{ fontSize: "0.85rem" }}>{val ?? "—"}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Journals ── */}
      {activeTab === "journals" && (
        <>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Search:</label>
              <input
                className="form-input"
                style={{ maxWidth: 280 }}
                placeholder="Journal ID, account, type, status…"
                value={journalFilter}
                onChange={e => setJournalFilter(e.target.value)}
              />
              <button type="button" className="btn-secondary" onClick={() => fetchTab("journals")} disabled={loading} style={{ marginLeft: "auto" }}>
                <RefreshCw size={12} /> Refresh
              </button>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{filteredJournals.length} of {journals.length} journals</span>
            </div>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table className="basket-table">
              <thead>
                <tr>
                  <th>Journal ID</th>
                  <th>From Account</th>
                  <th>To Account</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th>Entry Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredJournals.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No journals found.</td></tr>
                ) : filteredJournals.map((j, i) => (
                  <React.Fragment key={j.id || i}>
                    <tr
                      style={{ cursor: "pointer", background: expandedRow === j.id ? "#f0f9ff" : undefined }}
                      onClick={() => setExpandedRow(expandedRow === j.id ? null : j.id)}
                    >
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{j.id}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{j.from_account_id}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{j.to_account_id}</td>
                      <td>{j.entry_type || "—"}</td>
                      <td style={{ textAlign: "right" }}>{fmt$(j.net_amount ?? j.amount)}</td>
                      <td><StatusPill status={j.status} /></td>
                      <td style={{ fontSize: "0.8rem" }}>{fmtDate(j.settle_date || j.entry_date)}</td>
                      <td>{expandedRow === j.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    </tr>
                    {expandedRow === j.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "#f8fafc", padding: "12px 16px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px 24px" }}>
                            {[
                              ["Symbol", j.symbol],
                              ["Qty", j.qty],
                              ["Price", fmt$(j.price)],
                              ["Currency", j.currency],
                              ["Description", j.description],
                              ["System Date", fmtDate(j.system_date)],
                              ["Settle Date", fmtDate(j.settle_date)],
                              ["Entry Date", fmtDate(j.entry_date)],
                            ].map(([label, val]) => (
                              <div key={label}>
                                <div style={{ fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                                <div style={{ fontSize: "0.85rem" }}>{val ?? "—"}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          <RefreshCw size={24} style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: 8 }}>Loading from Alpaca…</div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
