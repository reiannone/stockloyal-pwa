// src/pages/WebhookAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Settings,
  Activity,
  TrendingUp,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";

/**
 * WebhookAdmin.jsx (Styled to match AdminBroker.jsx)
 *
 * Uses the same StockLoyal admin page classes:
 * - app-container app-content
 * - page-title / page-deck
 * - card / card-actions
 * - form-grid / form-row / form-label / form-input
 * - basket-table for tables
 *
 * API Endpoints:
 *  GET  /api/webhook-config.php
 *  POST /api/webhook-config.php
 *  GET  /api/webhook-stats.php
 *  GET  /api/webhook-logs.php
 *  POST /api/webhook-test.php
 */

// Dynamic API base URL (matches pattern used in Admin.jsx, AdminBroker.jsx, etc.)
const getApiBase = () =>
  window.__VITE_API_BASE__
  || window.__API_BASE__
  || localStorage.getItem('apiBase')
  || import.meta.env.VITE_API_BASE
  || (window.location.hostname === 'localhost'
    ? 'http://localhost/api'
    : 'https://api.stockloyal.com/api');

// API endpoint paths (appended to getApiBase() at call time)
const WEBHOOK_ENDPOINTS = {
  config: '/webhook-config.php',
  stats: '/webhook-stats.php',
  logs: '/webhook-logs.php',
  test: '/webhook-test.php'
};

const apiUrl = (endpoint) => `${getApiBase()}${WEBHOOK_ENDPOINTS[endpoint]}`;

export default function WebhookAdmin() {
  const [activeTab, setActiveTab] = useState("settings"); // settings | stats | logs
  const [loading, setLoading] = useState(false);

  const [showApiKey, setShowApiKey] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);

  const [config, setConfig] = useState({
    webhookUrl: "",
    apiKey: "",
    environment: "production",
    requireSignature: true,
    rateLimit: 60,
  });

  const [filters, setFilters] = useState({
    eventType: "",
    sourceIp: "",
    date: "",
    verified: "",
  });

  const [pagination, setPagination] = useState({
    page: 1,
    perPage: 50,
    total: 0,
  });

  const totalPages = useMemo(() => {
    const t = Number(pagination.total || 0);
    const pp = Number(pagination.perPage || 50);
    return Math.max(1, Math.ceil(t / pp));
  }, [pagination.total, pagination.perPage]);

  // -------- API calls --------
  const loadConfiguration = async () => {
    try {
      console.log("[WebhookAdmin] loadConfiguration fetching:", apiUrl('config'));
      const response = await fetch(apiUrl('config'));
      console.log("[WebhookAdmin] loadConfiguration status:", response.status);
      const data = await response.json();
      console.log("[WebhookAdmin] loadConfiguration data:", data);
      if (data?.success && data?.config) setConfig(data.config);
    } catch (error) {
      console.error("Failed to load configuration:", error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(apiUrl('stats'));
      const data = await response.json();
      if (data?.success && data?.stats) setStats(data.stats);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        perPage: String(pagination.perPage),
        eventType: filters.eventType || "",
        sourceIp: filters.sourceIp || "",
        date: filters.date || "",
        verified: filters.verified || "",
      });

      const url = `${apiUrl('logs')}?${params.toString()}`;
      console.log("[WebhookAdmin] loadLogs fetching:", url);
      const response = await fetch(url);
      console.log("[WebhookAdmin] loadLogs response status:", response.status);
      const data = await response.json();
      console.log("[WebhookAdmin] loadLogs data:", data);

      if (data?.success) {
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        setPagination((prev) => ({
          ...prev,
          total: Number(data.total || 0),
        }));
      }
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('config'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      if (data?.success) {
        alert("Configuration saved successfully");
      } else {
        alert("Failed to save configuration: " + (data?.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to save configuration:", error);
      alert("Failed to save configuration");
    } finally {
      setLoading(false);
    }
  };

  const testWebhook = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('test'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "test.connection",
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      if (data?.success) {
        alert("Test webhook sent successfully!");
        await Promise.allSettled([loadStats(), loadLogs()]);
      } else {
        alert("Test failed: " + (data?.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Test failed:", error);
      alert("Test failed: " + (error?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // -------- UI helpers --------
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      alert("Copied to clipboard!");
    } catch {
      alert("Copy failed (browser permissions).");
    }
  };

  const generateNewApiKey = () => {
    const newKey =
      "sk_" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    setConfig((prev) => ({ ...prev, apiKey: newKey }));
  };

  // Load on mount
  useEffect(() => {
    loadConfiguration();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load logs on logs tab + filters/page
  useEffect(() => {
    if (activeTab === "logs") loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters, pagination.page]);

  // Reset page when filters change
  useEffect(() => {
    if (pagination.page !== 1) {
      setPagination((p) => ({ ...p, page: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.eventType, filters.sourceIp, filters.date, filters.verified]);

  // -------- Render: Settings --------
  const renderSettings = () => {
    return (
      <div className="card" style={{ overflowX: "hidden", maxWidth: "100%" }}>
        <div className="card-actions" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={loadConfiguration} 
            disabled={loading}
            style={{ width: "auto", padding: "0.5rem 1rem" }}
          >
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            Refresh
          </button>
          <button 
            type="button" 
            className="btn-primary" 
            onClick={saveConfiguration} 
            disabled={loading}
            style={{ width: "auto", padding: "0.5rem 1rem" }}
          >
            {loading ? "Saving..." : "Save Configuration"}
          </button>
          <button 
            type="button" 
            className="btn-primary" 
            onClick={testWebhook} 
            disabled={loading}
            style={{ width: "auto", padding: "0.5rem 1rem" }}
          >
            Test Webhook
          </button>
        </div>

        <form className="form-grid" style={{ maxWidth: "100%" }} onSubmit={(e) => e.preventDefault()}>
          <FormRow label="Webhook URL">
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                className="form-input"
                type="url"
                value={config.webhookUrl || ""}
                onChange={(e) => setConfig((p) => ({ ...p, webhookUrl: e.target.value }))}
                placeholder="https://app.stockloyal.com/webhooks/stockloyal-receiver.php"
                style={{ fontFamily: "monospace", fontSize: "0.875rem", flex: 1, minWidth: 450 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => copyToClipboard(config.webhookUrl)}
                title="Copy"
                style={{ flexShrink: 0, padding: "0.5rem 0.75rem", maxWidth: 50 }}
              >
                <Copy size={16} />
              </button>
            </div>
            <p className="page-deck" style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}>
              This is the endpoint where webhook events will be sent.
            </p>
          </FormRow>

          <FormRow label="API Key">
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                className="form-input"
                type={showApiKey ? "text" : "password"}
                value={config.apiKey || ""}
                onChange={(e) => setConfig((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder="sk_..."
                style={{ fontFamily: "monospace", fontSize: "0.875rem", flex: 1, minWidth: 250 }}
              />
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setShowApiKey((s) => !s)} 
                title="Show/Hide"
                style={{ flexShrink: 0, padding: "0.5rem 0.75rem", maxWidth: 50 }}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => copyToClipboard(config.apiKey)} 
                title="Copy"
                style={{ flexShrink: 0, padding: "0.5rem 0.75rem", maxWidth: 50 }}
              >
                <Copy size={16} />
              </button>
            </div>

            <div className="card" style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", borderLeft: "4px solid #fbbf24" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <AlertCircle size={18} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>Warning</div>
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.35 }}>
                    Changing the API key will invalidate existing webhook senders. Update all systems before saving.
                  </div>
                </div>
              </div>
              <div className="card-actions" style={{ marginTop: "0.75rem" }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={generateNewApiKey}
                  style={{ width: "auto", padding: "0.5rem 1rem" }}
                >
                  Generate New Key
                </button>
              </div>
            </div>
          </FormRow>

          <FormRow label="Environment">
            <select
              className="form-input"
              value={config.environment || "production"}
              onChange={(e) => setConfig((p) => ({ ...p, environment: e.target.value }))}
              style={{ width: "100%", maxWidth: "300px" }}
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </FormRow>

          <FormRow label="Require Signature Verification">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <input
                type="checkbox"
                checked={!!config.requireSignature}
                onChange={(e) => setConfig((p) => ({ ...p, requireSignature: e.target.checked }))}
              />
              <span style={{ fontSize: "0.9rem" }}>Require HMAC signatures (recommended for production)</span>
            </div>
          </FormRow>

          <FormRow label="Rate Limit (req/min per IP)">
            <input
              className="form-input"
              type="number"
              min="1"
              max="1000"
              value={Number.isFinite(config.rateLimit) ? config.rateLimit : 60}
              onChange={(e) => setConfig((p) => ({ ...p, rateLimit: parseInt(e.target.value || "0", 10) || 0 }))}
              style={{ width: "100%", maxWidth: "200px" }}
            />
          </FormRow>
        </form>
      </div>
    );
  };

  // -------- Render: Stats --------
  const renderStats = () => {
    return (
      <div className="card" style={{ overflowX: "hidden", maxWidth: "100%" }}>
        <div className="card-actions" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={loadStats} 
            disabled={loading}
            style={{ width: "auto", padding: "0.5rem 1rem" }}
          >
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            Refresh
          </button>
        </div>

        {!stats ? (
          <div style={{ padding: "1rem" }}>
            <p>Loading stats...</p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.75rem",
                padding: "0 1rem 1rem 1rem",
              }}
            >
              <StatCard label="Last 24 Hours" value={stats.total24h?.toLocaleString?.() || "0"} Icon={Activity} />
              <StatCard label="Unique Events" value={String(stats.uniqueEvents || 0)} Icon={TrendingUp} />
              <StatCard
                label="Verified"
                value={String(stats.verified || 0)}
                subtext={
                  stats.total24h > 0
                    ? `${((stats.verified / stats.total24h) * 100).toFixed(1)}%`
                    : "0%"
                }
                Icon={CheckCircle}
              />
              <StatCard label="Unique IPs" value={String(stats.uniqueIps || 0)} Icon={Settings} />
            </div>

            {Array.isArray(stats.eventBreakdown) && stats.eventBreakdown.length > 0 && (
              <div style={{ padding: "0 1rem 1rem 1rem" }}>
                <h2 className="subheading" style={{ marginTop: 0 }}>
                  Top Event Types (24h)
                </h2>
                <div className="card" style={{ overflowX: "auto" }}>
                  <table className="basket-table">
                    <thead>
                      <tr>
                        <th>Event Type</th>
                        <th style={{ textAlign: "right" }}>Count</th>
                        <th style={{ textAlign: "right" }}>Verified</th>
                        <th style={{ textAlign: "right" }}>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.eventBreakdown.map((e, idx) => {
                        const count = Number(e.count || 0);
                        const verified = Number(e.verified || 0);
                        const rate = count > 0 ? (verified / count) * 100 : 0;

                        return (
                          <tr key={idx}>
                            <td>
                              <code>{e.event_type}</code>
                            </td>
                            <td style={{ textAlign: "right" }}>{count.toLocaleString()}</td>
                            <td style={{ textAlign: "right" }}>{verified.toLocaleString()}</td>
                            <td style={{ textAlign: "right" }}>{rate.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {Array.isArray(stats.recentErrors) && stats.recentErrors.length > 0 && (
              <div style={{ padding: "0 1rem 1rem 1rem" }}>
                <h2 className="subheading" style={{ marginTop: 0 }}>
                  Recent Signature Failures
                </h2>
                <div className="card" style={{ overflowX: "auto" }}>
                  <table className="basket-table">
                    <thead>
                      <tr>
                        <th>Request ID</th>
                        <th>Event Type</th>
                        <th>Source IP</th>
                        <th>Time (GMT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentErrors.map((err, idx) => (
                        <tr key={idx}>
                          <td>
                            <code>{err.request_id}</code>
                          </td>
                          <td>{err.event_type}</td>
                          <td>{err.source_ip}</td>
                          <td>{new Date(err.received_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // -------- Render: Logs --------
  const renderLogs = () => {
    return (
      <>
        <div className="card" style={{ overflowX: "hidden", maxWidth: "100%" }}>
          <h2 className="subheading" style={{ marginTop: 0 }}>
            Filters
          </h2>

          <div className="form-grid" style={{ maxWidth: "100%" }}>
            <FormRow label="Event Type">
              <input
                className="form-input"
                type="text"
                value={filters.eventType}
                onChange={(e) => setFilters((p) => ({ ...p, eventType: e.target.value }))}
                placeholder="order_placed"
              />
            </FormRow>

            <FormRow label="Source IP">
              <input
                className="form-input"
                type="text"
                value={filters.sourceIp}
                onChange={(e) => setFilters((p) => ({ ...p, sourceIp: e.target.value }))}
                placeholder="1.2.3.4"
              />
            </FormRow>

            <FormRow label="Date">
              <input
                className="form-input"
                type="date"
                value={filters.date}
                onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))}
              />
            </FormRow>

            <FormRow label="Signature">
              <select
                className="form-input"
                value={filters.verified}
                onChange={(e) => setFilters((p) => ({ ...p, verified: e.target.value }))}
              >
                <option value="">All</option>
                <option value="1">Verified</option>
                <option value="0">Not Verified</option>
              </select>
            </FormRow>
          </div>

          <div className="card-actions" style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" onClick={loadLogs} disabled={loading}>
              Apply Filters
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFilters({ eventType: "", sourceIp: "", date: "", verified: "" });
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              disabled={loading}
            >
              Clear
            </button>
            <button type="button" className="btn-secondary" onClick={loadLogs} disabled={loading}>
              <RefreshCw size={16} style={{ marginRight: 6 }} />
              Refresh
            </button>
          </div>
        </div>

        <h2 className="subheading">Webhook Logs</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <div style={{ padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
              <div className="body-text" style={{ margin: 0 }}>
                Total: <strong>{Number(pagination.total || 0).toLocaleString()}</strong>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                  disabled={pagination.page <= 1}
                >
                  Previous
                </button>
                <div style={{ fontSize: "0.9rem" }}>
                  Page <strong>{pagination.page}</strong> / {totalPages}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPagination((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
                  disabled={pagination.page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>

            <table className="basket-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Event Type</th>
                  <th>Source IP</th>
                  <th style={{ textAlign: "center" }}>Signature</th>
                  <th>Time (GMT)</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <code>{log.request_id}</code>
                    </td>
                    <td>{log.event_type}</td>
                    <td>{log.source_ip}</td>
                    <td style={{ textAlign: "center" }}>
                      {log.signature_verified ? (
                        <CheckCircle size={18} style={{ verticalAlign: "middle" }} />
                      ) : (
                        <XCircle size={18} style={{ verticalAlign: "middle" }} />
                      )}
                    </td>
                    <td>{new Date(log.received_at).toLocaleString()}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center" }}>
                      No webhook logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  // -------- Main --------
  return (
    <div id="webhook-admin-container" className="app-container app-content">
      <h1 className="page-title">StockLoyal Primary App Webhook Admin</h1>
      <p className="page-deck">
        Manage StockLoyal's core webhook configuration and monitor incoming events from merchants and brokers.
      </p>

      {/* Tab Buttons - styled like AdminBroker card-actions buttons */}
      <div className="card" style={{ overflowX: "hidden", maxWidth: "100%" }}>
        <div className="card-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={activeTab === "settings" ? "btn-primary" : "btn-secondary"}
            onClick={() => setActiveTab("settings")}
            style={{ width: "auto", padding: "0.5rem 1rem" }}
          >
            <Settings size={16} style={{ marginRight: 6 }} />
            Settings
          </button>

          <button
            type="button"
            className={activeTab === "stats" ? "btn-primary" : "btn-secondary"}
            onClick={() => setActiveTab("stats")}
            style={{ width: "auto", padding: "0.5rem 1rem" }}
          >
            <TrendingUp size={16} style={{ marginRight: 6 }} />
            Stats
          </button>

          <button
            type="button"
            className={activeTab === "logs" ? "btn-primary" : "btn-secondary"}
            onClick={() => setActiveTab("logs")}
            style={{ width: "auto", padding: "0.5rem 1rem" }}
          >
            <Activity size={16} style={{ marginRight: 6 }} />
            Logs
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "settings" && renderSettings()}
      {activeTab === "stats" && renderStats()}
      {activeTab === "logs" && renderLogs()}
    </div>
  );
}

// ---- Shared components ----
function FormRow({ label, children }) {
  return (
    <div className="form-row" style={{ maxWidth: "100%", boxSizing: "border-box" }}>
      {label && <label className="form-label">{label}:</label>}
      <div style={{ maxWidth: "100%", boxSizing: "border-box" }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, subtext, Icon }) {
  return (
    <div className="card" style={{ padding: "0.75rem 1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>{label}</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, marginTop: 2 }}>{value}</div>
          {subtext ? <div style={{ marginTop: 2, fontSize: "0.85rem", opacity: 0.8 }}>{subtext}</div> : null}
        </div>
        {Icon ? <Icon size={26} /> : null}
      </div>
    </div>
  );
}
