// src/pages/FundingHistory.jsx
import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function FundingHistory() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");
  const storedBroker = localStorage.getItem("broker");

  const [transfers, setTransfers] = useState([]);
  const [journals, setJournals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(90);
  const [activeTab, setActiveTab] = useState("overview");

  const loadFunding = useCallback(async () => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await apiPost("alpaca-get-funding.php", {
        member_id: memberId,
        days,
      });

      if (!data.success) {
        setError(data.error || "Failed to load funding history.");
        return;
      }

      setTransfers(data.transfers || []);
      setJournals(data.journals || []);
      setActivities(data.activities || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error("Funding fetch error:", err);
      setError("Network error while fetching funding history.");
    } finally {
      setLoading(false);
    }
  }, [memberId, days]);

  useEffect(() => {
    loadFunding();
  }, [loadFunding]);

  // ── Helpers ──
  const fmt = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  const fmtDate = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const fmtDateShort = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const statusColor = (status) => {
    const s = (status || "").toLowerCase();
    if (["complete", "executed", "settled", "completed"].includes(s)) return "#059669";
    if (["pending", "queued", "processing", "pending_new"].includes(s)) return "#d97706";
    if (["failed", "returned", "rejected", "cancelled", "canceled"].includes(s)) return "#dc2626";
    return "#6b7280";
  };

  const statusBg = (status) => {
    const s = (status || "").toLowerCase();
    if (["complete", "executed", "settled", "completed"].includes(s)) return "#ecfdf5";
    if (["pending", "queued", "processing", "pending_new"].includes(s)) return "#fffbeb";
    if (["failed", "returned", "rejected", "cancelled", "canceled"].includes(s)) return "#fef2f2";
    return "#f9fafb";
  };

  const activityLabel = (type) => {
    const labels = { CSD: "Cash Deposit", CSW: "Cash Withdrawal", DIV: "Dividend" };
    return labels[type] || type;
  };

  const activityIcon = (type) => {
    const icons = { CSD: "💰", CSW: "🏧", DIV: "📈" };
    return icons[type] || "📋";
  };

  // ── Styles ──
  const cardStyle = {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: "14px 16px",
    marginBottom: 10,
  };

  const labelStyle = {
    fontSize: "0.75rem",
    color: "#9ca3af",
    fontWeight: 500,
    marginBottom: 2,
  };

  const tabStyle = (tab) => ({
    flex: 1,
    padding: "8px 4px",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid #2563eb" : "2px solid transparent",
    background: "transparent",
    color: activeTab === tab ? "#2563eb" : "#6b7280",
    fontWeight: activeTab === tab ? 700 : 500,
    fontSize: "0.8rem",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ paddingBottom: 210, maxWidth: 600, margin: "0 auto", paddingLeft: 16, paddingRight: 16 }}>
      <h2 className="page-title" style={{ textAlign: "center" }}>
         {storedBroker} Funding History
      </h2>
      <p style={{ textAlign: "center", fontSize: "0.85rem", color: "#6b7280", margin: "-8px 0 16px 0" }}>
        Powered by {storedBroker}
      </p>

      {/* ── Period Selector ── */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <select
          className="form-input"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          style={{ fontSize: "0.85rem", padding: "6px 12px", minWidth: 140 }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 6 months</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          Loading funding history...
        </div>
      )}

      {error && !loading && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5",
          borderRadius: 12, padding: 16, color: "#dc2626",
          fontSize: "0.9rem", textAlign: "center", marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Summary Cards ── */}
          {summary && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ ...cardStyle, textAlign: "center", background: "linear-gradient(135deg, #ecfdf5, #d1fae5)" }}>
                <div style={labelStyle}>ACH Transfers In</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#059669" }}>
                  {fmt(summary.transfer_total_amount)}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                  {summary.transfer_count} transfer{summary.transfer_count !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ ...cardStyle, textAlign: "center", background: "linear-gradient(135deg, #eff6ff, #dbeafe)" }}>
                <div style={labelStyle}>Cash Journals</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#2563eb" }}>
                  {fmt(summary.journal_total_amount)}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                  {summary.journal_count} journal{summary.journal_count !== 1 ? "s" : ""}
                </div>
              </div>
              {summary.dividend_total > 0 && (
                <div style={{ ...cardStyle, textAlign: "center", gridColumn: "1 / -1", background: "linear-gradient(135deg, #fefce8, #fef9c3)" }}>
                  <div style={labelStyle}>Dividends Earned</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#d97706" }}>
                    {fmt(summary.dividend_total)}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* ── Tab Navigation ── */}
          <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 14, overflowX: "auto" }}>
            <button style={tabStyle("overview")} onClick={() => setActiveTab("overview")}>Overview</button>
            <button style={tabStyle("transfers")} onClick={() => setActiveTab("transfers")}>Transfers ({transfers.length})</button>
            <button style={tabStyle("journals")} onClick={() => setActiveTab("journals")}>Journals ({journals.length})</button>
            <button style={tabStyle("activity")} onClick={() => setActiveTab("activity")}>Activity ({activities.length})</button>
          </div>

          {/* ── Overview Tab ── */}
          {activeTab === "overview" && (() => {
            const timeline = [];
            transfers.forEach((t) => timeline.push({ type: "transfer", date: t.created_at, label: `${t.direction === "INCOMING" ? "Deposit" : "Withdrawal"} (${t.type?.toUpperCase() || "ACH"})`, amount: t.amount, status: t.status, detail: t.direction || "" }));
            journals.forEach((j) => timeline.push({ type: "journal", date: j.created_at, label: `Journal: ${j.description || "Cash transfer"}`, amount: j.amount, status: j.status, detail: `Settle: ${fmtDateShort(j.settle_date)}` }));
            activities.forEach((a) => timeline.push({ type: "activity", date: a.transaction_time, label: `${activityIcon(a.activity_type)} ${activityLabel(a.activity_type)}`, amount: a.amount, status: a.status, detail: a.symbol || a.description || "" }));
            timeline.sort((a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0));

            if (timeline.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 8 }}>💸</div>
                  <div style={{ fontWeight: 600 }}>No funding activity found</div>
                  <div style={{ fontSize: "0.85rem", marginTop: 4 }}>Try expanding the date range.</div>
                </div>
              );
            }

            const typeColors = {
              transfer: { border: "#6ee7b7", badge: "#059669", badgeBg: "#d1fae5" },
              journal: { border: "#93c5fd", badge: "#2563eb", badgeBg: "#dbeafe" },
              activity: { border: "#fde68a", badge: "#d97706", badgeBg: "#fef3c7" },
            };

            return timeline.map((item, i) => {
              const tc = typeColors[item.type] || typeColors.activity;
              return (
                <div key={`${item.type}-${i}`} style={{ ...cardStyle, borderLeft: `3px solid ${tc.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: tc.badge, background: tc.badgeBg, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>{item.type}</span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111827" }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: statusColor(item.status), background: statusBg(item.status), padding: "2px 8px", borderRadius: 12 }}>{(item.status || "").toUpperCase()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "#6b7280" }}>{item.detail}</span>
                    <span style={{ fontWeight: 700, color: "#059669" }}>{fmt(item.amount)}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 4 }}>{fmtDate(item.date)}</div>
                </div>
              );
            });
          })()}

          {/* ── Transfers Tab ── */}
          {activeTab === "transfers" && (
            transfers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>No ACH transfers found.</div>
            ) : transfers.map((t, i) => (
              <div key={t.transfer_id || i} style={{ ...cardStyle, borderLeft: "3px solid #6ee7b7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: t.direction === "INCOMING" ? "#059669" : "#dc2626", background: t.direction === "INCOMING" ? "#d1fae5" : "#fef2f2", padding: "2px 8px", borderRadius: 4 }}>
                      {t.direction === "INCOMING" ? "IN" : "OUT"}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "1rem", color: "#111827" }}>{fmt(t.amount)}</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: statusColor(t.status), background: statusBg(t.status), padding: "2px 10px", borderRadius: 20 }}>{(t.status || "").toUpperCase()}</span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#374151" }}>{t.type?.toUpperCase() || "ACH"} · {t.direction || "—"}</div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 4 }}>{fmtDate(t.created_at)}</div>
              </div>
            ))
          )}

          {/* ── Journals Tab ── */}
          {activeTab === "journals" && (
            journals.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>No journal entries found.</div>
            ) : journals.map((j, i) => (
              <div key={j.journal_id || i} style={{ ...cardStyle, borderLeft: "3px solid #93c5fd" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: "1rem", color: "#111827" }}>{fmt(j.amount)}</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: statusColor(j.status), background: statusBg(j.status), padding: "2px 10px", borderRadius: 20 }}>{(j.status || "").toUpperCase()}</span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#374151", marginBottom: 4 }}>{j.description || "Cash Journal (JNLC)"}</div>
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{j.entry_type} · Settle: {fmtDateShort(j.settle_date)}</div>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 4 }}>{fmtDate(j.created_at)}</div>
              </div>
            ))
          )}

          {/* ── Activity Tab ── */}
          {activeTab === "activity" && (
            activities.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>No account activity found.</div>
            ) : activities.map((a, i) => (
              <div key={a.activity_id || i} style={{ ...cardStyle, borderLeft: "3px solid #fde68a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.2rem" }}>{activityIcon(a.activity_type)}</span>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827" }}>{activityLabel(a.activity_type)}</span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: "1rem", color: a.amount >= 0 ? "#059669" : "#dc2626" }}>
                    {a.amount >= 0 ? "+" : ""}{fmt(a.amount)}
                  </span>
                </div>
                {a.symbol && <div style={{ fontSize: "0.85rem", color: "#374151" }}>Symbol: <strong>{a.symbol}</strong></div>}
                {a.description && <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{a.description}</div>}
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 4 }}>{fmtDate(a.transaction_time)}</div>
              </div>
            ))
          )}
        </>
      )}

      {/* ── Fixed Action Buttons ── */}
      {createPortal(
        <div style={{ position: "fixed", bottom: "112px", left: 0, right: 0, zIndex: 1000, display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: "var(--app-max-width, 600px)", background: "rgba(248, 250, 252, 0.7)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderTop: "1px solid #e2e8f0", paddingTop: 12, paddingBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: "10px", width: "90%", maxWidth: "480px" }}>
              <button type="button" className="btn-secondary" onClick={() => navigate("/portfolio")} style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600 }}>{storedBroker} Portfolio</button>
              <button type="button" className="btn-secondary" onClick={() => navigate("/alpaca-transactions")} style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600 }}>{storedBroker} Trades</button>
            </div>
            <button type="button" className="btn-primary" onClick={() => navigate("/wallet")} style={{ width: "90%", maxWidth: "320px", fontSize: "0.9rem", fontWeight: 700 }}>Back to Wallet</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
