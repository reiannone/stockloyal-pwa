// src/pages/DocumentCenter.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function DocumentCenter() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [documents, setDocuments] = useState([]);
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(null); // document_id being downloaded

  // Alert modal (replaces window.alert)
  const [modal, setModal] = useState({ open: false, title: "", message: "", type: "error" });

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterYear, setFilterYear] = useState("");

  // ── Load documents ──
  const loadDocuments = useCallback(async () => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = { member_id: memberId };

      // Add type filter if selected
      if (filterType) {
        payload.type = filterType;
      }

      // Add date range filter if year selected
      if (filterYear) {
        payload.start = `${filterYear}-01-01`;
        payload.end = `${filterYear}-12-31`;
      }

      const data = await apiPost("alpaca-get-documents.php", payload);

      if (!data.success) {
        setError(data.error || "Failed to load documents.");
        return;
      }

      setDocuments(data.documents || []);
      setAccountNumber(data.account_number || "");
    } catch (err) {
      console.error("[DocumentCenter] fetch error:", err);
      setError("Network error loading documents.");
    } finally {
      setLoading(false);
    }
  }, [memberId, filterType, filterYear]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // ── Download handler ──
  const handleDownload = async (docId, docName) => {
    setDownloading(docId);
    try {
      const data = await apiPost("alpaca-download-document.php", {
        member_id: memberId,
        document_id: docId,
      });

      if (data.success && data.download_url) {
        // Open PDF in new tab
        window.open(data.download_url, "_blank");
      } else {
        setModal({ open: true, title: "Download Failed", message: data.error || "Could not download document.", type: "error" });
      }
    } catch (err) {
      console.error("[DocumentCenter] download error:", err);
      setModal({ open: true, title: "Network Error", message: "Network error downloading document.", type: "error" });
    } finally {
      setDownloading(null);
    }
  };

  // ── Helpers ──
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getTypeIcon = (type) => {
    if (type.startsWith("tax")) return "📋";
    if (type === "trade_confirmation") return "📄";
    if (type === "account_statement") return "📊";
    return "📎";
  };

  const getTypeBadgeColor = (type) => {
    if (type.startsWith("tax")) return { bg: "#fef3c7", color: "#92400e", border: "#f59e0b" };
    if (type === "trade_confirmation") return { bg: "#dbeafe", color: "#1e40af", border: "#3b82f6" };
    if (type === "account_statement") return { bg: "#dcfce7", color: "#166534", border: "#22c55e" };
    return { bg: "#f3f4f6", color: "#374151", border: "#9ca3af" };
  };

  // Build available years (current year back to 2024)
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= 2024; y--) {
    years.push(y);
  }

  return (
    <div className="portfolio-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Document Center
      </h2>

      {accountNumber && (
        <p style={{ textAlign: "center", color: "#6b7280", fontSize: "0.85rem", marginTop: "-4px", marginBottom: "16px" }}>
          Brokerage Account: <strong>{accountNumber}</strong>
        </p>
      )}

      {/* ── Filters ── */}
      <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151" }}>
            Filter:
          </label>

          <select
            className="form-input"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ minWidth: 200 }}
          >
            <option value="">All Document Types</option>
            <option value="trade_confirmation">Trade Confirmations</option>
            <option value="account_statement">Monthly Statements</option>
            <option value="tax_1099_b">Tax — 1099-B</option>
            <option value="tax_1099_div">Tax — 1099-DIV</option>
            <option value="tax_1099_int">Tax — 1099-INT</option>
            <option value="tax_w8">Tax — W-8BEN</option>
          </select>

          <select
            className="form-input"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            style={{ minWidth: 120 }}
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {(filterType || filterYear) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setFilterType(""); setFilterYear(""); }}
              style={{ fontSize: "0.85rem" }}
            >
              Clear
            </button>
          )}

          <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "auto" }}>
            {documents.length} document{documents.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "#6b7280" }}>Loading documents…</p>
        </div>
      ) : error ? (
        <div className="card" style={{ textAlign: "center", padding: "1.5rem" }}>
          <p className="error-text">{error}</p>
          <button className="btn-secondary" onClick={loadDocuments} style={{ marginTop: 12 }}>
            Retry
          </button>
        </div>
      ) : documents.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📂</div>
          <p style={{ color: "#6b7280", fontSize: "0.95rem" }}>
            No documents found{filterType || filterYear ? " for the selected filters" : ""}.
          </p>
          <p style={{ color: "#9ca3af", fontSize: "0.8rem", marginTop: 4 }}>
            Trade confirmations appear the day after a trade executes.
            <br />Monthly statements are available after the 1st weekend of the following month.
          </p>
        </div>
      ) : (
        /* ── Document List ── */
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {documents.map((doc) => {
            const badge = getTypeBadgeColor(doc.type);
            const isDownloading = downloading === doc.document_id;

            return (
              <div
                key={doc.document_id}
                className="card"
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  transition: "border-color 0.15s",
                  cursor: "pointer",
                }}
                onClick={() => !isDownloading && handleDownload(doc.document_id, doc.name)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; }}
              >
                {/* Icon */}
                <div style={{ fontSize: "1.5rem", flexShrink: 0 }}>
                  {getTypeIcon(doc.type)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      background: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                      whiteSpace: "nowrap",
                    }}>
                      {doc.type_label}
                    </span>
                    <span style={{ fontSize: "0.85rem", color: "#374151", fontWeight: 500 }}>
                      {formatDate(doc.date)}
                    </span>
                  </div>
                  {doc.name && (
                    <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.name}
                    </div>
                  )}
                </div>

                {/* Download button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDownloading) handleDownload(doc.document_id, doc.name);
                  }}
                  disabled={isDownloading}
                  style={{
                    background: isDownloading ? "#e5e7eb" : "#eff6ff",
                    color: isDownloading ? "#9ca3af" : "#2563eb",
                    border: `1px solid ${isDownloading ? "#d1d5db" : "#bfdbfe"}`,
                    borderRadius: "8px",
                    padding: "6px 14px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: isDownloading ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {isDownloading ? "Opening…" : "📥 Download"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Info note ── */}
      <p className="form-disclosure" style={{ marginTop: 16 }}>
        <strong>Document Delivery:</strong> Trade confirmations are generated the business day after
        your trade executes. Monthly account statements are available after the first weekend of
        the following month. Tax documents (1099-B, 1099-DIV) are available annually in February.
        All documents are generated by Alpaca Securities LLC and delivered in PDF format.
      </p>

      {/* ── Alert Modal ── */}
      {modal.open && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: "16px",
          }}
          onClick={() => setModal((m) => ({ ...m, open: false }))}
        >
          <div
            className="card"
            style={{
              maxWidth: 420, width: "100%",
              border: `2px solid ${modal.type === "error" ? "#ef4444" : "#3b82f6"}`,
              background: "#fff", padding: "1.25rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: "1.5rem" }}>{modal.type === "error" ? "⚠️" : "ℹ️"}</span>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: modal.type === "error" ? "#991b1b" : "#1e40af" }}>
                {modal.title}
              </div>
            </div>
            <p style={{ margin: "0 0 16px 0", color: "#374151", fontSize: "0.9rem" }}>
              {modal.message}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setModal((m) => ({ ...m, open: false }))}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
        <button type="button" className="btn-secondary" onClick={() => navigate("/portfolio")}>
          Back to Portfolio
        </button>
        <button type="button" className="btn-primary" onClick={() => navigate("/wallet")}>
          Back to Wallet
        </button>
      </div>
    </div>
  );
}
