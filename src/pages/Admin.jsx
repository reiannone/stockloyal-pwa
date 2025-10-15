// src/pages/Admin.jsx
import React, { useEffect, useState, useRef } from "react";
import { apiGet, apiPost } from "../api.js";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";

export default function Admin() {
  const [merchants, setMerchants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  // Track the original (pre-edit) conversion rate to detect changes on save
  const originalRateRef = useRef(null);

  // Load all merchants
  const fetchMerchants = async () => {
    setLoading(true);
    try {
      const data = await apiGet("get-merchants.php");
      if (data?.success) {
        setMerchants(data.merchants || []);
        let next = selected;

        if (!next && data.merchants.length > 0) {
          next = { ...data.merchants[0] };
        } else if (next) {
          // refresh the selected from the list if it exists
          const ref = data.merchants.find(
            (m) => String(m.merchant_id) === String(next.merchant_id)
          );
          if (ref) next = { ...ref };
        }

        if (next) {
          setSelected(next);
          originalRateRef.current = Number(next.conversion_rate ?? 0);
        }
      } else {
        console.warn("[Admin] get-merchants error:", data?.error);
      }
    } catch (e) {
      console.error("[Admin] get-merchants failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMerchants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save merchant (upsert by merchant_id)
  const saveMerchant = async (e) => {
    e.preventDefault();
    if (!selected) return;

    const prevRate = Number(originalRateRef.current ?? 0);
    const newRate = Number(selected.conversion_rate ?? 0);
    const rateChanged =
      Number.isFinite(prevRate) && Number.isFinite(newRate) && prevRate !== newRate;

    const res = await apiPost("save-merchant.php", selected);
    if (!res?.success) {
      alert("Save failed: " + (res?.error || "Unknown error"));
      return;
    }

    // Refresh list and keep focus on the saved one
    const data = await apiGet("get-merchants.php").catch(() => null);
    if (data?.success) {
      setMerchants(data.merchants || []);
      const current = (data.merchants || []).find(
        (m) => String(m.merchant_id) === String(selected.merchant_id)
      );
      setSelected(current || data.merchants?.[0] || null);
      if (current) {
        originalRateRef.current = Number(current.conversion_rate ?? 0);
      }
    }

    // If conversion rate changed, ask to bulk update wallets
    if (rateChanged) {
      const ok = window.confirm(
        `Conversion rate changed from ${prevRate} to ${newRate}.\n\n` +
          `Update ALL wallets for merchant "${selected.merchant_id}" to use the new conversion rate ` +
          `and recalculate cash balances?`
      );
      if (ok) {
        try {
          const j = await apiPost("bulk-refresh-points.php", {
            merchant_id: selected.merchant_id,
            // We’re NOT overlaying points here; we’re changing the rate & cash only
            conversion_rate: newRate,
            recalc_cash: true,
            requested_by: "AdminRateChange",
          });
          if (!j?.success) throw new Error(j?.error || "Bulk wallet rate/cash update failed");
          alert(
            `Wallets updated for merchant ${selected.merchant_id}.\n` +
              `Updated: ${j.updated}\n` +
              (j.points_overlay_applied
                ? `Points overlay applied to ${j.points_overlay_applied} wallet(s)\n`
                : "") +
              `New rate: ${newRate}`
          );
        } catch (err) {
          alert(`Bulk wallet update error: ${err.message || err}`);
        }
      }
    }

    alert("Merchant saved!");
  };

  // Delete merchant
  const deleteMerchant = async (merchant_id) => {
    if (!window.confirm("Delete this merchant?")) return;
    try {
      const res = await apiPost("delete-merchant.php", { merchant_id });
      if (res?.success) {
        alert("Deleted");
        const updated = merchants.filter(
          (m) => String(m.merchant_id) !== String(merchant_id)
        );
        setMerchants(updated);
        setSelected(updated[0] || null);
        if (updated[0]) {
          originalRateRef.current = Number(updated[0].conversion_rate ?? 0);
        }
      } else {
        alert("Delete failed: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error("[Admin] delete-merchant failed:", e);
      alert("Delete failed: network/server error");
    }
  };

  // Handle form input
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSelected((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (checked ? 1 : 0) : value,
    }));
  };

  return (
    <div id="admin-container" className="app-container app-content">
      <h1 className="page-title">Merchant Admin</h1>
      <p className="page-deck">
        This page is used for administrative purposes to manage Merchant related data.
      </p>

      <div className="card">
        {selected ? (
          <form onSubmit={saveMerchant} className="form-grid">
            <FormRow label="Merchant ID">
              <input
                className="form-input"
                type="text"
                name="merchant_id"
                value={selected?.merchant_id || ""}
                onChange={handleChange}
                required
              />
            </FormRow>

            <FormRow label="Merchant Name">
              <input
                className="form-input"
                type="text"
                name="merchant_name"
                value={selected?.merchant_name || ""}
                onChange={handleChange}
                required
              />
            </FormRow>

            <FormRow label="Program Name">
              <input
                className="form-input"
                type="text"
                name="program_name"
                value={selected?.program_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Contact Email">
              <input
                className="form-input"
                type="email"
                name="contact_email"
                value={selected?.contact_email || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Contact Phone">
              <input
                className="form-input"
                type="text"
                name="contact_phone"
                value={selected?.contact_phone || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Website URL">
              <input
                className="form-input"
                type="url"
                name="website_url"
                value={selected?.website_url || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Conversion Rate">
              <input
                className="form-input"
                type="number"
                step="0.0001"
                name="conversion_rate"
                value={selected?.conversion_rate ?? "0.01"}
                onChange={handleChange}
              />
            </FormRow>

            {/* Promotion Text */}
            <div
              className="form-row"
              style={{ flexDirection: "column", alignItems: "stretch", marginBottom: "1rem" }}
            >
              <label className="wysiwyg-label" style={{ marginBottom: "0.25rem", textAlign: "left" }}>
                Promotion Text:
              </label>
              <CKEditor
                editor={ClassicEditor}
                data={selected?.promotion_text || ""}
                onChange={(event, editor) => {
                  const data = editor.getData();
                  setSelected((prev) => ({ ...prev, promotion_text: data }));
                }}
                config={{ placeholder: "Enter promotion text here..." }}
              />
            </div>

            <FormRow label="Promotion Active">
              <input
                type="checkbox"
                name="promotion_active"
                checked={!!selected?.promotion_active}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Merchant Active">
              <input
                type="checkbox"
                name="active_status"
                checked={!!selected?.active_status}
                onChange={handleChange}
              />
            </FormRow>

            <div className="card-actions">
              <button type="submit" className="btn-primary">Save Merchant</button>
              {selected?.merchant_id && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={() => deleteMerchant(selected.merchant_id)}
                >
                  Delete Merchant
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="body-text">Select a merchant from the table below to edit.</p>
        )}
      </div>

      {/* Merchant Records Table */}
      <h2 className="subheading">Merchant Records</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card">
          <table className="basket-table">
            <thead>
              <tr>
                <th>Merchant ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Promotion Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.merchant_id}>
                  <td>{m.merchant_id}</td>
                  <td>{m.merchant_name}</td>
                  <td>{m.active_status ? "Active" : "Inactive"}</td>
                  <td>{m.promotion_active ? "Yes" : "No"}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setSelected({ ...m });
                        originalRateRef.current = Number(m.conversion_rate ?? 0);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Helper form row
function FormRow({ label, children }) {
  return (
    <div className="form-row">
      {label && <label className="form-label">{label}:</label>}
      {children}
    </div>
  );
}
