// src/pages/AdminBroker.jsx
import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api.js";

const BROKER_TEMPLATE = {
  broker_id: "",
  broker_name: "",
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

  // Load all brokers
  const fetchBrokers = async () => {
    setLoading(true);
    try {
      const data = await apiGet("get-brokers.php");
      if (data?.success) {
        const list = data.brokers || [];
        setBrokers(list);

        if (!selected && list.length > 0) {
          setSelected({ ...list[0] });
        } else if (selected) {
          // refresh selected from the latest list if it exists
          const ref = list.find(
            (b) => String(b.broker_id) === String(selected.broker_id)
          );
          if (ref) {
            setSelected({ ...ref });
          } else if (list.length > 0) {
            setSelected({ ...list[0] });
          } else {
            setSelected(null);
          }
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
        setSelected(current || list[0] || null);
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
        setSelected(updated[0] || null);
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

  const startNewBroker = () => {
    setSelected({ ...BROKER_TEMPLATE });
  };

  return (
    <div id="admin-broker-container" className="app-container app-content">
      <h1 className="page-title">Broker Admin</h1>
      <p className="page-deck">
        This page is used for administrative purposes to manage{" "}
        <code>broker_master</code> data, including ACH routing and order limits.
      </p>

      <div className="card" style={{ overflowX: "hidden", maxWidth: "100%" }}>
        <div className="card-actions" style={{ marginBottom: "1rem" }}>
          <button type="button" className="btn-secondary" onClick={startNewBroker}>
            + New Broker
          </button>
        </div>

        {selected ? (
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
            </div>
          </form>
        ) : (
          <p className="body-text">Select a broker from the table below to edit, or create a new one.</p>
        )}
      </div>

      {/* Broker Records Table */}
      <h2 className="subheading">Broker Records</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
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
                  onClick={() => {
                    setSelected({ ...b });
                    // Scroll to top of page - multiple methods for compatibility
                    const container = document.getElementById('admin-broker-container');
                    if (container) {
                      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    document.documentElement.scrollTop = 0;
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Click to edit this broker"
                >
                  <td>{b.broker_id}</td>
                  <td>{b.broker_name}</td>
                  <td>{b.support_phone || "-"}</td>
                  <td>{b.support_email || "-"}</td>
                </tr>
              ))}
              {brokers.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center" }}>
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
