// src/pages/DemoLaunch.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";
import { Settings } from "lucide-react";

/**
 * DemoLaunch - Merchant Loyalty Portal Simulator
 * 
 * Simulates a merchant rewards program interface (like Mastercard/Chase)
 * Uses webhook to properly initialize member sessions in StockLoyal.
 */

export default function DemoLaunch() {
  const navigate = useNavigate();
  
  // Merchant data
  const [merchants, setMerchants] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  
  // Member input (manual entry with suggestions)
  const [memberId, setMemberId] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Points and tier (manual entry)
  const [points, setPoints] = useState("10000");
  const [tier, setTier] = useState("");
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Bulk refresh state
  const [bulkPoints, setBulkPoints] = useState("10000");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkSection, setShowBulkSection] = useState(false);

  // Admin authentication state
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const ADMIN_PASSWORD = "StockLoyal2024!";

  const isAdminAuthenticated = useMemo(() => {
    return localStorage.getItem("adminAuthenticated") === "true";
  }, [showAdminPrompt]);

  // Read optional preset values from query string
  const presets = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      merchantId: params.get("merchant_id") || "",
      memberId: params.get("member_id") || "",
      points: params.get("points") || "",
    };
  }, []);

  // Get selected merchant object
  const selectedMerchant = useMemo(() => {
    return merchants.find(m => m.merchant_id === selectedMerchantId) || null;
  }, [merchants, selectedMerchantId]);

  // Get tier options for selected merchant (from tier1_name through tier6_name)
  const tierOptions = useMemo(() => {
    if (!selectedMerchant) return [];
    const tiers = [];
    for (let i = 1; i <= 6; i++) {
      const name = selectedMerchant[`tier${i}_name`];
      const rate = selectedMerchant[`tier${i}_conversion_rate`];
      if (name) {
        tiers.push({ 
          name, 
          rate: rate ? (parseFloat(rate) * 100).toFixed(2) + '%' : null 
        });
      }
    }
    return tiers;
  }, [selectedMerchant]);

  // Filter members for suggestions
  const filteredMembers = useMemo(() => {
    if (!memberId.trim()) return members.slice(0, 10);
    const search = memberId.toLowerCase();
    return members.filter(m => 
      m.member_id.toLowerCase().includes(search)
    ).slice(0, 10);
  }, [members, memberId]);

  // Load merchants on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet("get-merchants.php");
        if (!data?.success) throw new Error(data?.error || "Failed to load merchants");
        setMerchants(data.merchants || []);
        
        // Use preset or first merchant
        if (presets.merchantId) {
          setSelectedMerchantId(presets.merchantId);
        } else if (data.merchants?.length > 0) {
          setSelectedMerchantId(data.merchants[0].merchant_id);
        }

        // Apply presets
        if (presets.memberId) setMemberId(presets.memberId);
        if (presets.points) setPoints(presets.points);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [presets.merchantId, presets.memberId, presets.points]);

  // Load members when merchant changes (for suggestions)
  useEffect(() => {
    if (!selectedMerchantId) {
      setMembers([]);
      return;
    }

    (async () => {
      setLoadingMembers(true);
      try {
        const data = await apiPost("get-members-by-merchant.php", {
          merchant_id: selectedMerchantId
        });
        if (data?.success && Array.isArray(data.members)) {
          setMembers(data.members);
        } else {
          setMembers([]);
        }
      } catch (e) {
        console.error("Failed to load members:", e);
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    })();

    // Set default tier when merchant changes
    setTier("");
  }, [selectedMerchantId]);

  // Set default tier when tierOptions load
  useEffect(() => {
    if (tierOptions.length > 0 && !tier) {
      setTier(tierOptions[0].name);
    }
  }, [tierOptions, tier]);

  // When user selects a member from suggestions, populate their current values
  const selectMemberSuggestion = (member) => {
    setMemberId(member.member_id);
    setPoints(String(member.points || 10000));
    if (member.member_tier) {
      setTier(member.member_tier);
    }
    setShowSuggestions(false);
  };

  // Launch StockLoyal PWA
  const handleLaunch = async () => {
    const trimmedMemberId = memberId.trim();
    if (!trimmedMemberId || !selectedMerchantId) {
      alert("Please enter a Member ID");
      return;
    }

    const pts = Number(points);
    if (!Number.isFinite(pts) || pts < 0) {
      alert("Please enter valid points");
      return;
    }

    setLaunching(true);
    setError("");
    setSuccessMessage("");

    try {
      const data = await apiPost("demo-inbound.php", {
        merchant_id: selectedMerchantId,
        member_id: trimmedMemberId,
        points: pts,
        tier: tier || undefined,
        action: "earn",
      });

      if (!data?.success) throw new Error(data?.error || "Webhook call failed");

      console.log("[DemoLaunch] Webhook response:", data);

      const redirectPath = data.redirect_url || 
        `/?member_id=${encodeURIComponent(trimmedMemberId)}&merchant_id=${encodeURIComponent(selectedMerchantId)}`;
      const fullUrl = window.location.origin + redirectPath;
      window.open(fullUrl, "_blank");
    } catch (e) {
      setError(e.message);
    } finally {
      setLaunching(false);
    }
  };

  // Bulk refresh all members for merchant
  const refreshAllMembers = async () => {
    const target = Number(bulkPoints);

    if (!selectedMerchantId) return alert("Select a merchant first");
    if (!Number.isFinite(target) || target < 0) {
      return alert("Bulk points must be 0 or a positive number");
    }

    const ok = window.confirm(
      `This will FORCE-SET ALL members of merchant "${selectedMerchantId}" to exactly ${target.toLocaleString()} points.\n\nContinue?`
    );
    if (!ok) return;

    setBulkBusy(true);
    setError("");
    setSuccessMessage("");

    try {
      const data = await apiPost("bulk-refresh-points.php", {
        merchant_id: selectedMerchantId,
        points: target,
        requested_by: "DemoLaunch",
      });
      
      if (!data?.success) throw new Error(data?.error || "Bulk refresh failed");

      setSuccessMessage(
        `Bulk update complete: ${data.updated} updated, ${data.skipped} unchanged`
      );

      // Refresh member list
      const refreshData = await apiPost("get-members-by-merchant.php", {
        merchant_id: selectedMerchantId
      });
      if (refreshData?.success) {
        setMembers(refreshData.members || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  // Format number with commas
  const formatNumber = (n) => Number(n || 0).toLocaleString();

  // Admin authentication handlers
  const handleSettingsClick = () => {
    if (isAdminAuthenticated) {
      navigate("/admin-home");
    } else {
      setShowAdminPrompt(true);
    }
  };

  const handleAdminAuth = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      localStorage.setItem("adminAuthenticated", "true");
      setShowAdminPrompt(false);
      setAdminPassword("");
      setAdminError("");
      navigate("/admin-home");
    } else {
      setAdminError("Incorrect password. Please try again.");
      setAdminPassword("");
    }
  };

  const closeAdminPrompt = () => {
    setShowAdminPrompt(false);
    setAdminPassword("");
    setAdminError("");
  };

  // Get merchant brand color
  const brandColor = selectedMerchant?.primary_color || "#1a365d";
  const accentColor = selectedMerchant?.secondary_color || "#e53e3e";

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <p>Loading rewards program...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, background: `linear-gradient(135deg, ${brandColor} 0%, #1a202c 100%)` }}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          {selectedMerchant?.logo_url ? (
            <img 
              src={selectedMerchant.logo_url} 
              alt={selectedMerchant.merchant_name}
              style={styles.logo}
            />
          ) : (
            <div style={styles.logoPlaceholder}>
              <span style={{ fontSize: "24px" }}>💳</span>
            </div>
          )}
          <div>
            <h1 style={styles.headerTitle}>
              {selectedMerchant?.merchant_name || "Rewards"} Portal
            </h1>
            <p style={styles.headerSubtitle}>Transfer your points to investments</p>
          </div>
        </div>
      </header>

      {/* Main Card */}
      <main style={styles.main}>
        <div style={styles.card}>
          {/* Merchant Selector */}
          <div style={styles.section}>
            <label style={styles.label}>
              <span style={styles.labelIcon}>🏪</span>
              Select Rewards Program
            </label>
            <select
              style={styles.select}
              value={selectedMerchantId}
              onChange={(e) => {
                setSelectedMerchantId(e.target.value);
                setMemberId("");
                setTier("");
              }}
            >
              {merchants.map(m => (
                <option key={m.merchant_id} value={m.merchant_id}>
                  {m.merchant_name}
                </option>
              ))}
            </select>
          </div>

          {/* Member ID Input with Suggestions */}
          <div style={styles.section}>
            <label style={styles.label}>
              <span style={styles.labelIcon}>👤</span>
              Member ID
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                style={styles.input}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Enter member ID or select from list"
              />
              
              {/* Suggestions Dropdown */}
              {showSuggestions && filteredMembers.length > 0 && (
                <div style={styles.suggestions}>
                  {loadingMembers ? (
                    <div style={styles.suggestionItem}>Loading...</div>
                  ) : (
                    filteredMembers.map(m => (
                      <div
                        key={m.member_id}
                        style={styles.suggestionItem}
                        onMouseDown={() => selectMemberSuggestion(m)}
                      >
                        <span style={{ fontWeight: 600 }}>{m.member_id}</span>
                        <span style={{ color: "#718096", marginLeft: "8px" }}>
                          {formatNumber(m.points)} pts
                          {m.member_tier && ` • ${m.member_tier}`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div style={styles.hint}>
              Type to search existing members or enter a new member ID
            </div>
          </div>

          {/* Points Input */}
          <div style={styles.section}>
            <label style={styles.label}>
              <span style={styles.labelIcon}>💰</span>
              Points Available
            </label>
            <input
              type="number"
              style={styles.input}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="Enter points amount"
            />
          </div>

          {/* Tier Selector */}
          {tierOptions.length > 0 && (
            <div style={styles.section}>
              <label style={styles.label}>
                <span style={styles.labelIcon}>⭐</span>
                Member Tier
              </label>
              <select
                style={styles.select}
                value={tier}
                onChange={(e) => setTier(e.target.value)}
              >
                {tierOptions.map(t => (
                  <option key={t.name} value={t.name}>
                    {t.name} {t.rate && `(${t.rate} conversion)`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Summary Card */}
          {memberId.trim() && (
            <div style={{ ...styles.summaryCard, borderColor: accentColor }}>
              <div style={styles.summaryRow}>
                <span>Member:</span>
                <strong>{memberId.trim()}</strong>
              </div>
              <div style={styles.summaryRow}>
                <span>Points:</span>
                <strong style={{ color: accentColor }}>{formatNumber(points)}</strong>
              </div>
              {tier && (
                <div style={styles.summaryRow}>
                  <span>Tier:</span>
                  <strong>{tier}</strong>
                </div>
              )}
              <div style={styles.summaryRow}>
                <span>Program:</span>
                <strong>{selectedMerchant?.merchant_name}</strong>
              </div>
            </div>
          )}

          {/* Messages */}
          {error && (
            <div style={styles.errorMessage}>
              ❌ {error}
            </div>
          )}
          {successMessage && (
            <div style={styles.successMessage}>
              ✅ {successMessage}
            </div>
          )}

          {/* Launch Button */}
          <button
            style={{
              ...styles.launchButton,
              backgroundColor: accentColor,
              opacity: (!memberId.trim() || launching) ? 0.6 : 1,
              cursor: (!memberId.trim() || launching) ? "not-allowed" : "pointer",
            }}
            onClick={handleLaunch}
            disabled={!memberId.trim() || launching}
          >
            {launching ? (
              <>
                <span style={styles.buttonSpinner} />
                Connecting to StockLoyal...
              </>
            ) : (
              <>
                <span style={{ fontSize: "20px", marginRight: "8px" }}>🚀</span>
                Launch StockLoyal
              </>
            )}
          </button>

          <p style={styles.disclaimer}>
            Points will be converted to investment value based on the selected tier's conversion rate.
          </p>

          {/* Bulk Refresh Section (Collapsible) */}
          <div style={styles.bulkSection}>
            <button
              style={styles.bulkToggle}
              onClick={() => setShowBulkSection(!showBulkSection)}
            >
              {showBulkSection ? "▼" : "▶"} Admin: Bulk Points Reset
            </button>
            
            {showBulkSection && (
              <div style={styles.bulkContent}>
                <p style={styles.bulkWarning}>
                  ⚠️ This will force-set ALL members of the selected merchant to the specified points value.
                </p>
                <div style={styles.resetRow}>
                  <input
                    type="number"
                    style={styles.pointsInput}
                    value={bulkPoints}
                    onChange={(e) => setBulkPoints(e.target.value)}
                    placeholder="Points for all members"
                  />
                  <button
                    style={{ 
                      ...styles.resetButton, 
                      backgroundColor: "#c53030",
                      opacity: bulkBusy ? 0.6 : 1 
                    }}
                    onClick={refreshAllMembers}
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? "Processing..." : "Reset All Members"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <p style={{ margin: 0 }}>Powered by <strong>StockLoyal</strong> • Demo Environment</p>
          <button
            onClick={handleSettingsClick}
            style={styles.settingsButton}
            title="Admin Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </footer>

      {/* Admin Password Prompt Modal */}
      {showAdminPrompt && (
        <div style={styles.modalOverlay} onClick={closeAdminPrompt}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Admin Access Required</h3>
            <p style={styles.modalText}>
              Enter the admin password to access admin settings.
            </p>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") handleAdminAuth();
              }}
              placeholder="Admin password"
              style={styles.modalInput}
              autoFocus
            />
            {adminError && (
              <p style={styles.modalError}>{adminError}</p>
            )}
            <div style={styles.modalActions}>
              <button onClick={closeAdminPrompt} style={styles.modalCancelBtn}>
                Cancel
              </button>
              <button onClick={handleAdminAuth} style={styles.modalConfirmBtn}>
                Access Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1a365d 0%, #1a202c 100%)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "20px 24px",
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
  },
  headerContent: {
    maxWidth: "600px",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  logo: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    objectFit: "contain",
    background: "white",
    padding: "4px",
  },
  logoPlaceholder: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    background: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "700",
    color: "white",
  },
  headerSubtitle: {
    margin: "2px 0 0",
    fontSize: "13px",
    color: "rgba(255,255,255,0.8)",
  },
  main: {
    flex: 1,
    padding: "24px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: "480px",
    background: "white",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  section: {
    marginBottom: "20px",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#2d3748",
    marginBottom: "8px",
  },
  labelIcon: {
    fontSize: "16px",
  },
  select: {
    width: "100%",
    padding: "12px 16px",
    fontSize: "15px",
    border: "2px solid #e2e8f0",
    borderRadius: "10px",
    background: "#f7fafc",
    cursor: "pointer",
    transition: "border-color 0.2s",
    outline: "none",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    fontSize: "15px",
    border: "2px solid #e2e8f0",
    borderRadius: "10px",
    background: "#f7fafc",
    outline: "none",
    boxSizing: "border-box",
  },
  hint: {
    fontSize: "11px",
    color: "#a0aec0",
    marginTop: "6px",
  },
  suggestions: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 100,
    maxHeight: "200px",
    overflow: "auto",
  },
  suggestionItem: {
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: "14px",
    borderBottom: "1px solid #f0f0f0",
    transition: "background 0.15s",
  },
  summaryCard: {
    background: "#f7fafc",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "20px",
    border: "2px solid #e53e3e",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    fontSize: "14px",
  },
  errorMessage: {
    padding: "12px 16px",
    background: "#fed7d7",
    color: "#c53030",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "16px",
  },
  successMessage: {
    padding: "12px 16px",
    background: "#c6f6d5",
    color: "#276749",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "16px",
  },
  launchButton: {
    width: "100%",
    padding: "16px 24px",
    fontSize: "16px",
    fontWeight: "700",
    color: "white",
    background: "#e53e3e",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "transform 0.2s, box-shadow 0.2s",
    boxShadow: "0 4px 14px rgba(229, 62, 62, 0.4)",
  },
  buttonSpinner: {
    width: "20px",
    height: "20px",
    border: "3px solid rgba(255,255,255,0.3)",
    borderTopColor: "white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  disclaimer: {
    fontSize: "11px",
    color: "#a0aec0",
    textAlign: "center",
    marginTop: "16px",
    lineHeight: 1.5,
  },
  bulkSection: {
    marginTop: "24px",
    paddingTop: "20px",
    borderTop: "1px dashed #e2e8f0",
  },
  bulkToggle: {
    background: "none",
    border: "none",
    fontSize: "13px",
    fontWeight: "600",
    color: "#718096",
    cursor: "pointer",
    padding: "4px 0",
  },
  bulkContent: {
    marginTop: "12px",
  },
  bulkWarning: {
    fontSize: "12px",
    color: "#c53030",
    background: "#fed7d7",
    padding: "10px 12px",
    borderRadius: "6px",
    marginBottom: "12px",
  },
  resetRow: {
    display: "flex",
    gap: "8px",
  },
  pointsInput: {
    flex: 1,
    padding: "10px 14px",
    fontSize: "15px",
    border: "1px solid #cbd5e0",
    borderRadius: "8px",
    outline: "none",
  },
  resetButton: {
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "600",
    color: "white",
    background: "#718096",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  footer: {
    padding: "16px",
    color: "rgba(255,255,255,0.6)",
    fontSize: "12px",
  },
  footerContent: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
  },
  settingsButton: {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "8px",
    padding: "8px",
    cursor: "pointer",
    color: "rgba(255,255,255,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3000,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "24px",
    maxWidth: "400px",
    width: "90%",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
  },
  modalTitle: {
    margin: "0 0 16px 0",
    fontSize: "18px",
    fontWeight: "600",
    color: "#1a202c",
  },
  modalText: {
    margin: "0 0 16px 0",
    color: "#666",
    fontSize: "14px",
  },
  modalInput: {
    width: "100%",
    padding: "12px",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "12px",
    boxSizing: "border-box",
    outline: "none",
  },
  modalError: {
    color: "#ef4444",
    fontSize: "13px",
    margin: "0 0 12px 0",
  },
  modalActions: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
  },
  modalCancelBtn: {
    padding: "10px 16px",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    backgroundColor: "white",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  modalConfirmBtn: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#3b82f6",
    color: "white",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  },
  loadingCard: {
    background: "white",
    borderRadius: "16px",
    padding: "48px",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid #e2e8f0",
    borderTopColor: "#667eea",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto 16px",
  },
};

// Add keyframes for spinner animation
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('demo-launch-styles');
  if (!existingStyle) {
    const styleSheet = document.createElement("style");
    styleSheet.id = 'demo-launch-styles';
    styleSheet.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleSheet);
  }
}
