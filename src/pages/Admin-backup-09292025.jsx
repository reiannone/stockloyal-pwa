// src/pages/Admin.jsx
import React, { useEffect, useState } from "react";
import { apiPost } from "../api";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";

export default function Admin() {
  const [merchants, setMerchants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDemo, setShowDemo] = useState(false);

  // Load all merchants
  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch("/api/get-merchants.php");
      const data = await res.json();
      if (data.success) {
        setMerchants(data.merchants);
        if (data.merchants.length > 0) {
          setSelected({ ...data.merchants[0] });
        }
      }
      setLoading(false);
    })();
  }, []);

  // Save merchant
  const saveMerchant = async (e) => {
    e.preventDefault();
    const res = await apiPost("save-merchant.php", selected);
    if (res.success) {
      alert("Merchant saved!");
      window.location.reload();
    } else {
      alert("Save failed: " + res.error);
    }
  };

  // Delete merchant
  const deleteMerchant = async (record_id) => {
    if (!window.confirm("Delete this merchant?")) return;
    const res = await apiPost("delete-merchant.php", { record_id });
    if (res.success) {
      alert("Deleted");
      setMerchants(merchants.filter((m) => m.record_id !== record_id));
      if (selected?.record_id === record_id) {
        setSelected(null);
      }
    } else {
      alert("Delete failed: " + res.error);
    }
  };

  // Handle form input
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSelected({
      ...selected,
      [name]: type === "checkbox" ? (checked ? 1 : 0) : value,
    });
  };

  // Demo launcher
  const launchDemo = () => {
    if (!selected?.merchant_id) {
      alert("Select a merchant first");
      return;
    }
    const memberId = document.getElementById("demo_member_id").value.trim();
    const points =
      document.getElementById("demo_points").value.trim() || "100";
    if (!memberId) {
      alert("Please enter a Member ID");
      return;
    }
    const url =
      window.location.origin +
      `/?member_id=${encodeURIComponent(memberId)}&merchant_id=${encodeURIComponent(
        selected.merchant_id
      )}&points=${encodeURIComponent(points)}&action=earn`;
    window.open(url, "_blank");
  };

  return (
    <div className="app-container app-content">
      <h1 className="heading">Merchant Admin</h1>

      <div className="card">
        {selected ? (
          <form onSubmit={saveMerchant} className="form-grid">
            <input
              type="hidden"
              name="record_id"
              value={selected?.record_id || ""}
            />

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
                value={selected?.conversion_rate || "0.01"}
                onChange={handleChange}
              />
            </FormRow>

            {/* Promotion Text */}
            <div className="form-row">
              <label className="form-label">Promotion Text:</label>
              <div className="form-input">
                <CKEditor
                  editor={ClassicEditor}
                  data={selected?.promotion_text || ""}
                  onChange={(event, editor) => {
                    const data = editor.getData();
                    setSelected({ ...selected, promotion_text: data });
                  }}
                  config={{ placeholder: "Enter promotion text here..." }}
                />
              </div>
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
              <button type="submit" className="btn-primary">
                Save Merchant
              </button>
              <button
                type="button"
                onClick={() => setShowDemo(true)}
                className="btn-secondary"
              >
                Launch Demo
              </button>
            </div>
          </form>
        ) : (
          <p className="body-text">
            Select a merchant from the table below to edit.
          </p>
        )}
      </div>

      {/* Slide-out Demo Panel */}
      {showDemo && (
        <div className="card card--muted" style={{ position: "fixed", top: 0, right: 0, width: "320px", height: "100%", zIndex: 1000, overflowY: "auto" }}>
          <h3 className="subheading">Launch Demo</h3>
          <p>Simulate a member coming from a merchant site:</p>
          <label>Member ID:</label>
          <input id="demo_member_id" className="form-input" placeholder="Enter Member ID" />
          <label>Reward Points:</label>
          <input id="demo_points" className="form-input" type="number" defaultValue={100} />
          <button className="btn-primary" onClick={launchDemo}>Launch StockLoyal PWA</button>
          <button className="btn-secondary" onClick={() => setShowDemo(false)}>Close</button>
        </div>
      )}

      {/* Merchant Records Table */}
      <h2 className="subheading">Merchant Records</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card">
          <table className="basket-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Merchant ID</th>
                <th>Name</th>
                <th>Rate</th>
                <th>Promo Active</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.record_id}>
                  <td>{m.record_id}</td>
                  <td>{m.merchant_id}</td>
                  <td>{m.merchant_name}</td>
                  <td>{m.conversion_rate}</td>
                  <td>{m.promotion_active ? "Active" : "Inactive"}</td>
                  <td>{m.active_status ? "Active" : "Inactive"}</td>
                  <td>
                    <button className="btn-secondary" onClick={() => setSelected({ ...m })}>
                      Edit
                    </button>
                    <button className="btn-primary" style={{ background: "#dc2626" }} onClick={() => deleteMerchant(m.record_id)}>
                      Delete
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
      <div className="form-input">{children}</div>
    </div>
  );
}
