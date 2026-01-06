// src/pages/Ledger.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function Ledger() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [entries, setEntries] = useState([]);
  const [memberTimezone, setMemberTimezone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Slider state for selected ledger entry
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

  // Browser-detected fallback
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

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
    (parseFloat(val) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
    <div className="transactions-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Account Ledger
      </h2>

      <p className="subtext" style={{ textAlign: "center", marginTop: -6, marginBottom: 12 }}>
        Showing times in <strong>{memberTimezone || detectedTz}</strong>
      </p>

      {loading ? (
        <p>Loading your ledger...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : entries.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          No ledger entries found.
        </p>
      ) : (
        <div className="basket-table-wrapper" style={{ overflowX: "auto" }}>
          <table
            className="basket-table"
            style={{
              width: "100%",
              minWidth: "860px",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th>Created (Local)</th>
                <th>Type</th>
                <th>Direction</th>
                <th>Channel</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Points</th>
                <th style={{ textAlign: "right" }}>Cash</th>
                <th>Broker</th>
                <th>Order ID</th>
              </tr>
            </thead>

            <tbody>
              {entries.map((entry, idx) => (
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
                  <td>{entry.broker || "-"}</td>
                  <td>{entry.order_id ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

                  <DetailField label="Created (Local)">
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

      {/* --- Centered Action Buttons --- */}
      <div
        className="transactions-actions"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          marginTop: "20px",
        }}
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate("/transactions")}
          style={{ width: "90%", maxWidth: "320px" }}
        >
          View Order Transactions
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/wallet")}
          style={{ width: "90%", maxWidth: "320px" }}
        >
          Back to Wallet
        </button>
      </div>
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
