// src/pages/FeeAdmin.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "../api.js";
import ConfirmModal from "../components/ConfirmModal";

/* ── Shared FormRow (matches OrdersAdmin / LedgerAdmin) ── */
function FormRow({ label, children, hint }) {
  return (
    <div className="form-row" style={{ maxWidth: "100%", boxSizing: "border-box", overflow: "hidden" }}>
      {label && <label className="form-label">{label}:</label>}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {children}
        {hint && (
          <span style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 2 }}>{hint}</span>
        )}
      </div>
    </div>
  );
}

/* ── Currency formatter ── */
const fmt$ = (v) =>
  v != null && v !== ""
    ? parseFloat(v).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })
    : "—";

const fmt$4 = (v) =>
  v != null && v !== ""
    ? "$" + parseFloat(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "—";

const fmtN = (v) => Number(v || 0).toLocaleString();

export default function FeeAdmin() {
  // ── State ──
  const [activeTab, setActiveTab] = useState("fees");
  const [fees, setFees] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  // ── Filters ──
  const [filterMerchant, setFilterMerchant] = useState("");
  const [filterActive, setFilterActive] = useState("1"); // "1", "0", ""

  // ── Summary state ──
  const [summary, setSummary] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const editPanelRef = useRef(null);

  // Confirm modal state
  const [modal, setModal] = useState({
    show: false, title: "", message: "", icon: null,
    confirmText: "Confirm", confirmColor: "#007bff", data: null,
  });
  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  // ── Load merchants for dropdown ──
  const loadMerchants = useCallback(async () => {
    try {
      const res = await apiPost("fee_admin.php", { action: "merchants" });
      if (res?.success) setMerchants(res.merchants || []);
    } catch (err) {
      console.error("Failed to load merchants:", err);
    }
  }, []);

  // ── Load fee schedules ──
  const loadFees = useCallback(async () => {
    setLoading(true);
    try {
      const payload = { action: "list" };
      if (filterMerchant) payload.merchant_id = filterMerchant;
      if (filterActive !== "") payload.is_active = parseInt(filterActive, 10);

      const res = await apiPost("fee_admin.php", payload);
      if (res?.success) setFees(res.fees || []);
      else setFees([]);
    } catch (err) {
      console.error("Failed to load fees:", err);
      alert("Failed to load fee schedules.");
      setFees([]);
    } finally {
      setLoading(false);
    }
  }, [filterMerchant, filterActive]);

  // ── Load billing summary ──
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const payload = { action: "summary" };
      if (filterMerchant) payload.merchant_id = filterMerchant;
      const res = await apiPost("fee_admin.php", payload);
      if (res?.success) setSummary(res.summary || []);
      else setSummary([]);
    } catch (err) {
      console.error("Failed to load summary:", err);
      setSummary([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [filterMerchant]);

  // ── Initial load ──
  useEffect(() => {
    loadMerchants();
  }, [loadMerchants]);

  useEffect(() => {
    if (activeTab === "fees") loadFees();
    else if (activeTab === "summary") loadSummary();
  }, [activeTab, loadFees, loadSummary]);

  // ── Edit click ──
  const handleEditClick = (fee) => {
    setSelected({ ...fee });
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // ── New fee schedule ──
  const handleNewFee = () => {
    setSelected({
      id: null,
      merchant_id: filterMerchant || "",
      fee_label: "",
      annual_license_fee: "",
      cost_per_member: "",
      cost_per_basket: "",
      cost_per_order: "",
      cost_per_ach: "",
      billing_cycle: "monthly",
      effective_date: new Date().toISOString().split("T")[0],
      end_date: "",
      is_active: 1,
      notes: "",
    });
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // ── Save ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!selected) return;

    if (!selected.merchant_id) {
      alert("Please select a merchant.");
      return;
    }
    if (!selected.effective_date) {
      alert("Effective date is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await apiPost("fee_admin.php", { action: "save", ...selected });
      if (res?.success) {
        alert(`✅ Fee schedule ${res.action}!`);
        setSelected(null);
        await loadFees();
      } else {
        alert("❌ Save failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("❌ Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Deactivate ──
  const handleDeactivate = (id) => {
    setModal({
      show: true,
      title: "Deactivate Fee Schedule",
      message: "Deactivate this fee schedule? It will remain in history but not be used for billing.",
      confirmText: "Deactivate",
      confirmColor: "#dc2626",
      data: { id },
    });
  };

  const executeDeactivate = async (id) => {
    closeModal();
    try {
      const res = await apiPost("fee_admin.php", { action: "delete", id });
      if (res?.success) {
        await loadFees();
        if (selected?.id === id) setSelected(null);
      } else {
        alert("Deactivate failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      alert("Deactivate failed: " + err.message);
    }
  };

  const handleModalConfirm = () => {
    executeDeactivate(modal.data?.id);
  };

  // ── Group fees by merchant for the table ──
  const groupedFees = useMemo(() => {
    const map = new Map();
    for (const f of fees) {
      const mid = f.merchant_id;
      if (!map.has(mid)) {
        map.set(mid, {
          merchant_id: mid,
          merchant_name: f.merchant_name || mid,
          fees: [],
        });
      }
      map.get(mid).fees.push(f);
    }
    return Array.from(map.values());
  }, [fees]);

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Fee Administration</h1>
      <p className="page-deck">
        Configure pricing per merchant: annual license, per-member, per-basket, per-order, and per-ACH fees.
      </p>

      {/* ── Tabs ── */}
      <div style={{
        display: "flex",
        gap: 0,
        marginBottom: "1rem",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #d1d5db",
      }}>
        {[
          { key: "fees", label: "Fee Schedules" },
          { key: "summary", label: "Billing Summary" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1,
              padding: "8px 16px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              borderLeft: t.key !== "fees" ? "1px solid #d1d5db" : "none",
              cursor: "pointer",
              background: activeTab === t.key ? "#2563eb" : "#f9fafb",
              color: activeTab === t.key ? "#fff" : "#374151",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <label className="form-label">Filter:</label>

          <select
            className="form-input"
            style={{ maxWidth: 280 }}
            value={filterMerchant}
            onChange={(e) => setFilterMerchant(e.target.value)}
          >
            <option value="">All Merchants</option>
            {merchants.map((m) => (
              <option key={m.merchant_id} value={m.merchant_id}>
                {m.merchant_name || m.merchant_id}
              </option>
            ))}
          </select>

          {activeTab === "fees" && (
            <select
              className="form-input"
              style={{ maxWidth: 160 }}
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
            >
              <option value="1">Active Only</option>
              <option value="0">Inactive Only</option>
              <option value="">All</option>
            </select>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (activeTab === "fees") loadFees();
              else loadSummary();
            }}
          >
            Apply
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFilterMerchant("");
              setFilterActive("1");
            }}
          >
            Clear
          </button>

          {activeTab === "fees" && (
            <button
              type="button"
              className="btn-primary"
              style={{ marginLeft: "auto", background: "#10b981" }}
              onClick={handleNewFee}
            >
              + New Fee Schedule
            </button>
          )}
        </div>
      </div>


      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* EDIT PANEL                                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {selected && (
        <div id="feeadmin-edit" className="card" style={{ marginBottom: "1rem", overflowX: "hidden", maxWidth: "100%" }} ref={editPanelRef}>
          <h2 className="subheading" style={{ marginTop: 0 }}>
            {selected.id ? `Edit Fee #${selected.id}` : "New Fee Schedule"}
          </h2>

          <form onSubmit={handleSave} className="form-grid" style={{ maxWidth: "100%", boxSizing: "border-box" }}>
            <style>{`
              #feeadmin-edit .form-input {
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
              }
            `}</style>
            {/* Row 1: Merchant + Label */}
            <FormRow label="Merchant">
              <select
                className="form-input"
                value={selected.merchant_id || ""}
                onChange={(e) => setSelected({ ...selected, merchant_id: e.target.value })}
                required
              >
                <option value="">— Select Merchant —</option>
                {merchants.map((m) => (
                  <option key={m.merchant_id} value={m.merchant_id}>
                    {m.merchant_name || m.merchant_id}
                  </option>
                ))}
              </select>
            </FormRow>

            <FormRow label="Fee Label" hint="Optional name, e.g. '2025 Standard Plan'">
              <input
                type="text"
                className="form-input"
                value={selected.fee_label || ""}
                onChange={(e) => setSelected({ ...selected, fee_label: e.target.value })}
                placeholder="Optional"
              />
            </FormRow>

            {/* Divider */}
            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e5e7eb", margin: "0.5rem 0" }} />

            {/* Fee amounts */}
            <FormRow label="Annual License Fee" hint="Flat annual software license amount">
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={selected.annual_license_fee ?? ""}
                onChange={(e) => setSelected({ ...selected, annual_license_fee: e.target.value })}
                placeholder="Leave blank if N/A"
              />
            </FormRow>

            <FormRow label="Cost Per Member" hint="Charged per active member per billing cycle">
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-input"
                value={selected.cost_per_member ?? ""}
                onChange={(e) => setSelected({ ...selected, cost_per_member: e.target.value })}
                placeholder="e.g. 0.50"
              />
            </FormRow>

            <FormRow label="Cost Per Basket" hint="Charged per basket submitted">
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-input"
                value={selected.cost_per_basket ?? ""}
                onChange={(e) => setSelected({ ...selected, cost_per_basket: e.target.value })}
                placeholder="e.g. 1.00"
              />
            </FormRow>

            <FormRow label="Cost Per Order" hint="Charged per individual order within baskets">
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-input"
                value={selected.cost_per_order ?? ""}
                onChange={(e) => setSelected({ ...selected, cost_per_order: e.target.value })}
                placeholder="e.g. 0.25"
              />
            </FormRow>

            <FormRow label="Cost Per ACH" hint="Charged per ACH payment transaction">
              <input
                type="number"
                step="0.0001"
                min="0"
                className="form-input"
                value={selected.cost_per_ach ?? ""}
                onChange={(e) => setSelected({ ...selected, cost_per_ach: e.target.value })}
                placeholder="e.g. 0.10"
              />
            </FormRow>

            {/* Divider */}
            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e5e7eb", margin: "0.5rem 0" }} />

            {/* Billing + Dates */}
            <FormRow label="Billing Cycle">
              <select
                className="form-input"
                value={selected.billing_cycle || "monthly"}
                onChange={(e) => setSelected({ ...selected, billing_cycle: e.target.value })}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </FormRow>

            <FormRow label="Effective Date">
              <input
                type="date"
                className="form-input"
                value={selected.effective_date || ""}
                onChange={(e) => setSelected({ ...selected, effective_date: e.target.value })}
                required
              />
            </FormRow>

            <FormRow label="End Date" hint="Leave blank for no end date (ongoing)">
              <input
                type="date"
                className="form-input"
                value={selected.end_date || ""}
                onChange={(e) => setSelected({ ...selected, end_date: e.target.value })}
              />
            </FormRow>

            <FormRow label="Active">
              <select
                className="form-input"
                value={String(selected.is_active ?? 1)}
                onChange={(e) => setSelected({ ...selected, is_active: parseInt(e.target.value, 10) })}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </FormRow>

            <FormRow label="Notes">
              <textarea
                className="form-input"
                rows={3}
                value={selected.notes || ""}
                onChange={(e) => setSelected({ ...selected, notes: e.target.value })}
                placeholder="Internal notes..."
                style={{ resize: "vertical" }}
              />
            </FormRow>

            {selected.id && (
              <>
                <FormRow label="Created">
                  <input
                    className="form-input"
                    type="text"
                    value={selected.created_at || "—"}
                    readOnly
                  />
                </FormRow>

                <FormRow label="Updated">
                  <input
                    className="form-input"
                    type="text"
                    value={selected.updated_at || "—"}
                    readOnly
                  />
                </FormRow>
              </>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.25rem", gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : selected.id ? "Save Changes" : "Create Fee Schedule"}
              </button>
              {selected.id && (selected.is_active === "1" || selected.is_active === 1) && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={() => handleDeactivate(selected.id)}
                >
                  Deactivate
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* FEE SCHEDULES TAB                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "fees" && (
        <>
          <h2 className="subheading">Fee Schedules</h2>

          {loading ? (
            <p>Loading...</p>
          ) : fees.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
              No fee schedules found. Click <strong>+ New Fee Schedule</strong> to create one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {groupedFees.map((group) => (
                <div key={group.merchant_id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {/* Merchant header */}
                  <div style={{
                    padding: "10px 16px",
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b" }}>
                        {group.merchant_name}
                      </span>
                      <span style={{
                        fontSize: "0.72rem",
                        color: "#6b7280",
                        background: "#f3f4f6",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}>
                        {group.fees.length} schedule{group.fees.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "monospace" }}>
                      {group.merchant_id}
                    </span>
                  </div>

                  {/* Fee rows */}
                  <div style={{ overflowX: "auto" }}>
                    <table className="basket-table" style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>ID</th>
                          <th>Label</th>
                          <th style={{ textAlign: "right" }}>Annual License</th>
                          <th style={{ textAlign: "right" }}>Per Member</th>
                          <th style={{ textAlign: "right" }}>Per Basket</th>
                          <th style={{ textAlign: "right" }}>Per Order</th>
                          <th style={{ textAlign: "right" }}>Per ACH</th>
                          <th>Cycle</th>
                          <th>Effective</th>
                          <th style={{ textAlign: "center" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.fees.map((f) => (
                          <tr
                            key={f.id}
                            onClick={() => handleEditClick(f)}
                            style={{
                              cursor: "pointer",
                              opacity: f.is_active === "0" || f.is_active === 0 ? 0.5 : 1,
                            }}
                            title="Click to edit"
                          >
                            <td style={{ fontWeight: 500, color: "#6b7280" }}>{f.id}</td>
                            <td style={{ fontWeight: 600 }}>{f.fee_label || "—"}</td>
                            <td style={{ textAlign: "right" }}>{fmt$(f.annual_license_fee)}</td>
                            <td style={{ textAlign: "right" }}>{fmt$4(f.cost_per_member)}</td>
                            <td style={{ textAlign: "right" }}>{fmt$4(f.cost_per_basket)}</td>
                            <td style={{ textAlign: "right" }}>{fmt$4(f.cost_per_order)}</td>
                            <td style={{ textAlign: "right" }}>{fmt$4(f.cost_per_ach)}</td>
                            <td>
                              <span style={{
                                fontSize: "0.75rem",
                                textTransform: "capitalize",
                                color: "#475569",
                              }}>
                                {f.billing_cycle}
                              </span>
                            </td>
                            <td style={{ fontSize: "0.85rem" }}>
                              {f.effective_date || "—"}
                              {f.end_date && (
                                <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}> → {f.end_date}</span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{
                                display: "inline-block",
                                padding: "2px 10px",
                                borderRadius: 999,
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                background: (f.is_active === "1" || f.is_active === 1) ? "#d1fae5" : "#f3f4f6",
                                color: (f.is_active === "1" || f.is_active === 1) ? "#065f46" : "#6b7280",
                              }}>
                                {(f.is_active === "1" || f.is_active === 1) ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}


      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* BILLING SUMMARY TAB                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === "summary" && (
        <>
          <h2 className="subheading">Current Billing Estimate</h2>
          <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1rem" }}>
            Estimated fees for the current billing period based on active fee schedules and live usage counts.
          </p>

          {summaryLoading ? (
            <p>Loading billing summary...</p>
          ) : summary.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
              No active fee schedules found for the current period.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {summary.map((s, idx) => {
                const hasFees = [
                  s.annual_license_fee,
                  s.cost_per_member,
                  s.cost_per_basket,
                  s.cost_per_order,
                  s.cost_per_ach,
                ].some((v) => v != null && v !== "" && parseFloat(v) > 0);

                return (
                  <div key={idx} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    {/* Header */}
                    <div style={{
                      padding: "12px 16px",
                      background: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}>
                      <div>
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b" }}>
                          {s.merchant_name}
                        </span>
                        {s.fee_label && (
                          <span style={{ marginLeft: 10, fontSize: "0.8rem", color: "#6b7280" }}>
                            ({s.fee_label})
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: "1.15rem",
                        fontWeight: 800,
                        color: "#059669",
                        fontFamily: "monospace",
                      }}>
                        {fmt$(s.estimated_fee)}
                      </div>
                    </div>

                    {/* Breakdown */}
                    {hasFees && (
                      <div style={{ padding: "12px 16px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>
                                Fee Type
                              </th>
                              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>
                                Rate
                              </th>
                              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>
                                Count
                              </th>
                              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>
                                Subtotal
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.annual_license_fee > 0 && (
                              <SummaryRow
                                label="Annual Software License"
                                rate={fmt$(s.annual_license_fee) + "/yr"}
                                count={`÷ ${s.billing_cycle === "annually" ? "1" : s.billing_cycle === "quarterly" ? "4" : "12"}`}
                                subtotal={fmt$(
                                  parseFloat(s.annual_license_fee) /
                                    (s.billing_cycle === "annually" ? 1 : s.billing_cycle === "quarterly" ? 4 : 12)
                                )}
                              />
                            )}
                            {s.cost_per_member > 0 && (
                              <SummaryRow
                                label="Cost Per Member"
                                rate={fmt$4(s.cost_per_member) + "/member"}
                                count={fmtN(s.active_members)}
                                subtotal={fmt$(parseFloat(s.cost_per_member) * parseInt(s.active_members))}
                              />
                            )}
                            {s.cost_per_basket > 0 && (
                              <SummaryRow
                                label="Cost Per Basket"
                                rate={fmt$4(s.cost_per_basket) + "/basket"}
                                count={fmtN(s.baskets_this_month)}
                                subtotal={fmt$(parseFloat(s.cost_per_basket) * parseInt(s.baskets_this_month))}
                              />
                            )}
                            {s.cost_per_order > 0 && (
                              <SummaryRow
                                label="Cost Per Order"
                                rate={fmt$4(s.cost_per_order) + "/order"}
                                count={fmtN(s.orders_this_month)}
                                subtotal={fmt$(parseFloat(s.cost_per_order) * parseInt(s.orders_this_month))}
                              />
                            )}
                            {s.cost_per_ach > 0 && (
                              <SummaryRow
                                label="Cost Per ACH Payment"
                                rate={fmt$4(s.cost_per_ach) + "/ACH"}
                                count={fmtN(s.ach_payments_this_month)}
                                subtotal={fmt$(parseFloat(s.cost_per_ach) * parseInt(s.ach_payments_this_month))}
                              />
                            )}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                              <td colSpan={3} style={{ textAlign: "right", padding: "8px", fontWeight: 700, fontSize: "0.85rem" }}>
                                Estimated Total
                              </td>
                              <td style={{ textAlign: "right", padding: "8px", fontWeight: 700, fontSize: "1rem", color: "#059669" }}>
                                {fmt$(s.estimated_fee)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>

                        {/* Usage footnote */}
                        <div style={{
                          marginTop: 10,
                          display: "flex",
                          gap: 16,
                          fontSize: "0.75rem",
                          color: "#94a3b8",
                          flexWrap: "wrap",
                        }}>
                          <span>Billing: {s.billing_cycle}</span>
                          <span>Effective: {s.effective_date}</span>
                          <span>Members: {fmtN(s.active_members)}</span>
                          <span>Baskets (month): {fmtN(s.baskets_this_month)}</span>
                          <span>Orders (month): {fmtN(s.orders_this_month)}</span>
                          <span>ACH (month): {fmtN(s.ach_payments_this_month)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Grand total */}
              {summary.length > 1 && (
                <div className="card" style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: "#f0fdf4",
                  border: "2px solid #10b981",
                }}>
                  <span style={{ fontWeight: 700, fontSize: "1rem", color: "#1e293b" }}>
                    Grand Total (All Merchants)
                  </span>
                  <span style={{ fontWeight: 800, fontSize: "1.25rem", color: "#059669", fontFamily: "monospace" }}>
                    {fmt$(summary.reduce((sum, s) => sum + parseFloat(s.estimated_fee || 0), 0))}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmModal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        icon={modal.icon}
        confirmText={modal.confirmText}
        confirmColor={modal.confirmColor}
        onConfirm={handleModalConfirm}
        onCancel={closeModal}
      />
    </div>
  );
}


/* ── Summary Row sub-component ── */
function SummaryRow({ label, rate, count, subtotal }) {
  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      <td style={{ padding: "6px 8px", fontWeight: 500 }}>{label}</td>
      <td style={{ textAlign: "right", padding: "6px 8px", color: "#475569" }}>{rate}</td>
      <td style={{ textAlign: "right", padding: "6px 8px", color: "#475569" }}>{count}</td>
      <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>{subtotal}</td>
    </tr>
  );
}
