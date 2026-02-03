// src/pages/Admin.jsx
import React, { useEffect, useState, useRef } from "react";
import { apiGet, apiPost } from "../api.js";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import { Upload, X, Image } from "lucide-react";

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

  // ✅ Broker management state
  const [allBrokers, setAllBrokers] = useState([]);
  const [assignedBrokers, setAssignedBrokers] = useState([]);
  const [brokersLoading, setBrokersLoading] = useState(false);

  // Track the original (pre-edit) conversion rate to detect changes on save
  const originalRateRef = useRef(null);

  // ✅ Logo upload state (same pattern as AdminBroker.jsx)
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const fileInputRef = useRef(null);

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

  // ✅ Load all available brokers (once on mount)
  const fetchAllBrokers = async () => {
    try {
      const data = await apiGet("get-brokers.php");
      if (data?.success) {
        setAllBrokers(data.brokers || []);
      }
    } catch (e) {
      console.error("[Admin] get-brokers failed:", e);
    }
  };

  // ✅ Load brokers assigned to selected merchant
  const fetchMerchantBrokers = async (merchantId) => {
    if (!merchantId) {
      setAssignedBrokers([]);
      return;
    }
    setBrokersLoading(true);
    try {
      const data = await apiPost("get-merchant-brokers.php", { merchant_id: merchantId });
      if (data?.success) {
        setAssignedBrokers(data.broker_ids || []);
      } else {
        setAssignedBrokers([]);
      }
    } catch (e) {
      console.error("[Admin] get-merchant-brokers failed:", e);
      setAssignedBrokers([]);
    } finally {
      setBrokersLoading(false);
    }
  };

  // ✅ Save broker assignments for merchant
  const saveMerchantBrokers = async () => {
    if (!selected?.merchant_id) return;
    
    try {
      const res = await apiPost("save-merchant-brokers.php", {
        merchant_id: selected.merchant_id,
        broker_ids: assignedBrokers,
      });
      if (res?.success) {
        alert(`Broker assignments saved for ${selected.merchant_name}!`);
      } else {
        alert("Failed to save broker assignments: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error("[Admin] save-merchant-brokers failed:", e);
      alert("Failed to save broker assignments: network error");
    }
  };

  // ✅ Toggle broker assignment
  const toggleBroker = (brokerId) => {
    setAssignedBrokers((prev) => {
      if (prev.includes(brokerId)) {
        return prev.filter((id) => id !== brokerId);
      } else {
        return [...prev, brokerId];
      }
    });
  };

  // ✅ Select/deselect all brokers
  const selectAllBrokers = () => {
    setAssignedBrokers(allBrokers.map((b) => b.broker_id));
  };

  const deselectAllBrokers = () => {
    setAssignedBrokers([]);
  };

  useEffect(() => {
    fetchMerchants();
    fetchAllBrokers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Load broker assignments when merchant selection changes
  useEffect(() => {
    if (selected?.merchant_id) {
      fetchMerchantBrokers(selected.merchant_id);
    } else {
      setAssignedBrokers([]);
    }
  }, [selected?.merchant_id]);

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
            // We're NOT overlaying points here; we're changing the rate & cash only
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

  // ✅ Helper: resolve API base URL the same way api.js does
  const getApiBase = () =>
    window.__VITE_API_BASE__
    || window.__API_BASE__
    || localStorage.getItem('apiBase')
    || import.meta.env.VITE_API_BASE
    || (window.location.hostname === 'localhost'
      ? 'http://localhost/api'
      : 'https://api.stockloyal.com/api');

  // ✅ Handle logo file upload from local machine
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      alert('Please select a valid image file (PNG, JPG, GIF, WebP, or SVG)');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image file must be less than 2MB');
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoPreview(event.target.result);
    };
    reader.readAsDataURL(file);

    // Upload the file to production
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('merchant_id', selected?.merchant_id || 'new');
      formData.append('type', 'merchant');

      const response = await fetch(`${getApiBase()}/upload-logo.php`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data?.success && data?.url) {
        setSelected((prev) => ({
          ...prev,
          logo_url: data.url,
        }));
        setLogoPreview(null);
        console.log('✅ Merchant logo uploaded:', data.url);
      } else {
        alert('Upload failed: ' + (data?.error || 'Unknown error'));
        setLogoPreview(null);
      }
    } catch (err) {
      console.error('[Admin] Logo upload failed:', err);
      alert('Upload failed: network/server error');
      setLogoPreview(null);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ✅ Handle logo fetch from external URL — downloads it to production server
  const handleLogoFromUrl = async () => {
    const url = logoUrlInput.trim();
    if (!url) {
      alert('Please enter an image URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      alert('Please enter a valid URL (e.g. https://example.com/logo.png)');
      return;
    }

    // Show the URL as preview immediately
    setLogoPreview(url);
    setUploadingLogo(true);

    try {
      const response = await fetch(`${getApiBase()}/upload-logo.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_url: url,
          merchant_id: selected?.merchant_id || 'new',
          type: 'merchant',
        }),
      });

      const data = await response.json();

      if (data?.success && data?.url) {
        setSelected((prev) => ({
          ...prev,
          logo_url: data.url,
        }));
        setLogoPreview(null);
        setLogoUrlInput('');
        console.log('✅ Merchant logo fetched & saved:', data.url);
      } else {
        alert('Fetch failed: ' + (data?.error || 'Unknown error'));
        setLogoPreview(null);
      }
    } catch (err) {
      console.error('[Admin] Logo URL fetch failed:', err);
      alert('Fetch failed: network/server error');
      setLogoPreview(null);
    } finally {
      setUploadingLogo(false);
    }
  };

  // ✅ Remove logo
  const handleRemoveLogo = () => {
    setSelected((prev) => ({
      ...prev,
      logo_url: '',
    }));
    setLogoPreview(null);
    setLogoUrlInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

            {/* ✅ Merchant Logo Upload Section */}
            <div style={{ 
              gridColumn: '1 / -1', 
              marginTop: '0.5rem', 
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb'
            }}>
              <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block' }}>
                Merchant Logo:
              </label>
              
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                {/* Logo Preview */}
                <div style={{
                  width: '100px',
                  height: '100px',
                  border: '2px dashed #d1d5db',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  {(logoPreview || selected?.logo_url) ? (
                    <>
                      <img 
                        src={logoPreview || selected?.logo_url} 
                        alt="Merchant logo"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        title="Remove logo"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <Image size={32} color="#9ca3af" />
                  )}
                </div>

                {/* Upload Controls */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  {/* Option 1: Upload from local machine */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                    id="merchant-logo-upload-input"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="btn-secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                      padding: '0.5rem 1rem',
                    }}
                  >
                    <Upload size={16} />
                    {uploadingLogo ? 'Saving to server...' : 'Upload from Computer'}
                  </button>

                  {/* Divider */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    margin: '0.75rem 0',
                    color: '#9ca3af',
                    fontSize: '0.75rem',
                  }}>
                    <div style={{ flex: 1, height: '1px', background: '#d1d5db' }} />
                    OR
                    <div style={{ flex: 1, height: '1px', background: '#d1d5db' }} />
                  </div>

                  {/* Option 2: Fetch from URL */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      className="form-input"
                      type="url"
                      placeholder="https://example.com/merchant-logo.png"
                      value={logoUrlInput}
                      onChange={(e) => setLogoUrlInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogoFromUrl(); } }}
                      style={{
                        flex: 1,
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleLogoFromUrl}
                      disabled={uploadingLogo || !logoUrlInput.trim()}
                      className="btn-primary"
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                        opacity: (uploadingLogo || !logoUrlInput.trim()) ? 0.5 : 1,
                      }}
                    >
                      {uploadingLogo ? 'Fetching...' : 'Fetch & Save'}
                    </button>
                  </div>

                  <p style={{ 
                    margin: '0.5rem 0 0 0', 
                    fontSize: '0.75rem', 
                    color: '#6b7280',
                    lineHeight: 1.4
                  }}>
                    Upload a file or paste any image URL. The image will be saved to the production server on AWS.
                  </p>
                  
                  {/* Saved Logo URL display */}
                  {selected?.logo_url && (
                    <div style={{ 
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: '#ecfdf5',
                      borderRadius: '4px',
                      border: '1px solid #a7f3d0',
                    }}>
                      <span style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 600 }}>
                        ✅ Saved on server:
                      </span>
                      <input
                        className="form-input"
                        type="text"
                        value={selected.logo_url}
                        readOnly
                        style={{ 
                          fontSize: '0.7rem', 
                          fontFamily: 'monospace',
                          background: '#fff',
                          color: '#6b7280',
                          marginTop: '0.25rem',
                        }}
                        title="Production logo URL (click to copy)"
                        onClick={(e) => {
                          e.target.select();
                          navigator.clipboard?.writeText(selected.logo_url);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

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

            {/* ✅ Sweep Schedule Section */}
            <div style={{ 
              gridColumn: '1 / -1', 
              marginTop: '1.5rem', 
              marginBottom: '1rem',
              padding: '1rem',
              background: '#fef3c7',
              borderRadius: '8px',
              border: '1px solid #f59e0b'
            }}>
              <h3 style={{ 
                fontSize: '1.1rem', 
                fontWeight: '600', 
                marginBottom: '0.75rem',
                color: '#92400e',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📅 Monthly Sweep Schedule
              </h3>
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#78350f', 
                marginBottom: '1rem' 
              }}>
                Configure when orders are processed. Select <strong>T+1</strong> for same-day order processing with next-day settlement, or choose a specific day of the month for batched sweep orders.
              </p>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#92400e' }}>
                    Sweep Day
                  </label>
                  <select
                    className="form-input"
                    name="sweep_day"
                    value={selected?.sweep_day || ""}
                    onChange={handleChange}
                    style={{ width: '100%' }}
                  >
                    <option value="">No automatic sweep</option>
                    <option value="T+1">T+1 (Same-day processing, next-day settlement)</option>
                    <option value="1">1st of the month</option>
                    <option value="15">15th of the month</option>
                    <option value="-1">Last day of the month</option>
                    <option value="custom">Custom day...</option>
                  </select>
                </div>
                
                {selected?.sweep_day === "custom" && (
                  <div style={{ flex: '1', minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#92400e' }}>
                      Custom Day (1-28)
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      name="sweep_day_custom"
                      min="1"
                      max="28"
                      value={selected?.sweep_day_custom || ""}
                      onChange={(e) => {
                        const val = Math.min(28, Math.max(1, parseInt(e.target.value) || 1));
                        setSelected(prev => ({ ...prev, sweep_day: String(val), sweep_day_custom: val }));
                      }}
                      placeholder="1-28"
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                {selected?.sweep_modified_at && (
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#92400e',
                    background: '#fde68a',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    marginLeft: 'auto'
                  }}>
                    Last modified: {new Date(selected.sweep_modified_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

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

            {/* ✅ Broker Relationships Section */}
            <div style={{ 
              gridColumn: '1 / -1', 
              marginTop: '1.5rem', 
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f0fdf4',
              borderRadius: '8px',
              border: '1px solid #22c55e'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '0.75rem'
              }}>
                <h3 style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '600', 
                  margin: 0,
                  color: '#166534',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🏦 Broker Relationships
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={selectAllBrokers}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      background: '#dcfce7',
                      border: '1px solid #22c55e',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#166534'
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllBrokers}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      background: '#fee2e2',
                      border: '1px solid #ef4444',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#991b1b'
                    }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
              
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#15803d', 
                marginBottom: '1rem' 
              }}>
                Select which brokers are available to members of this merchant. Only selected brokers will appear in the broker selection screen.
              </p>

              {brokersLoading ? (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Loading brokers...</p>
              ) : allBrokers.length === 0 ? (
                <p style={{ color: '#9ca3af' }}>No brokers configured in the system.</p>
              ) : (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '0.5rem'
                }}>
                  {allBrokers.map((broker) => {
                    const isAssigned = assignedBrokers.includes(broker.broker_id);
                    return (
                      <label
                        key={broker.broker_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: isAssigned ? '#dcfce7' : 'white',
                          border: `1px solid ${isAssigned ? '#22c55e' : '#e5e7eb'}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => toggleBroker(broker.broker_id)}
                          style={{ 
                            width: '16px', 
                            height: '16px',
                            accentColor: '#22c55e'
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ 
                            fontWeight: '500', 
                            fontSize: '0.875rem',
                            color: '#111827',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {broker.broker_name}
                          </div>
                          <div style={{ 
                            fontSize: '0.7rem', 
                            color: '#6b7280',
                            fontFamily: 'monospace'
                          }}>
                            {broker.broker_id}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div style={{ 
                marginTop: '1rem', 
                paddingTop: '1rem', 
                borderTop: '1px solid #bbf7d0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.875rem', color: '#166534' }}>
                  {assignedBrokers.length} of {allBrokers.length} brokers selected
                </span>
                <button
                  type="button"
                  onClick={saveMerchantBrokers}
                  style={{
                    padding: '8px 16px',
                    background: '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Save Broker Assignments
                </button>
              </div>
            </div>

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
                <th style={{ width: '50px' }}>Logo</th>
                <th>Merchant ID</th>
                <th>Name</th>
                <th>Base Rate</th>
                <th>Tiers</th>
                <th>Brokers</th>
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

                // Broker count (if we have it from the API)
                const brokerCount = m.broker_count ?? '?';

                return (
                  <tr 
                    key={m.merchant_id}
                    onClick={() => {
                      setSelected({ ...m });
                      originalRateRef.current = Number(m.conversion_rate ?? 0);
                      setLogoPreview(null);    // ✅ Clear preview when switching merchants
                      setLogoUrlInput('');     // ✅ Clear URL input when switching
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
                    <td style={{ textAlign: 'center' }}>
                      {m.logo_url ? (
                        <img 
                          src={m.logo_url} 
                          alt={`${m.merchant_name} logo`}
                          style={{
                            width: '32px',
                            height: '32px',
                            objectFit: 'contain',
                            borderRadius: '4px',
                          }}
                        />
                      ) : (
                        <Image size={24} color="#d1d5db" />
                      )}
                    </td>
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
                          {tiersConfigured}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {brokerCount > 0 ? (
                        <span style={{
                          background: '#dcfce7',
                          color: '#166534',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.85rem',
                          fontWeight: '600'
                        }}>
                          {brokerCount}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
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
