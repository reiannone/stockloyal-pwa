// src/pages/Admin.jsx
import React, { useEffect, useState, useRef } from "react";
import { apiGet, apiPost } from "../api.js";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";

// ✅ Custom upload adapter for CKEditor images
class MyUploadAdapter {
  constructor(loader) {
    this.loader = loader;
  }

  upload() {
    return this.loader.file.then(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();

          reader.onload = () => {
            // Convert image to base64 data URI
            resolve({
              default: reader.result,
            });
          };

          reader.onerror = (error) => {
            reject(error);
          };

          reader.readAsDataURL(file);
        })
    );
  }

  abort() {
    // Reject promise on abort
  }
}

// Plugin to use the custom adapter
function MyCustomUploadAdapterPlugin(editor) {
  editor.plugins.get("FileRepository").createUploadAdapter = (loader) => {
    return new MyUploadAdapter(loader);
  };
}

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

      <div className="card" style={{ overflowX: "hidden", maxWidth: "100%" }}>
        {selected ? (
          <form onSubmit={saveMerchant} className="form-grid" style={{ maxWidth: "100%" }}>
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

            {/* ✅ Webhook Configuration Section */}
            <div style={{ 
              gridColumn: '1 / -1', 
              marginTop: '1rem', 
              marginBottom: '0.5rem',
              padding: '0.75rem 1rem',
              background: '#fffbeb',
              borderRadius: '6px',
              border: '1px solid #fbbf24'
            }}>
              <h4 style={{ 
                margin: '0 0 0.5rem 0', 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: '#92400e',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🔔 Webhook Configuration
              </h4>
              <p style={{ 
                margin: 0, 
                fontSize: '0.75rem', 
                color: '#78350f',
                lineHeight: 1.4
              }}>
                Configure webhook endpoint to receive real-time notifications when members redeem points.
              </p>
            </div>

            <FormRow label="Webhook URL">
              <input
                className="form-input"
                type="url"
                name="webhook_url"
                value={selected?.webhook_url || ""}
                onChange={handleChange}
                placeholder="https://merchant.com/api/stockloyal/webhook"
                style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
              />
            </FormRow>

            <FormRow label="API Key">
              <input
                className="form-input"
                type="text"
                name="api_key"
                value={selected?.api_key || ""}
                onChange={handleChange}
                placeholder="sk_live_..."
                style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
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

            {/* ✅ Tier Management Section */}
            <div style={{ 
              gridColumn: '1 / -1', 
              marginTop: '1.5rem', 
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                fontSize: '1.1rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#111827'
              }}>
                Merchant Tiers (Up to 6)
              </h3>
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#6b7280', 
                marginBottom: '1rem' 
              }}>
                Configure tiered conversion rates based on member points. Members automatically advance to higher tiers as they accumulate points.
              </p>

              {[1, 2, 3, 4, 5, 6].map((tierNum) => (
                <div key={tierNum} style={{ 
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h4 style={{ 
                    fontSize: '0.95rem', 
                    fontWeight: '600', 
                    marginBottom: '0.75rem',
                    color: '#374151'
                  }}>
                    Tier {tierNum}
                  </h4>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.75rem'
                  }}>
                    <div>
                      <label style={{ 
                        fontSize: '0.75rem', 
                        color: '#6b7280',
                        display: 'block',
                        marginBottom: '0.25rem'
                      }}>
                        Tier Name
                      </label>
                      <input
                        className="form-input"
                        type="text"
                        name={`tier${tierNum}_name`}
                        value={selected?.[`tier${tierNum}_name`] || ""}
                        onChange={handleChange}
                        placeholder={`e.g., ${['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Elite'][tierNum - 1]}`}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        fontSize: '0.75rem', 
                        color: '#6b7280',
                        display: 'block',
                        marginBottom: '0.25rem'
                      }}>
                        Min Points Required
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        name={`tier${tierNum}_min_points`}
                        value={selected?.[`tier${tierNum}_min_points`] ?? ""}
                        onChange={handleChange}
                        placeholder="0"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        fontSize: '0.75rem', 
                        color: '#6b7280',
                        display: 'block',
                        marginBottom: '0.25rem'
                      }}>
                        Conversion Rate
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        step="0.0001"
                        name={`tier${tierNum}_conversion_rate`}
                        value={selected?.[`tier${tierNum}_conversion_rate`] ?? ""}
                        onChange={handleChange}
                        placeholder="0.01"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

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
                config={{
                  placeholder: "Enter promotion text here...",
                  // ✅ Enable image upload plugin
                  extraPlugins: [MyCustomUploadAdapterPlugin],
                  // ✅ Add image toolbar options
                  toolbar: {
                    items: [
                      'heading',
                      '|',
                      'bold',
                      'italic',
                      'link',
                      'bulletedList',
                      'numberedList',
                      '|',
                      'imageUpload',
                      'blockQuote',
                      'insertTable',
                      'mediaEmbed',
                      '|',
                      'undo',
                      'redo'
                    ]
                  },
                  // ✅ Image configuration
                  image: {
                    toolbar: [
                      'imageTextAlternative',
                      'imageStyle:inline',
                      'imageStyle:block',
                      'imageStyle:side',
                      '|',
                      'toggleImageCaption',
                      'linkImage'
                    ]
                  }
                }}
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
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
                <th>Merchant ID</th>
                <th>Name</th>
                <th>Base Rate</th>
                <th>Tiers Configured</th>
                <th>Status</th>
                <th>Promotion</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => {
                // Count how many tiers are configured
                const tiersConfigured = [1, 2, 3, 4, 5, 6].filter(
                  (num) => m[`tier${num}_name`] && m[`tier${num}_name`].trim() !== ''
                ).length;

                return (
                  <tr 
                    key={m.merchant_id}
                    onClick={() => {
                      setSelected({ ...m });
                      originalRateRef.current = Number(m.conversion_rate ?? 0);
                      // Scroll to top of page - multiple methods for compatibility
                      const container = document.getElementById('admin-container');
                      if (container) {
                        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      document.documentElement.scrollTop = 0;
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Click to edit this merchant"
                  >
                    <td>{m.merchant_id}</td>
                    <td>{m.merchant_name}</td>
                    <td>{m.conversion_rate || '0.01'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {tiersConfigured > 0 ? (
                        <span style={{
                          background: '#dbeafe',
                          color: '#1e40af',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.85rem',
                          fontWeight: '600'
                        }}>
                          {tiersConfigured} tier{tiersConfigured !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>None</span>
                      )}
                    </td>
                    <td>{m.active_status ? "Active" : "Inactive"}</td>
                    <td>{m.promotion_active ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
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
    <div className="form-row" style={{ maxWidth: "100%", boxSizing: "border-box" }}>
      {label && <label className="form-label">{label}:</label>}
      <div style={{ maxWidth: "100%", boxSizing: "border-box" }}>
        {children}
      </div>
    </div>
  );
}
