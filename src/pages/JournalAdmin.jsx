// src/pages/JournalAdmin.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  DollarSign,
  Users,
  Building2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  Loader2,
} from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";
import { apiPost } from "../api";

/* ─── Status badge helper ─────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    settled:    { bg: "#dcfce7", fg: "#166534", label: "Settled" },
    pending:    { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
    journaled:  { bg: "#dbeafe", fg: "#1e40af", label: "Journaled" },
    ready:      { bg: "#e0e7ff", fg: "#3730a3", label: "Ready to Journal" },
    failed:     { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
    executed:   { bg: "#f0fdf4", fg: "#166534", label: "Executed" },
    queued:     { bg: "#fef9c3", fg: "#854d0e", label: "Queued" },
  };
  const s = map[(status || "").toLowerCase()] || { bg: "#f3f4f6", fg: "#374151", label: status };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: "600",
        backgroundColor: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
}

/* ─── Currency formatter ──────────────────────────────────────── */
const fmt = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

/* ═════════════════════════════════════════════════════════════════
   JOURNAL ADMIN PAGE
   ═════════════════════════════════════════════════════════════════ */
export default function JournalAdmin() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [journaling, setJournaling] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Data
  const [firmBalance, setFirmBalance] = useState(null);
  const [pendingJournals, setPendingJournals] = useState([]);  // Orders settled but not yet journaled
  const [recentJournals, setRecentJournals] = useState([]);     // Completed journals
  const [memberSummary, setMemberSummary] = useState([]);       // Grouped by member
  const [queueCounts, setQueueCounts] = useState(null);

  // UI
  const [expandedMember, setExpandedMember] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // ── Load data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [journalData, counts] = await Promise.all([
        apiPost("get-journal-status.php"),
        apiPost("admin-queue-counts.php"),
      ]);

      if (journalData.success) {
        setFirmBalance(journalData.firm_balance);
        setPendingJournals(journalData.pending || []);
        setRecentJournals(journalData.recent_journals || []);
        setMemberSummary(journalData.member_summary || []);
      } else {
        setError(journalData.error || "Failed to load journal data");
      }

      if (counts.success) {
        setQueueCounts(counts.counts);
      }
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Select all toggle ──────────────────────────────────────────
  useEffect(() => {
    if (selectAll) {
      setSelectedMembers(new Set(memberSummary.map((m) => m.member_id)));
    } else if (selectedMembers.size === memberSummary.length && memberSummary.length > 0) {
      // Deselect all only if toggle was explicit
    }
  }, [selectAll, memberSummary]);

  const toggleMember = (memberId) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  // ── Run journal process ────────────────────────────────────────
  const runJournal = async () => {
    if (selectedMembers.size === 0) {
      setError("Select at least one member to journal");
      return;
    }

    setJournaling(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await apiPost("journal-sweep.php", {
        action: "journal",
        member_ids: Array.from(selectedMembers),
      });

      if (result.success) {
        setSuccessMsg(
          `Journaled ${fmt(result.total_journaled)} to ${result.members_funded} member account(s). ` +
          `${result.journals_created} journal(s) created.`
        );
        setSelectedMembers(new Set());
        setSelectAll(false);
        await loadData();
      } else {
        setError(result.error || "Journal process failed");
      }
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      setJournaling(false);
    }
  };

  // ── Journal ALL ────────────────────────────────────────────────
  const runJournalAll = async () => {
    setJournaling(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await apiPost("journal-sweep.php", {
        action: "journal_all",
      });

      if (result.success) {
        setSuccessMsg(
          `Journaled ${fmt(result.total_journaled)} to ${result.members_funded} member account(s). ` +
          `${result.journals_created} journal(s) created.`
        );
        setSelectedMembers(new Set());
        setSelectAll(false);
        await loadData();
      } else {
        setError(result.error || "Journal process failed");
      }
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      setJournaling(false);
    }
  };

  // ── Computed values ────────────────────────────────────────────
  const totalPending = pendingJournals.reduce((s, o) => s + parseFloat(o.amount || 0), 0);
  const selectedTotal = memberSummary
    .filter((m) => selectedMembers.has(m.member_id))
    .reduce((s, m) => s + parseFloat(m.total_amount || 0), 0);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "16px" }}>
      {/* Back + Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <button
          onClick={() => navigate("/admin")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px",
            color: "#6b7280",
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "#111827" }}>
            <ArrowRightLeft size={22} style={{ verticalAlign: "text-bottom", marginRight: "8px", color: "#10b981" }} />
            Journal Funds
          </h2>
          <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
            Transfer settled funds from StockLoyal sweep account → individual member Alpaca accounts
          </p>
        </div>
      </div>

      {/* Pipeline */}
      <OrderPipeline currentStep={3} queueCounts={queueCounts} />

      {/* Error/Success banners */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
            fontSize: "13px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertCircle size={16} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: "600" }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            color: "#166534",
            fontSize: "13px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} />
          {successMsg}
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#166534", fontWeight: "600" }}
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ marginTop: "8px", fontSize: "13px" }}>Loading journal data…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <>
          {/* ── Summary Cards ──────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            {/* Firm Balance */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Building2 size={16} color="#6b7280" />
                <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500" }}>
                  SL Firm Sweep Balance
                </span>
              </div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#111827" }}>
                {firmBalance !== null ? fmt(firmBalance) : "—"}
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                Alpaca Firm Account
              </div>
            </div>

            {/* Pending Amount */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid #fde68a",
                backgroundColor: "#fffbeb",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Clock size={16} color="#d97706" />
                <span style={{ fontSize: "12px", color: "#92400e", fontWeight: "500" }}>
                  Awaiting Journal
                </span>
              </div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#92400e" }}>
                {fmt(totalPending)}
              </div>
              <div style={{ fontSize: "11px", color: "#b45309", marginTop: "4px" }}>
                {pendingJournals.length} order(s) · {memberSummary.length} member(s)
              </div>
            </div>

            {/* Selected */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                border: selectedMembers.size > 0 ? "1px solid #86efac" : "1px solid #e5e7eb",
                backgroundColor: selectedMembers.size > 0 ? "#f0fdf4" : "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Users size={16} color={selectedMembers.size > 0 ? "#16a34a" : "#6b7280"} />
                <span style={{ fontSize: "12px", color: selectedMembers.size > 0 ? "#166534" : "#6b7280", fontWeight: "500" }}>
                  Selected to Journal
                </span>
              </div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: selectedMembers.size > 0 ? "#166534" : "#111827" }}>
                {fmt(selectedTotal)}
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                {selectedMembers.size} of {memberSummary.length} member(s)
              </div>
            </div>

            {/* Recent Journals */}
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <CheckCircle2 size={16} color="#16a34a" />
                <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500" }}>
                  Recent Journals
                </span>
              </div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#111827" }}>
                {recentJournals.length}
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                Last 30 days
              </div>
            </div>
          </div>

          {/* ── Action Bar ─────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "16px",
              padding: "12px 16px",
              backgroundColor: "#f9fafb",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={runJournalAll}
              disabled={journaling || memberSummary.length === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: journaling ? "#86efac" : "#10b981",
                color: "white",
                fontWeight: "600",
                fontSize: "13px",
                cursor: journaling || memberSummary.length === 0 ? "not-allowed" : "pointer",
                opacity: memberSummary.length === 0 ? 0.5 : 1,
              }}
            >
              {journaling ? (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Play size={14} />
              )}
              {journaling ? "Journaling…" : "Journal All"}
            </button>

            <button
              onClick={runJournal}
              disabled={journaling || selectedMembers.size === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                backgroundColor: selectedMembers.size > 0 ? "#fff" : "#f3f4f6",
                color: selectedMembers.size > 0 ? "#374151" : "#9ca3af",
                fontWeight: "500",
                fontSize: "13px",
                cursor: journaling || selectedMembers.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              <ArrowRightLeft size={14} />
              Journal Selected ({selectedMembers.size})
            </button>

            <div style={{ flex: 1 }} />

            <button
              onClick={loadData}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                backgroundColor: "#fff",
                color: "#374151",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          {/* ── Member Summary Table ───────────────────────── */}
          {memberSummary.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                backgroundColor: "#f0fdf4",
                borderRadius: "12px",
                border: "1px solid #bbf7d0",
              }}
            >
              <CheckCircle2 size={36} color="#16a34a" style={{ marginBottom: "8px" }} />
              <p style={{ margin: 0, fontSize: "15px", fontWeight: "600", color: "#166534" }}>
                All caught up!
              </p>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#4ade80" }}>
                No settled orders awaiting journal. Run Settlement first or wait for merchants to pay.
              </p>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                overflow: "hidden",
              }}
            >
              {/* Table Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 120px 100px 100px 90px",
                  padding: "10px 16px",
                  backgroundColor: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <div>
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={(e) => {
                      setSelectAll(e.target.checked);
                      if (!e.target.checked) setSelectedMembers(new Set());
                    }}
                  />
                </div>
                <div>Member</div>
                <div style={{ textAlign: "right" }}>Amount</div>
                <div style={{ textAlign: "center" }}>Orders</div>
                <div style={{ textAlign: "center" }}>Alpaca Acct</div>
                <div style={{ textAlign: "center" }}>Status</div>
              </div>

              {/* Rows */}
              {memberSummary.map((m) => {
                const isExpanded = expandedMember === m.member_id;
                const isSelected = selectedMembers.has(m.member_id);
                const hasAlpaca = !!m.alpaca_account_id;

                return (
                  <React.Fragment key={m.member_id}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 1fr 120px 100px 100px 90px",
                        padding: "12px 16px",
                        borderBottom: "1px solid #f3f4f6",
                        alignItems: "center",
                        backgroundColor: isSelected ? "#f0fdf4" : "transparent",
                        cursor: "pointer",
                        transition: "background-color 0.1s",
                      }}
                      onClick={() =>
                        setExpandedMember(isExpanded ? null : m.member_id)
                      }
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!hasAlpaca}
                          onChange={() => toggleMember(m.member_id)}
                          title={hasAlpaca ? "" : "No Alpaca account — cannot journal"}
                        />
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {isExpanded ? (
                          <ChevronDown size={14} color="#6b7280" />
                        ) : (
                          <ChevronRight size={14} color="#6b7280" />
                        )}
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>
                            {m.member_name || m.member_id}
                          </div>
                          <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                            {m.member_id} · {m.merchant_name || m.merchant_id}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: "right", fontSize: "14px", fontWeight: "600", color: "#111827" }}>
                        {fmt(m.total_amount)}
                      </div>

                      <div style={{ textAlign: "center", fontSize: "13px", color: "#374151" }}>
                        {m.order_count}
                      </div>

                      <div style={{ textAlign: "center" }}>
                        {hasAlpaca ? (
                          <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: "500" }}>
                            ✓ Linked
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#dc2626", fontWeight: "500" }}>
                            ✗ None
                          </span>
                        )}
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <StatusBadge status={hasAlpaca ? "ready" : "failed"} />
                      </div>
                    </div>

                    {/* Expanded order detail */}
                    {isExpanded && (
                      <div
                        style={{
                          padding: "12px 16px 12px 56px",
                          backgroundColor: "#fafafa",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ fontSize: "11px", fontWeight: "600", color: "#6b7280", marginBottom: "8px" }}>
                          ORDERS TO FUND
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 100px 100px 80px",
                            gap: "4px",
                            fontSize: "11px",
                            color: "#6b7280",
                            fontWeight: "600",
                            marginBottom: "4px",
                          }}
                        >
                          <div>Symbol</div>
                          <div style={{ textAlign: "right" }}>Amount</div>
                          <div style={{ textAlign: "center" }}>Basket</div>
                          <div style={{ textAlign: "center" }}>Status</div>
                        </div>
                        {(m.orders || []).map((o, i) => (
                          <div
                            key={i}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 100px 100px 80px",
                              gap: "4px",
                              padding: "6px 0",
                              fontSize: "12px",
                              color: "#374151",
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            <div style={{ fontWeight: "500" }}>{o.symbol}</div>
                            <div style={{ textAlign: "right" }}>{fmt(o.amount)}</div>
                            <div style={{ textAlign: "center", color: "#6b7280" }}>{o.basket_id}</div>
                            <div style={{ textAlign: "center" }}>
                              <StatusBadge status={o.status} />
                            </div>
                          </div>
                        ))}

                        {m.alpaca_account_id && (
                          <div style={{ marginTop: "8px", fontSize: "11px", color: "#6b7280" }}>
                            Alpaca Account: <code style={{ fontSize: "10px" }}>{m.alpaca_account_id}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* ── Recent Journal History ─────────────────────── */}
          {recentJournals.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: "600", color: "#374151", marginBottom: "12px" }}>
                Recent Journal Transactions
              </h3>
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 100px 120px 100px 130px",
                    padding: "10px 16px",
                    backgroundColor: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <div>Member</div>
                  <div>Journal ID</div>
                  <div style={{ textAlign: "right" }}>Amount</div>
                  <div style={{ textAlign: "center" }}>Status</div>
                  <div style={{ textAlign: "center" }}>Orders</div>
                  <div style={{ textAlign: "right" }}>Journaled At</div>
                </div>

                {recentJournals.map((j, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 100px 120px 100px 130px",
                      padding: "10px 16px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: "12px",
                      color: "#374151",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "500" }}>{j.member_name || j.member_id}</div>
                      <div style={{ fontSize: "10px", color: "#9ca3af" }}>{j.member_id}</div>
                    </div>
                    <div>
                      <code style={{ fontSize: "10px", color: "#6b7280" }}>
                        {(j.alpaca_journal_id || "—").substring(0, 16)}…
                      </code>
                    </div>
                    <div style={{ textAlign: "right", fontWeight: "600" }}>{fmt(j.amount)}</div>
                    <div style={{ textAlign: "center" }}>
                      <StatusBadge status={j.journal_status || "journaled"} />
                    </div>
                    <div style={{ textAlign: "center" }}>{j.order_count}</div>
                    <div style={{ textAlign: "right", fontSize: "11px", color: "#6b7280" }}>
                      {j.journaled_at
                        ? new Date(j.journaled_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
