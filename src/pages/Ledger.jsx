// src/pages/Ledger.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

// ── Month helpers ──
const getMonthKey = (dateStr, tz) => {
  if (!dateStr) return "Unknown";
  let iso = String(dateStr).trim();
  if (!/Z$|[+-]\d{2}/.test(iso)) iso = iso.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: tz }).formatToParts(d);
    const y = parts.find(p => p.type === "year")?.value;
    const m = parts.find(p => p.type === "month")?.value;
    return `${y}-${m}`;
  } catch {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
};

const getMonthLabel = (key) => {
  if (key === "Unknown") return "Unknown Date";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
};

export default function Ledger() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");
  const merchantName = localStorage.getItem("merchantName");
  const broker = localStorage.getItem("broker");

  const [entries, setEntries] = useState([]);
  const [memberTimezone, setMemberTimezone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState(""); // "" = all | tx_type | date | status | direction | channel
  const [filterValue, setFilterValue] = useState("");

  // Slider state for selected ledger entry
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState(new Set());

  // ── Infinite scroll ──
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Browser-detected fallback
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  const effectiveTz = memberTimezone || detectedTz;

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    try {
      const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: effectiveTz }).formatToParts(now);
      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      return `${y}-${m}`;
    } catch {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
  }, [effectiveTz]);

  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // Fetch ledger + wallet (for timezone) in parallel
        const [ledgerRes, walletRes] = await Promise.all([
          apiPost("get-ledger.php", { member_id: memberId }),
          apiPost("get-wallet.php", { member_id: memberId }),
        ]);

        if (!ledgerRes?.success) {
          setError(ledgerRes?.error || "Failed to load ledger.");
        } else {
          // Use rows (actual key from API), with fallbacks
          setEntries(
            ledgerRes.ledger ||
              ledgerRes.entries ||
              ledgerRes.rows || // <- main source
              []
          );
        }

        const tz =
          walletRes?.success &&
          walletRes?.wallet?.member_timezone &&
          String(walletRes.wallet.member_timezone).trim() !== ""
            ? walletRes.wallet.member_timezone
            : detectedTz;

        setMemberTimezone(tz);
      } catch (err) {
        console.error("Ledger fetch error:", err);
        setError("Network error while fetching ledger.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, detectedTz]);

  const formatDollars = (val) =>
    (parseFloat(val) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });

  const formatPoints = (val) =>
    (parseInt(val, 10) || 0).toLocaleString("en-US");

  // Filter entries based on selected filter
  const filteredEntries = useMemo(() => {
    if (!filterField || !filterValue.trim()) {
      return entries; // No filter applied
    }

    const val = filterValue.trim().toLowerCase();

    switch (filterField) {
      case "tx_type":
        return entries.filter((e) => 
          (e.tx_type || "").toLowerCase() === val
        );
      
      case "date": {
        // Filter by date (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(filterValue)) {
          return entries;
        }
        return entries.filter((e) => {
          if (!e.created_at) return false;
          const entryDate = e.created_at.split(" ")[0]; // Extract YYYY-MM-DD
          return entryDate === filterValue;
        });
      }
      
      case "status":
        return entries.filter((e) => 
          (e.status || "").toLowerCase() === val
        );
      
      case "direction":
        return entries.filter((e) => 
          (e.direction || "").toLowerCase() === val
        );
      
      case "channel":
        return entries.filter((e) => 
          (e.channel || "") === filterValue.trim()
        );
      
      default:
        return entries;
    }
  }, [entries, filterField, filterValue]);

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterField, filterValue]);

  // ── Visible entries (infinite scroll) ──
  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, visibleCount),
    [filteredEntries, visibleCount]
  );
  const hasMore = visibleCount < filteredEntries.length;

  // ── Group visible entries by month ──
  const monthlyEntries = useMemo(() => {
    const groups = new Map();
    for (const e of visibleEntries) {
      const key = getMonthKey(e.created_at, effectiveTz);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visibleEntries, effectiveTz]);

  // Initialize expanded months — current month open by default
  useEffect(() => {
    if (monthlyEntries.length > 0 && expandedMonths.size === 0) {
      setExpandedMonths(new Set([currentMonthKey]));
    }
  }, [monthlyEntries]);

  const toggleMonth = (key) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── IntersectionObserver for infinite scroll ──
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  // Convert UTC/MySQL-ish timestamps to member's local time string
  const toLocalZonedString = (ts) => {
    if (!ts) return "-";

    let iso = String(ts).trim();
    const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
    if (!hasZone) iso = iso.replace(" ", "T") + "Z";

    const d = new Date(iso);
    if (isNaN(d.getTime())) return ts;

    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: memberTimezone || detectedTz,
        timeZoneName: "short",
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  const openEntry = (entry) => {
    setSelectedEntry(entry);
    setIsLedgerOpen(true);
  };

  const closeEntry = () => {
    setIsLedgerOpen(false);
    setTimeout(() => setSelectedEntry(null), 180);
  };

  return (
    <div className="transactions-container" style={{ paddingBottom: 160 }}>
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Transaction Ledger
      </h2>

      {/* --- Page Notice --- */}
      <p className="form-disclosure mt-4">
        <strong>Note:</strong> This page displays points and cash related transactions with {merchantName} and  {broker}. To view track trade orders "View Order History"
.      </p>

      {/* Filter bar */}
      {!loading && !error && entries.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Filter controls row */}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: "600", color: "#374151", minWidth: "50px" }}>
                Filter:
              </label>
              <select
                className="form-input"
                style={{ minWidth: 200, flex: "0 1 auto" }}
                value={filterField}
                onChange={(e) => {
                  setFilterField(e.target.value);
                  setFilterValue("");
                }}
              >
                <option value="">All Entries</option>
                <option value="tx_type">Transaction Type</option>
                <option value="date">Date</option>
                <option value="status">Status</option>
                <option value="direction">Direction</option>
                <option value="channel">Channel</option>
              </select>

              {filterField === "tx_type" && (
                <select
                  className="form-input"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                >
                  <option value="">All Types</option>
                  <option value="points_received">Points Received</option>
                  <option value="redeem_points">Redeem Points</option>
                  <option value="adjust_points">Adjust Points</option>
                  <option value="cash_in">Cash In</option>
                  <option value="cash_out">Cash Out</option>
                  <option value="cash_fee">Cash Fee</option>
                </select>
              )}

              {filterField === "status" && (
                <select
                  className="form-input"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="failed">Failed</option>
                  <option value="reversed">Reversed</option>
                </select>
              )}

              {filterField === "direction" && (
                <select
                  className="form-input"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                >
                  <option value="">All Directions</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              )}

              {filterField === "channel" && (
                <select
                  className="form-input"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                >
                  <option value="">All Channels</option>
                  <option value="Plaid">Plaid</option>
                  <option value="ACH">ACH</option>
                  <option value="Broker API">Broker API</option>
                  <option value="Merchant API">Merchant API</option>
                  <option value="Card">Card</option>
                  <option value="Wire">Wire</option>
                  <option value="Internal">Internal</option>
                  <option value="Other">Other</option>
                </select>
              )}

              {filterField === "date" && (
                <input
                  className="form-input"
                  type="date"
                  placeholder="Select date"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ minWidth: 240, flex: "1 1 auto", maxWidth: "400px" }}
                />
              )}

              <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap" }}>
                Showing <strong>{visibleEntries.length}</strong> of <strong>{filteredEntries.length}</strong> entries
                {filteredEntries.length !== entries.length && (
                  <> (filtered from {entries.length})</>
                )}
              </span>
            </div>

            {/* Clear filter button row */}
            {(filterField || filterValue) && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setFilterField("");
                    setFilterValue("");
                  }}
                  style={{ fontSize: "0.85rem", minWidth: "120px" }}
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading your ledger...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : filteredEntries.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          {entries.length === 0 ? "No ledger entries found." : "No entries match the current filter."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {monthlyEntries.map(([monthKey, monthEntries]) => {
            const isMonthOpen = expandedMonths.has(monthKey);
            const isCurrent = monthKey === currentMonthKey;

            return (
              <div key={monthKey}>
                {/* Month banner */}
                <div
                  onClick={() => toggleMonth(monthKey)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: isCurrent ? "#eff6ff" : "#f8fafc",
                    border: `1px solid ${isCurrent ? "#bfdbfe" : "#e2e8f0"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#1e293b" }}>
                    {getMonthLabel(monthKey)}{isCurrent ? " (Current)" : ""}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: "#64748b" }}>
                    {monthEntries.length} entr{monthEntries.length !== 1 ? "ies" : "y"}
                    <span style={{ fontSize: "1.1rem" }}>{isMonthOpen ? "▲" : "▼"}</span>
                  </span>
                </div>

                {isMonthOpen && (
                  <div className="basket-table-wrapper" style={{ overflowX: "auto", marginTop: 10 }}>
                    <table
                      className="basket-table"
                      style={{
                        width: "100%",
                        minWidth: "760px",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          <th>Created</th>
                          <th>Type</th>
                          <th>Direction</th>
                          <th>Channel</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Points</th>
                          <th style={{ textAlign: "right" }}>Cash</th>
                          <th>Order ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthEntries.map((entry, idx) => (
                          <tr
                            key={idx}
                            onClick={() => openEntry(entry)}
                            style={{ cursor: "pointer" }}
                            title="Click to view details"
                          >
                            <td style={{ fontSize: "0.9rem" }}>
                              {entry.created_at ? toLocalZonedString(entry.created_at) : "-"}
                            </td>
                            <td style={{ textTransform: "capitalize" }}>
                              {formatTxType(entry.tx_type)}
                            </td>
                            <td style={{ textTransform: "capitalize" }}>
                              {entry.direction || "-"}
                            </td>
                            <td>{entry.channel || "-"}</td>
                            <td>
                              <span style={getLedgerStatusPillStyle(entry.status)}>
                                {entry.status || "-"}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {entry.amount_points != null ? formatPoints(entry.amount_points) : "-"}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {entry.amount_cash != null ? formatDollars(entry.amount_cash) : "-"}
                            </td>
                            <td>{entry.order_id ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} style={{ textAlign: "center", padding: "16px 0", color: "#9ca3af", fontSize: "0.85rem" }}>
          Loading more entries…
        </div>
      )}
      {!hasMore && filteredEntries.length > PAGE_SIZE && (
        <div style={{ textAlign: "center", padding: "12px 0", color: "#9ca3af", fontSize: "0.8rem" }}>
          All {filteredEntries.length} entries loaded
        </div>
      )}

      {/* ✅ Ledger detail slider */}
      {isLedgerOpen && selectedEntry && (
        <div className="stocklist-overlay" onClick={closeEntry}>
          <div className="stocklist-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="stocklist-sheet-header">
              <div className="stocklist-sheet-handle" />
              <div className="stocklist-sheet-title-row">
                <h2 className="stocklist-heading">Ledger Entry Details</h2>
                <button type="button" className="stocklist-close-btn" onClick={closeEntry}>
                  ✕
                </button>
              </div>
            </div>

            <div className="stocklist-sheet-content">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* ENTRY SECTION */}
                <Section title="Entry">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailField label="Ledger ID">
                      {selectedEntry.tx_id ?? "-"}
                    </DetailField>
                    <DetailField label="Member ID">
                      {selectedEntry.member_id ?? "-"}
                    </DetailField>
                    <DetailField label="Merchant ID">
                      {selectedEntry.merchant_id ?? "-"}
                    </DetailField>
                    <DetailField label="Order ID">
                      {selectedEntry.order_id ?? "-"}
                    </DetailField>

                    <DetailField label="Type">
                      {formatTxType(selectedEntry.tx_type)}
                    </DetailField>
                    <DetailField label="Direction">
                      {selectedEntry.direction ?? "-"}
                    </DetailField>

                    <DetailField label="Channel">
                      {selectedEntry.channel ?? "-"}
                    </DetailField>
                    <DetailField label="Status">
                      <span style={getLedgerStatusPillStyle(selectedEntry.status)}>
                        {selectedEntry.status || "-"}
                      </span>
                    </DetailField>
                  </div>

                  <DetailField label="Created">
                    {selectedEntry.created_at
                      ? toLocalZonedString(selectedEntry.created_at)
                      : "-"}
                  </DetailField>
                </Section>

                {/* AMOUNTS SECTION */}
                <Section title="Amounts">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailField label="Points">
                      {selectedEntry.amount_points != null
                        ? formatPoints(selectedEntry.amount_points)
                        : "-"}
                    </DetailField>
                    <DetailField label="Cash">
                      {selectedEntry.amount_cash != null
                        ? formatDollars(selectedEntry.amount_cash)
                        : "-"}
                    </DetailField>
                  </div>
                </Section>

                {/* ROUTING / REFS SECTION */}
                <Section title="Routing / References">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailField label="Client Tx ID">
                      {selectedEntry.client_tx_id ?? "-"}
                    </DetailField>
                    <DetailField label="External Ref">
                      {selectedEntry.external_ref ?? "-"}
                    </DetailField>
                  </div>

                  <DetailField label="Broker">
                    {selectedEntry.broker ?? "-"}
                  </DetailField>
                  <DetailField label="Note">
                    {selectedEntry.note ?? "-"}
                  </DetailField>
                </Section>

                {/* META SECTION */}
                <Section title="Meta">
                  <DetailField label="Member Timezone">
                    {selectedEntry.member_timezone ?? memberTimezone ?? detectedTz}
                  </DetailField>
                </Section>
              </div>
            </div>

            <div className="stocklist-sheet-footer">
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "100%" }}
                onClick={closeEntry}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Fixed Action Buttons (portal to body) --- */}
      {createPortal(
        <div
          style={{
            position: "fixed",
            bottom: "var(--footer-height, 56px)",
            left: 0,
            right: 0,
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "var(--app-max-width, 600px)",
              background: "rgba(248, 250, 252, 0.7)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderTop: "1px solid #e2e8f0",
              paddingTop: 12,
              paddingBottom: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                gap: "10px",
                width: "90%",
                maxWidth: "480px",
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate("/portfolio")}
                style={{ flex: 1 }}
              >
                View StockLoyal Portfolio
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate("/transactions")}
                style={{ flex: 1 }}
              >
                View Order History
              </button>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate("/wallet")}
              style={{ width: "90%", maxWidth: "320px" }}
            >
              Back to Wallet
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Small, stacked label/value field for the detail overlay
 */
function DetailField({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#6b7280",
        }}
      >
        {label}
      </span>
      <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#111827" }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Section wrapper to group related fields
 */
function Section({ title, children }) {
  return (
    <section
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "#6b7280",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

/**
 * Status pill styling for ledger status
 * ('pending','confirmed','failed','reversed')
 */
function getLedgerStatusPillStyle(statusRaw) {
  const status = (statusRaw || "").toString().toLowerCase();

  let bg = "#e5e7eb";
  let color = "#374151";

  if (status === "confirmed") {
    bg = "#dcfce7";
    color = "#166534";
  } else if (status === "failed") {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (status === "pending") {
    bg = "#fef9c3";
    color = "#854d0e";
  } else if (status === "reversed") {
    bg = "#e0f2fe";
    color = "#075985";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: bg,
    color,
    textTransform: "capitalize",
  };
}

/**
 * Human-friendly label for tx_type enum
 * ('points_received','redeem_points','adjust_points','cash_in','cash_out','cash_fee')
 */
function formatTxType(txTypeRaw) {
  if (!txTypeRaw) return "-";
  const txType = txTypeRaw.toString();

  switch (txType) {
    case "points_received":
      return "Points Received";
    case "redeem_points":
      return "Redeem Points";
    case "adjust_points":
      return "Adjust Points";
    case "cash_in":
      return "Cash In";
    case "cash_out":
      return "Cash Out";
    case "cash_fee":
      return "Cash Fee";
    default:
      // Fallback: replace underscores & capitalize first letter
      return txType
        .split("_")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
  }
}
