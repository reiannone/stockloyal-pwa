// src/pages/Transactions.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function Transactions() {
  const navigate = useNavigate();
  const memberId = localStorage.getItem("memberId");

  const [orders, setOrders] = useState([]);
  const [memberTimezone, setMemberTimezone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ StockPicker-style bottom sheet state
  const [isTxOpen, setIsTxOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

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
        // Fetch orders + wallet (for timezone) in parallel
        const [ordersRes, walletRes] = await Promise.all([
          apiPost("get_order_history.php", { member_id: memberId }),
          apiPost("get-wallet.php", { member_id: memberId }),
        ]);

        if (!ordersRes?.success) {
          setError(ordersRes?.error || "Failed to load transactions.");
        } else {
          setOrders(ordersRes.orders || []);
        }

        const tz =
          walletRes?.success &&
          walletRes?.wallet?.member_timezone &&
          String(walletRes.wallet.member_timezone).trim() !== ""
            ? walletRes.wallet.member_timezone
            : detectedTz;

        setMemberTimezone(tz);
      } catch (err) {
        console.error("Transactions fetch error:", err);
        setError("Network error while fetching transactions.");
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

  // ✅ Open / close (StockPicker pattern)
  const openTx = (order) => {
    setSelectedTx(order);
    setIsTxOpen(true);
  };

  const closeTx = () => {
    setIsTxOpen(false);
    // optional: clear after animation
    setTimeout(() => setSelectedTx(null), 180);
  };

  return (
    <div className="transactions-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        Transaction History
      </h2>

      <p className="subtext" style={{ textAlign: "center", marginTop: -6, marginBottom: 12 }}>
        Showing times in <strong>{memberTimezone || detectedTz}</strong>
      </p>

      {loading ? (
        <p>Loading your transactions...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : orders.length === 0 ? (
        <p className="portfolio-subtext" style={{ textAlign: "center" }}>
          No transactions found.
        </p>
      ) : (
        <div className="basket-table-wrapper" style={{ overflowX: "auto" }}>
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
                <th>Symbol</th>
                <th>Shares</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ width: "140px" }}>Order / Status</th>
                <th>Placed (Local)</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((order, idx) => (
                <tr
                  key={idx}
                  onClick={() => openTx(order)}
                  style={{ cursor: "pointer" }}
                  title="Click to view details"
                >
                  <td>{order.symbol}</td>
                  <td>{order.shares}</td>
                  <td style={{ textAlign: "right" }}>
                    {order.amount ? formatDollars(order.amount) : "-"}
                  </td>

                  <td style={{ textAlign: "center", lineHeight: "1.3" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ fontWeight: "600", color: "#1e3a8a", fontSize: "0.9rem" }}>
                        {order.order_type || "-"}
                      </span>
                      <span
                        style={{
                          fontSize: "0.85rem",
                          color:
                            order.status === "executed"
                              ? "#16a34a"
                              : order.status === "failed"
                              ? "#dc2626"
                              : order.status === "pending"
                              ? "#ca8a04"
                              : "#6b7280",
                        }}
                      >
                        {order.status || "-"}
                      </span>
                    </div>
                  </td>

                  <td style={{ fontSize: "0.9rem" }}>
                    {order.placed_at ? toLocalZonedString(order.placed_at) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ✅ StockPicker-style bottom-sheet for transaction detail */}
      {isTxOpen && selectedTx && (
        <div className="stocklist-overlay" onClick={closeTx}>
          <div className="stocklist-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="stocklist-sheet-header">
              <div className="stocklist-sheet-handle" />
              <div className="stocklist-sheet-title-row">
                <h2 className="stocklist-heading">Transaction Details</h2>
                <button type="button" className="stocklist-close-btn" onClick={closeTx}>
                  ✕
                </button>
              </div>
            </div>

            <div className="stocklist-sheet-content">
              <div style={{ display: "grid", gap: 10 }}>
                <Row label="Symbol" value={selectedTx.symbol || "-"} />
                <Row label="Shares" value={selectedTx.shares ?? "-"} />
                <Row
                  label="Amount"
                  value={selectedTx.amount ? formatDollars(selectedTx.amount) : "-"}
                />
                <Row label="Order Type" value={selectedTx.order_type || "-"} />
                <Row label="Status" value={selectedTx.status || "-"} />
                <Row
                  label="Placed (Local)"
                  value={selectedTx.placed_at ? toLocalZonedString(selectedTx.placed_at) : "-"}
                />

                {/* Optional fields if your API returns them */}
                {"order_id" in selectedTx && <Row label="Order ID" value={selectedTx.order_id || "-"} />}
                {"basket_id" in selectedTx && <Row label="Basket ID" value={selectedTx.basket_id || "-"} />}
                {"broker" in selectedTx && <Row label="Broker" value={selectedTx.broker || "-"} />}
                {"merchant_id" in selectedTx && (
                  <Row label="Merchant" value={selectedTx.merchant_id || "-"} />
                )}
              </div>
            </div>

            <div className="stocklist-sheet-footer">
              <button type="button" className="btn-secondary" style={{ width: "100%" }} onClick={closeTx}>
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
          onClick={() => navigate("/portfolio")}
          style={{ width: "90%", maxWidth: "320px" }}
        >
          View StockLoyal Portfolio
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

// small helper component (keeps the detail view clean)
function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <div style={{ color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 700, textAlign: "right" }}>{String(value)}</div>
    </div>
  );
}
