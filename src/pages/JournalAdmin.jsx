// src/pages/JournalAdmin.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRightLeft, RefreshCw, Play, CheckCircle2, AlertCircle, AlertTriangle,
  Clock, DollarSign, Users, Building2, ChevronDown, ChevronRight, ArrowLeft,
  Loader2, ShieldAlert, Store, GitBranch,
} from "lucide-react";
import OrderPipeline from "../components/OrderPipeline";
import { apiPost } from "../api";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = v => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

function Tooltip({ text, children }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#1f2937", color: "#f9fafb", fontSize: "11px", lineHeight: 1.5, padding: "8px 12px", borderRadius: "7px", whiteSpace: "normal", width: 240, zIndex: 999, boxShadow: "0 4px 12px rgba(0,0,0,0.25)", pointerEvents: "none" }}>
          {text}
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", borderWidth: "5px", borderStyle: "solid", borderColor: "#1f2937 transparent transparent transparent" }} />
        </span>
      )}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = { approved: { bg: "#dbeafe", fg: "#1e40af", label: "Approved" }, funded: { bg: "#dcfce7", fg: "#166534", label: "Funded" }, executed: { bg: "#f0fdf4", fg: "#166534", label: "Executed" }, pending: { bg: "#fef3c7", fg: "#92400e", label: "Pending" }, placed: { bg: "#e0e7ff", fg: "#3730a3", label: "Placed" }, ready: { bg: "#e0e7ff", fg: "#3730a3", label: "Ready to Fund" }, failed: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" }, queued: { bg: "#fef9c3", fg: "#854d0e", label: "Queued" } };
  const s = map[(status || "").toLowerCase()] || { bg: "#f3f4f6", fg: "#374151", label: status };
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "600", backgroundColor: s.bg, color: s.fg }}>{s.label}</span>;
}

const makeKey = (mid, bid) => (mid && bid) ? `${mid}|${bid}` : mid ? mid : "";

// ── Pipeline cycle options (merchant + broker pairs) ──
function usePipelineCycles() {
  const [cycleOptions, setCycleOptions] = useState(null);
  useEffect(() => {
    apiPost("pipeline-cycles.php", { action: "list", limit: 100 }).then(res => {
      if (res?.success && Array.isArray(res.cycles)) {
        const open = res.cycles.filter(c => ["open", "locked"].includes(c.status));
        setCycleOptions(open.map(c => ({
          key:           makeKey(c.merchant_id_str || c.merchant_id, c.broker_id),
          merchant_id:   c.merchant_id_str || c.merchant_id,
          broker_id:     c.broker_id,
          merchant_name: c.merchant_name || c.merchant_id_str || c.merchant_id,
          broker_name:   c.broker_name   || c.broker_id,
          cycle:         c,
        })));
      } else { setCycleOptions([]); }
    }).catch(() => setCycleOptions([]));
  }, []);
  return cycleOptions;
}

/* ═══════════════════════════════════════════════════════════════════════════
   JOURNAL ADMIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function JournalAdmin() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── URL params (navigated from Pipeline Cycles) ───────────────────────────
  const params       = new URLSearchParams(location.search);
  const urlMerchantId = params.get("merchant_id") || "";
  const urlBrokerId   = params.get("broker_id")   || "";

  const cycleOptions      = usePipelineCycles();
  const pipelineMerchants = useMemo(
    () => cycleOptions
      ? cycleOptions.map(o => ({ merchant_id: o.merchant_id, merchant_name: o.merchant_name }))
      : null,
    [cycleOptions]
  );

  // ── Merchant·broker filter ────────────────────────────────────────────────
  const [selectedPair, setSelectedPair] = useState(makeKey(urlMerchantId, urlBrokerId));
  const filterMerchant = selectedPair.includes("|") ? selectedPair.split("|")[0] : selectedPair;

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("active");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [firmBalance, setFirmBalance] = useState(null);
  const [memberSummary, setMemberSummary] = useState([]);
  const [cycleMemberSummary, setCycleMemberSummary] = useState([]);
  const [recentJournals, setRecentJournals] = useState([]);
  const [pendingJournals, setPendingJournals] = useState([]);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [journaling, setJournaling] = useState(null); // merchant_id or "all"

  // Per-merchant selected members: { [merchant_id]: Set<member_id> }
  const [selectedByMerchant, setSelectedByMerchant] = useState({});
  const [expandedMerchants, setExpandedMerchants] = useState(new Set());
  const [expandedMember, setExpandedMember] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiPost("get-journal-status.php");
      if (res.success) {
        setFirmBalance(res.firm_balance);
        setPendingJournals(res.pending || []);
        setRecentJournals(res.recent_journals || []);
        setMemberSummary(res.member_summary || []);
        setCycleMemberSummary(res.cycle_member_summary || []);
      } else { setError(res.error || "Failed to load journal data"); }
    } catch (err) { setError("Network error: " + err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-expand pipeline merchants on load
  useEffect(() => {
    if (pipelineMerchants && pipelineMerchants.length > 0) {
      setExpandedMerchants(new Set(pipelineMerchants.map(m => m.merchant_id)));
    }
  }, [pipelineMerchants]);

  // Group member summary by merchant
  const merchantGroups = useMemo(() => {
    const groups = {};
    for (const m of memberSummary) {
      const mid = m.merchant_id || "unknown";
      if (!groups[mid]) groups[mid] = { merchant_id: mid, merchant_name: m.merchant_name || mid, members: [] };
      groups[mid].members.push(m);
    }
    return groups;
  }, [memberSummary]);

  // Determine which merchants to show: pipeline merchants first, then any others with pending members
  const displayMerchants = useMemo(() => {
    if (!pipelineMerchants) return [];
    const shown = new Set();
    const out = [];
    for (const pm of pipelineMerchants) {
      if (filterMerchant && pm.merchant_id !== filterMerchant) continue;
      shown.add(pm.merchant_id);
      out.push({ merchant_id: pm.merchant_id, merchant_name: pm.merchant_name, inPipeline: true });
    }
    for (const [mid, g] of Object.entries(merchantGroups)) {
      if (!shown.has(mid) && g.members.length > 0) {
        if (filterMerchant && mid !== filterMerchant) continue;
        out.push({ merchant_id: mid, merchant_name: g.merchant_name, inPipeline: false });
      }
    }
    return out;
  }, [pipelineMerchants, merchantGroups, filterMerchant]);

  const totalPending = pendingJournals.reduce((s, o) => s + parseFloat(o.amount || 0), 0);
  const balanceKnown = firmBalance !== null && firmBalance !== undefined;
  const insufficientForAll = balanceKnown && firmBalance < totalPending;
  const deficit = balanceKnown ? totalPending - firmBalance : 0;
  const hasPendingJournals = recentJournals.some(j => !["executed"].includes((j.journal_status || "").toLowerCase()));

  // Per-merchant helpers
  const getMerchantMembers     = (mid) => merchantGroups[mid]?.members || [];
  const getCycleMembersForMerchant = (mid) => {
    const entry = cycleMemberSummary.find(c => String(c.merchant_id) === String(mid));
    return entry?.members || [];
  };
  const getMerchantSelected = (mid) => selectedByMerchant[mid] || new Set();
  const toggleMember = (mid, memberId) => {
    setSelectedByMerchant(prev => {
      const cur = new Set(prev[mid] || []);
      cur.has(memberId) ? cur.delete(memberId) : cur.add(memberId);
      return { ...prev, [mid]: cur };
    });
  };
  const selectAllForMerchant = (mid, members) => {
    setSelectedByMerchant(prev => ({ ...prev, [mid]: new Set(members.filter(m => m.broker_account_id).map(m => m.member_id)) }));
  };
  const deselectAllForMerchant = (mid) => setSelectedByMerchant(prev => ({ ...prev, [mid]: new Set() }));

  const getMerchantTotal = (mid) => {
    const selected = getMerchantSelected(mid);
    return getMerchantMembers(mid).filter(m => selected.has(m.member_id)).reduce((s, m) => s + parseFloat(m.total_amount || 0), 0);
  };
  const getMerchantPendingTotal = (mid) => getMerchantMembers(mid).reduce((s, m) => s + parseFloat(m.total_amount || 0), 0);

  const checkBalance = async (required) => {
    try {
      const fresh = await apiPost("get-journal-status.php");
      if (fresh.success && fresh.firm_balance !== null) {
        setFirmBalance(fresh.firm_balance);
        if (fresh.firm_balance < required) { setError(`Insufficient IB sweep funds: balance is ${fmt(fresh.firm_balance)} but ${fmt(required)} is required. Shortfall of ${fmt(required - fresh.firm_balance)}.`); return false; }
      }
      return true;
    } catch { return true; }
  };

  // Journal selected for a specific merchant
  const runJournalForMerchant = async (mid) => {
    const selected = getMerchantSelected(mid);
    if (selected.size === 0) { setError("Select at least one member to journal"); return; }
    const total = getMerchantTotal(mid);
    const ok = await checkBalance(total); if (!ok) return;
    setJournaling(mid); setError(null); setSuccessMsg(null);
    try {
      const result = await apiPost("journal-sweep.php", { action: "journal", member_ids: Array.from(selected) });
      if (result.success) {
        setSuccessMsg(`[${merchantGroups[mid]?.merchant_name || mid}] Journaled ${fmt(result.total_journaled)} to ${result.members_funded} member(s). ${result.journals_created} journal(s) created.`);
        setSelectedByMerchant(prev => ({ ...prev, [mid]: new Set() }));
        await loadData();
      } else { setError(result.error || "Journal process failed"); }
    } catch (err) { setError("Network error: " + err.message); }
    finally { setJournaling(null); }
  };

  // Journal ALL members for a specific merchant
  const runJournalAllForMerchant = async (mid) => {
    const total = getMerchantPendingTotal(mid);
    const ok = await checkBalance(total); if (!ok) return;
    const members = getMerchantMembers(mid).filter(m => m.broker_account_id);
    setJournaling(mid); setError(null); setSuccessMsg(null);
    try {
      const result = await apiPost("journal-sweep.php", { action: "journal", member_ids: members.map(m => m.member_id) });
      if (result.success) {
        setSuccessMsg(`[${merchantGroups[mid]?.merchant_name || mid}] Journaled ${fmt(result.total_journaled)} to ${result.members_funded} member(s).`);
        await loadData();
      } else { setError(result.error || "Journal process failed"); }
    } catch (err) { setError("Network error: " + err.message); }
    finally { setJournaling(null); }
  };

  const checkJournalStatuses = useCallback(async () => {
    if (!recentJournals.length) return;
    setCheckingStatus(true);
    try {
      const res = await apiPost("check-journal-status.php", { journal_ids: recentJournals.filter(j => j.alpaca_journal_id).map(j => j.alpaca_journal_id) });
      if (res.success && res.statuses) setRecentJournals(prev => prev.map(j => { const u = res.statuses[j.alpaca_journal_id]; return u ? { ...j, journal_status: u } : j; }));
    } catch (err) { console.error("[JournalAdmin] status check failed:", err); }
    setCheckingStatus(false);
  }, [recentJournals]);

  const toggleExpandMerchant = (mid) => setExpandedMerchants(prev => { const n = new Set(prev); n.has(mid) ? n.delete(mid) : n.add(mid); return n; });

  return (
    <div className="app-container app-content">
      {/* ── Header ── */}
      <h1 className="page-title">Journal Funds</h1>
      <p className="page-deck">
        Transfer funded amounts from StockLoyal IB sweep → individual member broker accounts — split by pipeline merchant.
      </p>

      <OrderPipeline currentStep={3} />

      {/* ── Tabs + back button ── */}
      <div style={{
        display: "flex", gap: "0.5rem", marginBottom: "1.5rem",
        borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem",
        justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[
            { key: "active",  label: <><ArrowRightLeft size={12} style={{ verticalAlign: "middle" }} /> Active</> },
            { key: "history", label: <><CheckCircle2   size={12} style={{ verticalAlign: "middle" }} /> History</> },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: "0.5rem 1rem",
              background: activeTab === t.key ? "#10b981" : "transparent",
              color: activeTab === t.key ? "#fff" : "#64748b",
              border: "none", borderRadius: "6px", fontWeight: "500", cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
        <button onClick={() => navigate("/pipeline-cycles")} style={{
          display: "inline-flex", alignItems: "center", gap: "0.4rem",
          padding: "0.4rem 0.75rem", background: "none",
          border: "1px solid #d1d5db", borderRadius: "6px",
          color: "#6b7280", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
        }}>
          <ArrowLeft size={13} /> Pipeline Cycle Control Panel
        </button>
      </div>

      {/* ── Banners ── */}
      {error && (
        <div style={{ padding: "12px 16px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertCircle size={16} />{error}
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: "600" }}>✕</button>
        </div>
      )}
      {successMsg && (
        <div style={{ padding: "12px 16px", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", color: "#166534", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={16} />{successMsg}
          <button onClick={() => setSuccessMsg(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#166534", fontWeight: "600" }}>✕</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ACTIVE TAB                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "active" && (
        <>
          {/* Toolbar */}
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
            <button onClick={loadData} disabled={loading} style={{
              padding: "0.5rem 1rem", background: "#10b981", color: "#fff",
              border: "none", borderRadius: "6px", fontWeight: 600,
              fontSize: "0.85rem", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6,
            }}>
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>
            <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ marginTop: "8px", fontSize: "13px" }}>Loading journal data…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : (
          <>
          {/* ── Summary Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            <div style={{ padding: "16px", borderRadius: "10px", border: insufficientForAll ? "1px solid #fca5a5" : "1px solid #e5e7eb", backgroundColor: insufficientForAll ? "#fef2f2" : "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Building2 size={16} color={insufficientForAll ? "#dc2626" : "#6b7280"} />
                <span style={{ fontSize: "12px", color: insufficientForAll ? "#991b1b" : "#6b7280", fontWeight: "500" }}><Tooltip text="Cash held in StockLoyal's omnibus firm account at Alpaca.">IB Sweep Balance</Tooltip></span>
              </div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: insufficientForAll ? "#dc2626" : "#111827" }}>{firmBalance !== null ? fmt(firmBalance) : "—"}</div>
              <div style={{ fontSize: "11px", color: insufficientForAll ? "#dc2626" : "#9ca3af", marginTop: "4px" }}>{balanceKnown ? (insufficientForAll ? `⚠ Shortfall: ${fmt(deficit)}` : `✓ Surplus: ${fmt(firmBalance - totalPending)}`) : "IB Sweep"}</div>
            </div>
            <div style={{ padding: "16px", borderRadius: "10px", border: "1px solid #fde68a", backgroundColor: "#fffbeb" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}><Clock size={16} color="#d97706" /><span style={{ fontSize: "12px", color: "#92400e", fontWeight: "500" }}><Tooltip text="Orders paid but not yet journaled to member accounts.">Awaiting Journal</Tooltip></span></div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#92400e" }}>{fmt(totalPending)}</div>
              <div style={{ fontSize: "11px", color: "#b45309", marginTop: "4px" }}>{pendingJournals.length} order(s) · {memberSummary.length} member(s)</div>
            </div>
            <div style={{ padding: "16px", borderRadius: "10px", border: "1px solid #e5e7eb", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}><CheckCircle2 size={16} color="#16a34a" /><span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500" }}><Tooltip text="JNLC journal transfers submitted in last 30 days.">Recent Journals</Tooltip></span></div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#111827" }}>{recentJournals.length}</div>
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>Last 30 days</div>
            </div>
            <div style={{ padding: "16px", borderRadius: "10px", border: "1px solid #e5e7eb", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}><GitBranch size={16} color="#6366f1" /><span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500" }}>Active Cycles</span></div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#111827" }}>{pipelineMerchants?.length ?? "—"}</div>
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>Merchants with open pipeline</div>
            </div>
          </div>

          {/* Insufficient funds warning */}
          {balanceKnown && insufficientForAll && memberSummary.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", marginBottom: "16px" }}>
              <ShieldAlert size={20} color="#dc2626" style={{ flexShrink: 0 }} />
              <div><div style={{ fontSize: "13px", fontWeight: "600", color: "#991b1b" }}>Insufficient IB Sweep Funds</div><div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "2px" }}>Balance is {fmt(firmBalance)} but {fmt(totalPending)} is needed. Shortfall of {fmt(deficit)}.</div></div>
            </div>
          )}

          {/* No pipeline cycles */}
          {pipelineMerchants !== null && pipelineMerchants.length === 0 && memberSummary.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", background: "#f8fafc", borderRadius: 8, border: "2px dashed #cbd5e1", marginBottom: 16 }}>
              <GitBranch size={28} color="#94a3b8" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: "#64748b" }}>No active pipeline cycles</div>
              <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: 4 }}>Open a cycle in Pipeline Management to see merchants here.</div>
            </div>
          )}

          {/* Global refresh */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
            <button onClick={loadData} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#374151", fontSize: "12px", cursor: "pointer" }}>
              <RefreshCw size={12} /> Refresh All
            </button>
          </div>

          {/* ── Merchant Sections ── */}
          {displayMerchants.map(pm => {
            const mid = pm.merchant_id;
            const members = getMerchantMembers(mid);
            const isExpanded = expandedMerchants.has(mid);
            const selected = getMerchantSelected(mid);
            const merchantTotal = getMerchantPendingTotal(mid);
            const selectedTotal = getMerchantTotal(mid);
            const insufficientMerchant = balanceKnown && merchantTotal > 0 && firmBalance < merchantTotal;
            const isJournaling = journaling === mid;
            const cycleForMerchant = (cycleOptions || []).find(o => o.merchant_id === mid);
            const isJournalDone = cycleForMerchant?.cycle?.stage_journal === "completed";

            return (
              <div key={mid} style={{ backgroundColor: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: "16px" }}>
                {/* Merchant header */}
                <div onClick={() => toggleExpandMerchant(mid)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: isExpanded ? "#f9fafb" : "#fff", cursor: "pointer", borderBottom: isExpanded ? "1px solid #e5e7eb" : "none" }}>
                  <Store size={16} color="#8b5cf6" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
                      {pm.merchant_name}
                      {pm.inPipeline && <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#dbeafe", color: "#1d4ed8" }}>Pipeline Active</span>}
                      {isJournalDone && <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a" }}>✓ Journal Complete</span>}
                      {members.length === 0 && <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 8px", borderRadius: 4, background: "#f3f4f6", color: "#9ca3af" }}>No pending</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginTop: 2 }}>{members.length} member(s) · {fmt(merchantTotal)}{selected.size > 0 ? ` · ${selected.size} selected (${fmt(selectedTotal)})` : ""}</div>
                  </div>
                  {members.length > 0 && !isJournaling && (
                    <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={isJournalDone ? undefined : () => runJournalAllForMerchant(mid)}
                        disabled={isJournaling || journaling !== null || members.filter(m => m.broker_account_id).length === 0 || insufficientMerchant || isJournalDone}
                        title={isJournalDone ? "Journal stage already completed" : undefined}
                        style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "6px", border: "none",
                          backgroundColor: isJournalDone ? "#6b7280" : insufficientMerchant ? "#e5e7eb" : "#10b981",
                          color: insufficientMerchant ? "#9ca3af" : "white",
                          fontWeight: "600", fontSize: "12px",
                          cursor: isJournalDone ? "not-allowed" : "pointer",
                          opacity: isJournalDone ? 0.55 : 1,
                        }}>
                        {insufficientMerchant ? <ShieldAlert size={12} /> : <Play size={12} />} Journal All
                      </button>
                      {selected.size > 0 && (
                        <button onClick={() => runJournalForMerchant(mid)}
                          disabled={journaling !== null || isJournalDone}
                          style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "6px", border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#374151", fontWeight: "500", fontSize: "12px", cursor: "pointer" }}>
                          <ArrowRightLeft size={12} /> Journal ({selected.size})
                        </button>
                      )}
                    </div>
                  )}
                  {isJournaling && <Loader2 size={16} color="#10b981" style={{ animation: "spin 1s linear infinite" }} />}
                  {isExpanded ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                </div>

                {/* Member table */}
                {isExpanded && (
                  <>
                    {members.length === 0 && (
                      <>
                        <div style={{ padding: "10px 16px", background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: "#166534" }}>
                          <CheckCircle2 size={15} color="#16a34a" />
                          <span>No paid orders awaiting journal for this merchant.</span>
                        </div>
                        {/* Cycle order detail — all paid orders with journal status */}
                        {(() => {
                          const cycleMembers = getCycleMembersForMerchant(mid);
                          if (cycleMembers.length === 0) return (
                            <div style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                              No cycle orders found for this merchant.
                            </div>
                          );
                          return (
                            <div>
                              <div style={{ padding: "8px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: "11px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Cycle Orders — {cycleMembers.length} member{cycleMembers.length !== 1 ? "s" : ""}
                              </div>
                              {/* Member header */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 100px 90px", padding: "8px 16px", background: "#fafafa", borderBottom: "1px solid #f3f4f6", fontSize: "10px", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                <div>Member</div><div style={{ textAlign: "right" }}>Amount</div><div style={{ textAlign: "center" }}>Orders</div><div style={{ textAlign: "center" }}>Broker Acct</div><div style={{ textAlign: "center" }}>Journal</div>
                              </div>
                              {cycleMembers.map(m => {
                                const isExpMember = expandedMember === `cycle::${mid}::${m.member_id}`;
                                const allJournaled = m.orders.every(o => o.journal_status === 'executed' || o.status === 'funded');
                                const someJournaled = m.orders.some(o => o.journal_status === 'executed' || o.status === 'funded');
                                const journalLabel = allJournaled ? 'executed' : someJournaled ? 'partial' : 'pending';
                                const jColors = { executed: { bg: "#dcfce7", fg: "#166534" }, partial: { bg: "#fef3c7", fg: "#92400e" }, pending: { bg: "#f3f4f6", fg: "#6b7280" } }[journalLabel];
                                return (
                                  <React.Fragment key={m.member_id}>
                                    <div
                                      onClick={() => setExpandedMember(isExpMember ? null : `cycle::${mid}::${m.member_id}`)}
                                      style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 100px 90px", padding: "10px 16px", borderBottom: "1px solid #f3f4f6", alignItems: "center", cursor: "pointer", background: isExpMember ? "#f0f9ff" : "transparent" }}
                                      onMouseEnter={e => { if (!isExpMember) e.currentTarget.style.background = "#f8fafc"; }}
                                      onMouseLeave={e => { if (!isExpMember) e.currentTarget.style.background = "transparent"; }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {isExpMember ? <ChevronDown size={13} color="#6b7280" /> : <ChevronRight size={13} color="#6b7280" />}
                                        <div>
                                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{m.member_name || m.member_id}</div>
                                          <div style={{ fontSize: "11px", color: "#9ca3af" }}>{m.member_id}</div>
                                        </div>
                                      </div>
                                      <div style={{ textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#111827" }}>{fmt(m.total_amount)}</div>
                                      <div style={{ textAlign: "center", fontSize: "13px", color: "#374151" }}>{m.order_count}</div>
                                      <div style={{ textAlign: "center" }}>{m.broker_account_id ? <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: "500" }}>✓ Linked</span> : <span style={{ fontSize: "11px", color: "#dc2626", fontWeight: "500" }}>✗ None</span>}</div>
                                      <div style={{ textAlign: "center" }}>
                                        <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: 10, background: jColors.bg, color: jColors.fg }}>{journalLabel}</span>
                                      </div>
                                    </div>
                                    {isExpMember && (
                                      <div style={{ padding: "10px 16px 10px 48px", background: "#fafafa", borderBottom: "1px solid #e5e7eb" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 100px 120px", gap: 4, fontSize: "10px", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", marginBottom: 4 }}>
                                          <div>Symbol</div><div style={{ textAlign: "right" }}>Amount</div><div style={{ textAlign: "center" }}>Basket</div><div style={{ textAlign: "center" }}>Status</div><div style={{ textAlign: "center" }}>Journal</div>
                                        </div>
                                        {m.orders.map((o, i) => (
                                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 100px 120px", gap: 4, padding: "5px 0", fontSize: "12px", color: "#374151", borderBottom: "1px solid #f3f4f6", alignItems: "center" }}>
                                            <div style={{ fontWeight: "500" }}>{o.symbol}</div>
                                            <div style={{ textAlign: "right" }}>{fmt(o.amount)}</div>
                                            <div style={{ textAlign: "center", color: "#6b7280", fontFamily: "monospace", fontSize: "11px" }}>{o.basket_id}</div>
                                            <div style={{ textAlign: "center" }}><StatusBadge status={o.status} /></div>
                                            <div style={{ textAlign: "center" }}>
                                              {o.journal_status
                                                ? <StatusBadge status={o.journal_status} />
                                                : <span style={{ fontSize: "11px", color: "#9ca3af" }}>—</span>}
                                            </div>
                                          </div>
                                        ))}
                                        {m.broker_account_id && (
                                          <div style={{ marginTop: 8, fontSize: "11px", color: "#6b7280" }}>
                                            Broker Account: <code style={{ fontSize: "10px" }}>{m.broker_account_id}</code>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </>
                    )}
                    {members.length > 0 && (
                    <>
                      {/* Select all bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: "12px", color: "#6b7280" }}>
                        <input type="checkbox"
                          checked={selected.size > 0 && selected.size === members.filter(m => m.broker_account_id).length}
                          onChange={e => e.target.checked ? selectAllForMerchant(mid, members) : deselectAllForMerchant(mid)} />
                        <span>Select all eligible</span>
                        <span style={{ marginLeft: "auto" }}>Total: <strong>{fmt(merchantTotal)}</strong></span>
                      </div>
                      {/* Header row */}
                      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 120px 100px 100px 90px", padding: "8px 16px", backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: "11px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <div></div><div>Member</div><div style={{ textAlign: "right" }}>Amount</div><div style={{ textAlign: "center" }}>Orders</div><div style={{ textAlign: "center" }}>Broker Acct</div><div style={{ textAlign: "center" }}>Status</div>
                      </div>
                      {members.map(m => {
                        const isExpMember = expandedMember === `${mid}::${m.member_id}`;
                        const isSelected = selected.has(m.member_id);
                        const hasBrokerAcct = !!m.broker_account_id;
                        return (
                          <React.Fragment key={m.member_id}>
                            <div
                              style={{ display: "grid", gridTemplateColumns: "40px 1fr 120px 100px 100px 90px", padding: "10px 16px", borderBottom: "1px solid #f3f4f6", alignItems: "center", backgroundColor: isSelected ? "#f0fdf4" : "transparent", cursor: "pointer" }}
                              onClick={() => setExpandedMember(isExpMember ? null : `${mid}::${m.member_id}`)}
                            >
                              <div onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSelected} disabled={!hasBrokerAcct} onChange={() => toggleMember(mid, m.member_id)} /></div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {isExpMember ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                                <div>
                                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{m.member_name || m.member_id}</div>
                                  <div style={{ fontSize: "11px", color: "#9ca3af" }}>{m.member_id}</div>
                                </div>
                              </div>
                              <div style={{ textAlign: "right", fontSize: "14px", fontWeight: "600", color: "#111827" }}>{fmt(m.total_amount)}</div>
                              <div style={{ textAlign: "center", fontSize: "13px", color: "#374151" }}>{m.order_count}</div>
                              <div style={{ textAlign: "center" }}>{hasBrokerAcct ? <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: "500" }}>✓ Linked</span> : <span style={{ fontSize: "11px", color: "#dc2626", fontWeight: "500" }}>✗ None</span>}</div>
                              <div style={{ textAlign: "center" }}><StatusBadge status={hasBrokerAcct ? "ready" : "failed"} /></div>
                            </div>
                            {isExpMember && (
                              <div style={{ padding: "12px 16px 12px 56px", backgroundColor: "#fafafa", borderBottom: "1px solid #e5e7eb" }}>
                                <div style={{ fontSize: "11px", fontWeight: "600", color: "#6b7280", marginBottom: "8px" }}>ORDERS TO FUND</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 80px", gap: "4px", fontSize: "11px", color: "#6b7280", fontWeight: "600", marginBottom: "4px" }}><div>Symbol</div><div style={{ textAlign: "right" }}>Amount</div><div style={{ textAlign: "center" }}>Basket</div><div style={{ textAlign: "center" }}>Status</div></div>
                                {(m.orders || []).map((o, i) => (
                                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 80px", gap: "4px", padding: "5px 0", fontSize: "12px", color: "#374151", borderBottom: "1px solid #f3f4f6" }}>
                                    <div style={{ fontWeight: "500" }}>{o.symbol}</div><div style={{ textAlign: "right" }}>{fmt(o.amount)}</div><div style={{ textAlign: "center", color: "#6b7280" }}>{o.basket_id}</div><div style={{ textAlign: "center" }}><StatusBadge status={o.status} /></div>
                                  </div>
                                ))}
                                {m.broker_account_id && <div style={{ marginTop: "8px", fontSize: "11px", color: "#6b7280" }}>Broker Account: <code style={{ fontSize: "10px" }}>{m.broker_account_id}</code></div>}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* ── Recent Journal History moved to History tab ── */}
          </>
        )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HISTORY TAB                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "history" && (
        <div>
          {recentJournals.length === 0 && !loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8", background: "#f8fafc", borderRadius: 8, border: "2px dashed #cbd5e1" }}>
              <CheckCircle2 size={28} color="#94a3b8" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: "#64748b" }}>No recent journal transactions</div>
              <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: 4 }}>Journals will appear here after running the Journal step.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: "600", color: "#374151", margin: 0 }}>Recent Journal Transactions</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={loadData} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: "12px", fontWeight: "600", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: "6px", cursor: "pointer" }}>
                    <RefreshCw size={12} /> Refresh
                  </button>
                  <button onClick={checkJournalStatuses} disabled={checkingStatus} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: "600", background: checkingStatus ? "#e5e7eb" : "#f0fdf4", color: checkingStatus ? "#9ca3af" : "#166534", border: `1px solid ${checkingStatus ? "#d1d5db" : "#86efac"}`, borderRadius: "6px", cursor: "pointer" }}>
                    {checkingStatus ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Checking…</> : <><RefreshCw size={12} /> Check Alpaca Status</>}
                  </button>
                </div>
              </div>
              {hasPendingJournals && (
                <div style={{ backgroundColor: "#fef3c7", border: "2px solid #f59e0b", borderRadius: "8px", padding: "12px 16px", marginBottom: "12px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: "13px", color: "#92400e", lineHeight: 1.6 }}><strong>One or more journals are still pending at Alpaca.</strong> The Sweep step requires all journals to be in <strong>executed</strong> status. Click <em>Check Alpaca Status</em> to refresh.</div>
                </div>
              )}
              {!hasPendingJournals && recentJournals.length > 0 && (
                <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "10px 16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#166534" }}>
                  <CheckCircle2 size={16} color="#10b981" /> All journals executed — you may proceed to the Sweep step.
                </div>
              )}
              <div style={{ backgroundColor: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px 100px 130px", padding: "10px 16px", backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: "11px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <div>Member</div><div>Journal ID</div><div style={{ textAlign: "right" }}>Amount</div><div style={{ textAlign: "center" }}>Status</div><div style={{ textAlign: "center" }}>Orders</div><div style={{ textAlign: "right" }}>Journaled At</div>
                </div>
                {recentJournals.map((j, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px 100px 130px", padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: "12px", color: "#374151", alignItems: "center" }}>
                    <div><div style={{ fontWeight: "500" }}>{j.member_name || j.member_id}</div><div style={{ fontSize: "10px", color: "#9ca3af" }}>{j.member_id} · {j.merchant_id}</div></div>
                    <div><code style={{ fontSize: "10px", color: "#6b7280" }}>{(j.alpaca_journal_id || "—").substring(0, 16)}…</code></div>
                    <div style={{ textAlign: "right", fontWeight: "600" }}>{fmt(j.amount)}</div>
                    <div style={{ textAlign: "center" }}><StatusBadge status={j.journal_status || "journaled"} /></div>
                    <div style={{ textAlign: "center" }}>{j.order_count}</div>
                    <div style={{ textAlign: "right", fontSize: "11px", color: "#6b7280" }}>{j.journaled_at ? new Date(j.journaled_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
