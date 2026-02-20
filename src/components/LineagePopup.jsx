// src/components/LineagePopup.jsx
import React, { useState, useEffect, useCallback } from "react";
import { apiPost } from "../api.js";
import {
  X,
  ShoppingBasket,
  FileText,
  RefreshCw,
  Building2,
  Play,
  CreditCard,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  ClipboardList,
  Package,
} from "lucide-react";

/**
 * LineagePopup — Reusable full lifecycle tracer for StockLoyal pipeline IDs.
 *
 * Usage:
 *   <LineagePopup id="SWP-..." type="sweep" onClose={fn} />
 *   <LineageLink id={row.basket_id} type="basket" />
 *
 * Supported types: order, basket, batch, sweep, broker, exec, ach
 */

// ─── Stage config (display order = pipeline order) ─────────────
const STAGES = [
  { key: "prep",    label: "Batch",   icon: ClipboardList,  color: "#8b5cf6", bg: "#f5f3ff" },
  { key: "staged",  label: "Staged",  icon: Package,        color: "#a855f7", bg: "#faf5ff" },
  { key: "baskets", label: "Baskets", icon: ShoppingBasket, color: "#f59e0b", bg: "#fffbeb" },
  { key: "orders",  label: "Orders",  icon: FileText,       color: "#6366f1", bg: "#eef2ff" },
  { key: "sweep",   label: "Sweep",   icon: RefreshCw,      color: "#10b981", bg: "#ecfdf5" },
  { key: "brokers", label: "Broker",  icon: Building2,      color: "#3b82f6", bg: "#eff6ff" },
  { key: "execs",   label: "Exec",    icon: Play,           color: "#ec4899", bg: "#fdf2f8" },
  { key: "ach",     label: "ACH",     icon: CreditCard,     color: "#059669", bg: "#ecfdf5" },
];

const TYPE_TO_STAGE = {
  batch:  "prep",
  basket: "baskets",
  order:  "orders",
  sweep:  "sweep",
  broker: "brokers",
  exec:   "execs",
  ach:    "ach",
};

// ─── Main popup component ──────────────────────────────────────
export default function LineagePopup({ id, type, onClose }) {
  const [lineage, setLineage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiPost("get-lineage.php", { id, type });
      if (res?.success) {
        setLineage(res.lineage);
      } else {
        setError(res?.error || "Failed to load lineage");
      }
    } catch (e) {
      console.error("[LineagePopup]", e);
      setError("Network error loading lineage");
    } finally {
      setLoading(false);
    }
  }, [id, type]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggleExpand = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeStages = lineage
    ? STAGES.filter((s) => {
        const d = lineage[s.key];
        if (!d) return false;
        if (Array.isArray(d)) return d.length > 0;
        return Object.keys(d).length > 0;
      })
    : [];

  const originStage = TYPE_TO_STAGE[type] || "";

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Pipeline Lineage</h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#6b7280" }}>
              Tracing from <span style={styles.idBadge}>{id}</span>
            </p>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.body}>
          {loading && (
            <div style={styles.center}>
              <RefreshCw size={24} style={{ color: "#6b7280", animation: "spin 1s linear infinite" }} />
              <p style={{ color: "#6b7280", marginTop: "8px" }}>Loading lineage...</p>
            </div>
          )}

          {error && (
            <div style={styles.center}>
              <AlertCircle size={24} color="#ef4444" />
              <p style={{ color: "#ef4444", marginTop: "8px" }}>{error}</p>
            </div>
          )}

          {lineage && !loading && (
            <>
              {/* Visual chain */}
              <div style={styles.chain}>
                {activeStages.map((stage, idx) => {
                  const isOrigin = stage.key === originStage;
                  const Icon = stage.icon;
                  const data = lineage[stage.key];
                  const count = Array.isArray(data) ? data.length : 1;

                  return (
                    <React.Fragment key={stage.key}>
                      {idx > 0 && <div style={styles.connector} />}
                      <div
                        style={{
                          ...styles.stageNode,
                          backgroundColor: stage.bg,
                          borderColor: isOrigin ? stage.color : "#e5e7eb",
                          borderWidth: isOrigin ? "2px" : "1px",
                          boxShadow: isOrigin ? `0 0 0 3px ${stage.color}22` : "none",
                        }}
                      >
                        <Icon size={16} color={stage.color} />
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: stage.color }}>
                          {stage.label}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                          {count > 1 ? `${count}` : "1"}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Detail sections */}
              <div style={styles.details}>
                {activeStages.map((stage) => (
                  <StageDetail
                    key={stage.key}
                    stage={stage}
                    data={lineage[stage.key]}
                    isOrigin={stage.key === originStage}
                    expanded={expanded[stage.key] ?? (stage.key === originStage)}
                    onToggle={() => toggleExpand(stage.key)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail section per stage ──────────────────────────────────
function StageDetail({ stage, data, isOrigin, expanded, onToggle }) {
  const Icon = stage.icon;
  const items = Array.isArray(data) ? data : [data];

  return (
    <div style={{ marginBottom: "8px" }}>
      <button onClick={onToggle} style={styles.sectionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Icon size={14} color={stage.color} />
          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{stage.label}</span>
          <span style={{
            fontSize: "0.7rem", backgroundColor: stage.color, color: "white",
            padding: "1px 6px", borderRadius: "8px", fontWeight: 600,
          }}>
            {items.length}
          </span>
        </div>
        {isOrigin && (
          <span style={{
            fontSize: "0.65rem", backgroundColor: stage.color, color: "white",
            padding: "2px 8px", borderRadius: "4px", fontWeight: 600,
          }}>
            ORIGIN
          </span>
        )}
      </button>

      {expanded && (
        <div style={styles.sectionBody}>
          {stage.key === "prep" && items.map((d, i) => <BatchRow key={i} data={d} />)}
          {stage.key === "staged" && <StagedTable rows={items} />}
          {stage.key === "baskets" && items.map((b, i) => <BasketRow key={i} data={b} />)}
          {stage.key === "orders" && <OrdersTable orders={items} />}
          {stage.key === "sweep" && items.map((s, i) => <SweepRow key={i} data={s} />)}
          {stage.key === "brokers" && items.map((b, i) => <BrokerRow key={i} data={b} />)}
          {stage.key === "execs" && items.map((e, i) => <ExecRow key={i} data={e} />)}
          {stage.key === "ach" && items.map((a, i) => <AchRow key={i} data={a} />)}
        </div>
      )}
    </div>
  );
}

// ─── Row renderers ─────────────────────────────────────────────

function BatchRow({ data }) {
  return (
    <div style={styles.detailCard}>
      <div style={styles.kvRow}>
        <KV label="Batch ID" value={data.batch_id} mono />
        <KV label="Status" value={data.status} />
        <KV label="Created" value={fmtDate(data.created_at)} />
        <KV label="Approved" value={fmtDate(data.approved_at)} />
      </div>
      <div style={styles.kvRow}>
        <KV label="Members" value={data.total_members} />
        <KV label="Orders" value={data.total_orders} />
        <KV label="Amount" value={fmtDollars(data.total_amount)} />
        <KV label="Points" value={fmtN(data.total_points)} />
      </div>
    </div>
  );
}

function StagedTable({ rows }) {
  if (!rows.length) return <p style={{ color: "#6b7280", fontSize: "0.8rem" }}>No staged orders</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Basket</th>
            <th style={styles.th}>Member</th>
            <th style={styles.th}>Merchant</th>
            <th style={styles.th}>Broker</th>
            <th style={styles.th}>Orders</th>
            <th style={styles.th}>Amount</th>
            <th style={styles.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...styles.td, ...styles.mono, fontSize: "0.7rem" }}>{r.basket_id}</td>
              <td style={styles.td}>{r.member_id}</td>
              <td style={styles.td}>{r.merchant_id}</td>
              <td style={styles.td}>{r.broker}</td>
              <td style={styles.td}>{r.order_count}</td>
              <td style={styles.td}>{fmtDollars(r.total_amount)}</td>
              <td style={styles.td}><StatusPill status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BasketRow({ data }) {
  return (
    <div style={styles.detailCard}>
      <div style={styles.kvRow}>
        <KV label="Basket ID" value={data.basket_id} mono />
        <KV label="Batch" value={data.batch_id} mono />
        <KV label="Member" value={data.member_id} />
      </div>
      <div style={styles.kvRow}>
        <KV label="Merchant" value={data.merchant_id} />
        <KV label="Broker" value={data.broker} />
        <KV label="Orders" value={data.order_count} />
        <KV label="Total" value={fmtDollars(data.total_amount)} />
      </div>
    </div>
  );
}

function OrdersTable({ orders }) {
  if (!orders.length) return <p style={{ color: "#6b7280", fontSize: "0.8rem" }}>No orders</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>ID</th>
            <th style={styles.th}>Symbol</th>
            <th style={styles.th}>Amount</th>
            <th style={styles.th}>Shares</th>
            <th style={styles.th}>Exec$</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Basket</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.order_id}>
              <td style={styles.td}>{o.order_id}</td>
              <td style={{ ...styles.td, fontWeight: 600 }}>{o.symbol}</td>
              <td style={styles.td}>{fmtDollars(o.amount)}</td>
              <td style={styles.td}>{o.shares ?? "-"}</td>
              <td style={styles.td}>{o.executed_amount ? fmtDollars(o.executed_amount) : "-"}</td>
              <td style={styles.td}><StatusPill status={o.status} /></td>
              <td style={{ ...styles.td, ...styles.mono, fontSize: "0.7rem" }}>{o.basket_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SweepRow({ data }) {
  return (
    <div style={styles.detailCard}>
      <div style={styles.kvRow}>
        <KV label="Sweep Batch" value={data.batch_id} mono />
        <KV label="Started" value={fmtDate(data.started_at)} />
        <KV label="Duration" value={data.duration_seconds != null ? `${data.duration_seconds}s` : "-"} />
      </div>
      <div style={styles.kvRow}>
        <KV label="Processed" value={data.orders_processed} />
        <KV label="Confirmed" value={data.orders_confirmed} />
        <KV label="Failed" value={data.orders_failed} />
        <KV label="Merchants" value={data.merchants_processed} />
      </div>
    </div>
  );
}

function BrokerRow({ data }) {
  return (
    <div style={styles.detailCard}>
      <div style={styles.kvRow}>
        <KV label="Broker" value={data.broker_name || data.broker_id} />
        <KV label="Event" value={data.event_type} />
        <KV label="Status" value={data.status} />
        <KV label="HTTP" value={data.response_code} />
      </div>
      <div style={styles.kvRow}>
        <KV label="Broker Ref" value={data.broker_ref} mono />
        <KV label="Acknowledged" value={data.acknowledged ? "Yes" : "No"} />
        <KV label="Ack At" value={fmtDate(data.acknowledged_at)} />
        <KV label="Orders" value={data.order_count || "-"} />
      </div>
    </div>
  );
}

function ExecRow({ data }) {
  return (
    <div style={styles.detailCard}>
      <div style={styles.kvRow}>
        <KV label="Exec ID" value={data.exec_id} mono />
        <KV label="Broker" value={data.broker_name || data.broker_id} />
        <KV label="Event" value={data.event_type} />
        <KV label="HTTP" value={data.response_code} />
      </div>
      <div style={styles.kvRow}>
        <KV label="Acknowledged" value={data.acknowledged ? "Yes" : "No"} />
        <KV label="Ack At" value={fmtDate(data.acknowledged_at)} />
        <KV label="Amount" value={data.total_amount ? fmtDollars(data.total_amount) : "-"} />
        <KV label="Created" value={fmtDate(data.created_at)} />
      </div>
    </div>
  );
}

function AchRow({ data }) {
  return (
    <div style={styles.detailCard}>
      <div style={styles.kvRow}>
        <KV label="Payment Batch" value={data.paid_batch_id} mono />
        <KV label="Orders" value={data.order_count} />
        <KV label="Total" value={fmtDollars(data.total_amount)} />
        <KV label="Paid At" value={fmtDate(data.paid_at)} />
      </div>
      {data.files?.length > 0 && (
        <div style={{ marginTop: "6px" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280" }}>Files: </span>
          {data.files.map((f) => (
            <span key={f.file_id} style={{
              fontSize: "0.7rem", backgroundColor: "#f3f4f6", padding: "2px 6px",
              borderRadius: "4px", marginRight: "4px",
            }}>
              {f.filename}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared small components ───────────────────────────────────

function KV({ label, value, mono }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: "0.65rem", color: "#9ca3af", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {label}
      </div>
      <div style={{
        fontSize: "0.8rem", fontWeight: 500, color: "#111827",
        ...(mono ? styles.mono : {}),
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const s = (status || "").toLowerCase();
  const cfg = {
    staged:    { bg: "#f5f3ff", color: "#7c3aed" },
    approved:  { bg: "#dbeafe", color: "#1e40af" },
    discarded: { bg: "#fee2e2", color: "#991b1b" },
    pending:   { bg: "#fef3c7", color: "#92400e" },
    placed:    { bg: "#dcfce7", color: "#166534" },
    confirmed: { bg: "#dbeafe", color: "#1e40af" },
    executed:  { bg: "#d1fae5", color: "#065f46" },
    settled:   { bg: "#e0e7ff", color: "#3730a3" },
    sell:      { bg: "#fef3c7", color: "#92400e" },
    sold:      { bg: "#dbeafe", color: "#1e40af" },
    failed:    { bg: "#fee2e2", color: "#991b1b" },
    cancelled: { bg: "#fee2e2", color: "#991b1b" },
  }[s] || { bg: "#f3f4f6", color: "#6b7280" };

  return (
    <span style={{
      padding: "1px 6px", borderRadius: "4px", fontSize: "0.7rem",
      fontWeight: 600, backgroundColor: cfg.bg, color: cfg.color,
    }}>
      {status || "-"}
    </span>
  );
}

// ─── LineageLink — inline clickable ID ─────────────────────────
export function LineageLink({ id, type, children }) {
  const [show, setShow] = useState(false);

  if (!id) return <span>{children || "-"}</span>;

  return (
    <>
      <span
        onClick={(e) => { e.stopPropagation(); setShow(true); }}
        style={styles.link}
        title={`View lineage for ${id}`}
      >
        {children || id}
      </span>
      {show && <LineagePopup id={String(id)} type={type} onClose={() => setShow(false)} />}
    </>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function fmtDollars(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtDate(val) {
  if (!val) return "-";
  return new Date(val).toLocaleString();
}

function fmtN(val) {
  const n = parseInt(val);
  if (isNaN(n)) return "-";
  return n.toLocaleString();
}

// ─── Styles ────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px",
  },
  modal: {
    backgroundColor: "white", borderRadius: "12px",
    width: "100%", maxWidth: "780px", maxHeight: "85vh",
    display: "flex", flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 20px", borderBottom: "1px solid #e5e7eb",
  },
  closeBtn: {
    background: "none", border: "none", cursor: "pointer",
    padding: "4px", color: "#6b7280", borderRadius: "4px",
  },
  body: {
    padding: "16px 20px", overflowY: "auto", flex: 1,
  },
  center: {
    textAlign: "center", padding: "32px",
  },
  idBadge: {
    fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 600,
    backgroundColor: "#f3f4f6", padding: "2px 8px", borderRadius: "4px",
  },
  chain: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: "0", padding: "12px 0 20px", flexWrap: "wrap",
  },
  connector: {
    width: "20px", height: "2px", backgroundColor: "#d1d5db",
    flexShrink: 0,
  },
  stageNode: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "2px", padding: "8px 12px", borderRadius: "8px",
    borderStyle: "solid", minWidth: "64px", flexShrink: 0,
  },
  details: {
    borderTop: "1px solid #f3f4f6", paddingTop: "12px",
  },
  sectionHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "8px 10px", background: "none",
    border: "1px solid #e5e7eb", borderRadius: "6px",
    cursor: "pointer", marginBottom: "4px",
  },
  sectionBody: {
    padding: "4px 0 8px 24px",
  },
  detailCard: {
    padding: "8px 12px", backgroundColor: "#fafafa",
    borderRadius: "6px", marginBottom: "6px",
    border: "1px solid #f3f4f6",
  },
  kvRow: {
    display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "4px",
  },
  table: {
    width: "100%", borderCollapse: "collapse", fontSize: "0.8rem",
  },
  th: {
    textAlign: "left", padding: "6px 8px", fontSize: "0.7rem",
    fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #e5e7eb",
    textTransform: "uppercase", letterSpacing: "0.03em",
  },
  td: {
    padding: "5px 8px", borderBottom: "1px solid #f3f4f6",
    fontSize: "0.8rem",
  },
  mono: {
    fontFamily: "monospace",
  },
  link: {
    color: "#3b82f6", cursor: "pointer", textDecoration: "underline",
    textDecorationStyle: "dotted", textUnderlineOffset: "2px",
    fontFamily: "monospace", fontSize: "inherit",
  },
};
