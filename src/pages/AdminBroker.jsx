// src/pages/AdminBroker.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { apiGet, apiPost } from "../api.js";
import { Upload, X, Image } from "lucide-react";

const BROKER_TEMPLATE = {
  broker_id: "",
  broker_name: "",
  logo_url: "", // ✅ Broker logo image URL
  ach_bank_name: "",
  ach_routing_num: "",
  ach_account_num: "",
  ach_account_type: "checking",

  address_line1: "",
  address_line2: "",
  address_city: "",
  address_state: "",
  address_zip: "",
  address_country: "USA",

  min_order_amount: "1.00",
  max_order_amount: "100000.00",
  max_securities_per_order: "5",
  default_order_type: "market",

  support_phone: "",
  support_email: "",
  contact_name: "",
  
  webhook_url: "",
  api_key: "",

  broker_created_at: null,
  broker_modified_at: null,
};

export default function AdminBroker() {
  const [brokers, setBrokers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ✅ Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const fileInputRef = useRef(null);
  const editPanelRef = useRef(null);

  // Load all brokers
  const fetchBrokers = async () => {
    setLoading(true);
    try {
      const data = await apiGet("get-brokers.php");
      if (data?.success) {
        const list = data.brokers || [];
        setBrokers(list);

        // If editing, refresh selected from updated list
        if (selected) {
          const ref = list.find(
            (b) => String(b.broker_id) === String(selected.broker_id)
          );
          if (ref) setSelected({ ...ref });
        }
      } else {
        console.warn("[AdminBroker] get-brokers error:", data?.error);
      }
    } catch (e) {
      console.error("[AdminBroker] get-brokers failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrokers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save broker (upsert by broker_id)
  const saveBroker = async (e) => {
    e.preventDefault();
    if (!selected) return;

    try {
      const res = await apiPost("save-broker.php", selected);
      if (!res?.success) {
        alert("Save failed: " + (res?.error || "Unknown error"));
        return;
      }

      // Refresh list and keep focus on the saved one
      const data = await apiGet("get-brokers.php").catch(() => null);
      if (data?.success) {
        const list = data.brokers || [];
        setBrokers(list);
        const current = list.find(
          (b) => String(b.broker_id) === String(selected.broker_id)
        );
        setSelected(current || null);
      }

      alert("Broker saved!");
    } catch (err) {
      console.error("[AdminBroker] save-broker failed:", err);
      alert("Save failed: network/server error");
    }
  };

  // Delete broker
  const deleteBroker = async (broker_id) => {
    if (!window.confirm("Delete this broker?")) return;
    try {
      const res = await apiPost("delete-broker.php", { broker_id });
      if (res?.success) {
        alert("Deleted");
        const updated = brokers.filter(
          (b) => String(b.broker_id) !== String(broker_id)
        );
        setBrokers(updated);
        setSelected(null);
      } else {
        alert("Delete failed: " + (res?.error || "Unknown error"));
      }
    } catch (e) {
      console.error("[AdminBroker] delete-broker failed:", e);
      alert("Delete failed: network/server error");
    }
  };

  // Handle form input
  const handleChange = (e) => {
    const { name, value } = e.target;
    setSelected((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectChange = (e) => {
    const { name, value } = e.target;
    setSelected((prev) => ({
      ...prev,
      [name]: value,
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
      formData.append('broker_id', selected?.broker_id || 'new');
      formData.append('type', 'broker');

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
        console.log('✅ Logo uploaded:', data.url);
      } else {
        alert('Upload failed: ' + (data?.error || 'Unknown error'));
        setLogoPreview(null);
      }
    } catch (err) {
      console.error('[AdminBroker] Logo upload failed:', err);
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
          broker_id: selected?.broker_id || 'new',
          type: 'broker',
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
        console.log('✅ Logo fetched & saved:', data.url);
      } else {
        alert('Fetch failed: ' + (data?.error || 'Unknown error'));
        setLogoPreview(null);
      }
    } catch (err) {
      console.error('[AdminBroker] Logo URL fetch failed:', err);
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

  const startNewBroker = () => {
    setSelected({ ...BROKER_TEMPLATE });
    setLogoPreview(null);
    setLogoUrlInput('');
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  // ✅ Click row to edit — SocialPostsAdmin pattern
  const handleEditClick = (broker) => {
    setSelected({ ...broker });
    setLogoPreview(null);
    setLogoUrlInput('');
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <div id="admin-broker-container" className="app-container app-content">
      <h1 className="page-title">Broker Admin</h1>
      <p className="page-deck">
        This page is used for administrative purposes to manage{" "}
        <code>broker_master</code> data, including ACH routing and order limits.
      </p>

      {/* Edit Panel — only visible when a row is clicked or New Broker */}
      {selected && (
      <div className="card" ref={editPanelRef} style={{ overflowX: "hidden", maxWidth: "100%", marginBottom: "1rem" }}>
        <h2 className="subheading" style={{ marginTop: 0 }}>
          {selected.broker_id ? `Edit Broker: ${selected.broker_name || selected.broker_id}` : "New Broker"}
        </h2>
        <form onSubmit={saveBroker} className="form-grid" style={{ maxWidth: "100%" }}>
            {/* Core IDs */}
            <FormRow label="Broker ID">
              <input
                className="form-input"
                type="text"
                name="broker_id"
                value={selected?.broker_id || ""}
                onChange={handleChange}
                required
              />
            </FormRow>

            <FormRow label="Broker Name">
              <input
                className="form-input"
                type="text"
                name="broker_name"
                value={selected?.broker_name || ""}
                onChange={handleChange}
                required
              />
            </FormRow>

            {/* ✅ Logo Upload Section */}
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
                Broker Logo:
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
                        alt="Broker logo"
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
                    id="logo-upload-input"
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
                      placeholder="https://example.com/broker-logo.png"
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

            {/* ACH Routing */}
            <FormRow label="ACH Bank Name">
              <input
                className="form-input"
                type="text"
                name="ach_bank_name"
                value={selected?.ach_bank_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="ACH Routing Number">
              <input
                className="form-input"
                type="text"
                name="ach_routing_num"
                value={selected?.ach_routing_num || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="ACH Account Number">
              <input
                className="form-input"
                type="text"
                name="ach_account_num"
                value={selected?.ach_account_num || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="ACH Account Type">
              <select
                className="form-input"
                name="ach_account_type"
                value={selected?.ach_account_type || "checking"}
                onChange={handleSelectChange}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="other">Other</option>
              </select>
            </FormRow>

            {/* Order Limits */}
            <FormRow label="Min Order Amount ($)">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="min_order_amount"
                value={selected?.min_order_amount ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Max Order Amount ($)">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="max_order_amount"
                value={selected?.max_order_amount ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Max Securities Per Order">
              <input
                className="form-input"
                type="number"
                step="1"
                min="1"
                name="max_securities_per_order"
                value={selected?.max_securities_per_order ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Default Order Type">
              <select
                className="form-input"
                name="default_order_type"
                value={selected?.default_order_type || "market"}
                onChange={handleSelectChange}
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
                <option value="stop">Stop</option>
                <option value="stop_limit">Stop Limit</option>
                <option value="gtc">GTC</option>
              </select>
            </FormRow>

            {/* Support / Contact */}
            <FormRow label="Support Phone">
              <input
                className="form-input"
                type="text"
                name="support_phone"
                value={selected?.support_phone || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Support Email">
              <input
                className="form-input"
                type="email"
                name="support_email"
                value={selected?.support_email || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Contact Name">
              <input
                className="form-input"
                type="text"
                name="contact_name"
                value={selected?.contact_name || ""}
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
                Configure webhook endpoint to receive real-time notifications for order status updates and settlement confirmations.
              </p>
            </div>

            <FormRow label="Webhook URL">
              <input
                className="form-input"
                type="url"
                name="webhook_url"
                value={selected?.webhook_url || ""}
                onChange={handleChange}
                placeholder="https://broker.com/api/stockloyal/webhook"
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

            {/* Address */}
            <FormRow label="Address Line 1">
              <input
                className="form-input"
                type="text"
                name="address_line1"
                value={selected?.address_line1 || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Address Line 2">
              <input
                className="form-input"
                type="text"
                name="address_line2"
                value={selected?.address_line2 || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="City">
              <input
                className="form-input"
                type="text"
                name="address_city"
                value={selected?.address_city || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="State">
              <input
                className="form-input"
                type="text"
                name="address_state"
                value={selected?.address_state || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="ZIP">
              <input
                className="form-input"
                type="text"
                name="address_zip"
                value={selected?.address_zip || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Country">
              <input
                className="form-input"
                type="text"
                name="address_country"
                value={selected?.address_country || "USA"}
                onChange={handleChange}
              />
            </FormRow>

            {/* Read-only audit fields, if present */}
            <FormRow label="Broker Created At">
              <input
                className="form-input"
                type="text"
                value={selected?.broker_created_at || ""}
                disabled
                readOnly
              />
            </FormRow>

            <FormRow label="Broker Modified At">
              <input
                className="form-input"
                type="text"
                value={selected?.broker_modified_at || ""}
                disabled
                readOnly
              />
            </FormRow>

            <div className="card-actions">
              <button type="submit" className="btn-primary">
                Save Broker
              </button>
              {selected?.broker_id && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={() => deleteBroker(selected.broker_id)}
                >
                  Delete Broker
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </form>
      </div>
      )}

      {/* Broker Records Table */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <h2 className="subheading" style={{ margin: 0 }}>Broker Records</h2>
        <button type="button" className="btn-secondary" onClick={startNewBroker}>
          + New Broker
        </button>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>Logo</th>
                <th>Broker ID</th>
                <th>Name</th>
                <th>Support Phone</th>
                <th>Support Email</th>
              </tr>
            </thead>
            <tbody>
              {brokers.map((b) => (
                <tr 
                  key={b.broker_id}
                  onClick={() => handleEditClick(b)}
                  style={{ cursor: 'pointer' }}
                  title="Click to edit this broker"
                >
                  <td style={{ textAlign: 'center' }}>
                    {b.logo_url ? (
                      <img 
                        src={b.logo_url} 
                        alt={`${b.broker_name} logo`}
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
                  <td>{b.broker_id}</td>
                  <td>{b.broker_name}</td>
                  <td>{b.support_phone || "-"}</td>
                  <td>{b.support_email || "-"}</td>
                </tr>
              ))}
              {brokers.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center" }}>
                    No brokers found. Click &quot;New Broker&quot; to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Helper form row – same pattern as Admin.jsx
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
