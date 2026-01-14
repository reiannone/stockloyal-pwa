// src/pages/DataQualityCheck.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function DataQualityCheck() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState("");

  const runDataProfile = async () => {
    setLoading(true);
    setError("");
    setProfileData(null);

    try {
      const data = await apiPost("data-quality-check.php", {
        table: "wallet",
        check_type: "full_profile"
      });

      if (!data.success) {
        setError(data.error || "Failed to run data profile");
        return;
      }

      setProfileData(data.profile);
    } catch (err) {
      console.error("Data quality check error:", err);
      setError("Network error while running data profile");
    } finally {
      setLoading(false);
    }
  };

  const getQualityScore = () => {
    if (!profileData) return 0;
    
    const totalFields = profileData.field_analysis?.length || 0;
    if (totalFields === 0) return 0;

    const completenessScore = profileData.completeness_score || 0;
    return Math.round(completenessScore);
  };

  const getScoreColor = (score) => {
    if (score >= 90) return "#22c55e"; // green
    if (score >= 70) return "#f59e0b"; // orange
    return "#ef4444"; // red
  };

  // Navigate to WalletAdmin with affected member IDs
  const goToWalletAdmin = (fieldName) => {
    const issueKey = "missing_" + fieldName;
    const affectedData = profileData.affected_members?.[issueKey];
    
    console.log("goToWalletAdmin called for:", fieldName);
    console.log("Issue key:", issueKey);
    console.log("Affected data:", affectedData);
    console.log("All affected members:", profileData.affected_members);
    
    // Navigate even if we don't have member_ids - WalletAdmin will show all records
    // and the banner will explain the issue
    const memberIds = affectedData?.member_ids || [];
    
    navigate("/wallet-admin", { 
      state: { 
        affectedMembers: memberIds,
        fieldName: fieldName,
        fromDataQuality: true,
        totalAffected: profileData.field_analysis?.find(f => f.field_name === fieldName)?.missing_count || 0
      } 
    });
  };

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Data Quality Check</h1>
      <p className="page-deck">
        Scan the wallet table for data gaps, missing values, and data quality issues.
      </p>

      {/* Run Profile Button */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={runDataProfile}
            disabled={loading}
            style={{ minWidth: "180px" }}
          >
            {loading ? "Scanning..." : "Run Data Profile"}
          </button>
          
          {profileData && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.9rem", color: "#6b7280" }}>
                Data Quality Score:
              </span>
              <span
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  color: getScoreColor(getQualityScore())
                }}
              >
                {getQualityScore()}%
              </span>
            </div>
          )}
        </div>

        {error && (
          <p style={{ color: "#ef4444", marginTop: "1rem", marginBottom: 0 }}>
            {error}
          </p>
        )}
      </div>

      {/* Summary Statistics */}
      {profileData && (
        <>
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 className="subheading" style={{ marginTop: 0 }}>
              Summary Statistics
            </h2>
            
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
              gap: "1rem" 
            }}>
              <StatCard
                label="Total Records"
                value={profileData.total_records?.toLocaleString() || "0"}
                color="#3b82f6"
              />
              <StatCard
                label="Complete Records"
                value={profileData.complete_records?.toLocaleString() || "0"}
                color="#22c55e"
              />
              <StatCard
                label="Incomplete Records"
                value={profileData.incomplete_records?.toLocaleString() || "0"}
                color="#f59e0b"
              />
              <StatCard
                label="Fields Analyzed"
                value={profileData.field_analysis?.length || "0"}
                color="#8b5cf6"
              />
            </div>
          </div>

          {/* Critical Issues */}
          {profileData.critical_issues?.length > 0 && (
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <h2 className="subheading" style={{ marginTop: 0, color: "#dc2626" }}>
                ⚠️ Critical Issues Found
              </h2>
              
              {profileData.critical_issues.map((issue, idx) => {
                const affectedData = profileData.affected_members?.[issue.issue_key];
                const memberIds = affectedData?.member_ids || [];
                const showingCount = affectedData?.showing_count || 0;
                const totalCount = affectedData?.total_count || issue.count;
                
                // Handler to navigate to WalletAdmin with this issue's data
                const handleNavigateToIssue = () => {
                  navigate("/wallet-admin", {
                    state: {
                      affectedMembers: memberIds,
                      fieldName: issue.field,
                      fromDataQuality: true,
                      totalAffected: totalCount
                    }
                  });
                };
                
                return (
                  <div 
                    key={idx} 
                    onClick={handleNavigateToIssue}
                    style={{ 
                      marginBottom: "1rem",
                      padding: "1rem",
                      background: "#fef2f2",
                      border: "1px solid #fca5a5",
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fee2e2";
                      e.currentTarget.style.borderColor = "#f87171";
                      e.currentTarget.style.transform = "translateX(4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fef2f2";
                      e.currentTarget.style.borderColor = "#fca5a5";
                      e.currentTarget.style.transform = "translateX(0)";
                    }}
                  >
                    <div style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <strong style={{ color: "#991b1b" }}>{issue.field}:</strong>{" "}
                        <span style={{ color: "#dc2626" }}>{issue.description}</span>
                        {totalCount && (
                          <span style={{ color: "#7f1d1d", marginLeft: "0.5rem" }}>
                            ({totalCount} records affected)
                          </span>
                        )}
                      </div>
                      <span style={{ 
                        color: "#2563eb",
                        fontSize: "0.85rem",
                        fontWeight: "600"
                      }}>
                        → Fix in WalletAdmin
                      </span>
                    </div>
                    
                    {memberIds.length > 0 && (
                      <details 
                        style={{ marginTop: "0.5rem" }}
                        onClick={(e) => e.stopPropagation()} // Prevent card click when expanding details
                      >
                        <summary 
                          style={{ 
                            cursor: "pointer", 
                            color: "#991b1b",
                            fontSize: "0.9rem",
                            fontWeight: "600",
                            padding: "0.25rem 0"
                          }}
                        >
                          View Affected Member IDs ({showingCount}{showingCount < totalCount ? ` of ${totalCount}` : ''})
                        </summary>
                        
                        <div style={{ 
                          marginTop: "0.5rem",
                          padding: "0.75rem",
                          background: "white",
                          borderRadius: "4px",
                          maxHeight: "200px",
                          overflowY: "auto"
                        }}>
                          {/* Show details for conversion mismatches */}
                          {affectedData?.issue_type === 'data_consistency' && affectedData?.details ? (
                            <table style={{ width: "100%", fontSize: "0.85rem" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                  <th style={{ textAlign: "left", padding: "4px" }}>Member ID</th>
                                  <th style={{ textAlign: "left", padding: "4px" }}>Tier</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Rate</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Points</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Cash Balance</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Expected</th>
                                </tr>
                              </thead>
                              <tbody>
                                {affectedData.details.map((detail, i) => (
                                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "4px" }}>
                                      <code style={{ fontSize: "0.8rem" }}>{detail.member_id}</code>
                                    </td>
                                    <td style={{ padding: "4px", fontSize: "0.75rem", color: "#6b7280" }}>
                                      {detail.member_tier || <span style={{ color: "#9ca3af" }}>-</span>}
                                    </td>
                                    <td style={{ textAlign: "right", padding: "4px", fontSize: "0.75rem" }}>
                                      {detail.effective_rate ? Number(detail.effective_rate).toFixed(4) : detail.base_rate}
                                    </td>
                                    <td style={{ textAlign: "right", padding: "4px" }}>
                                      {Number(detail.points).toLocaleString()}
                                    </td>
                                    <td style={{ textAlign: "right", padding: "4px" }}>
                                      ${Number(detail.cash_balance).toFixed(2)}
                                    </td>
                                    <td style={{ textAlign: "right", padding: "4px", color: "#22c55e" }}>
                                      ${Number(detail.expected_cash).toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : affectedData?.issue_type === 'duplicate_records' && affectedData?.details ? (
                            /* Show details for duplicates */
                            <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
                              {affectedData.details.map((detail, i) => (
                                <li key={i} style={{ marginBottom: "0.25rem" }}>
                                  <code style={{ fontSize: "0.85rem" }}>{detail.member_id}</code>
                                  {" "}
                                  <span style={{ color: "#dc2626", fontSize: "0.85rem" }}>
                                    (appears {detail.dup_count} times)
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : affectedData?.issue_type === 'invalid_format' && affectedData?.details ? (
                            /* Show details for invalid formats (e.g., emails) */
                            <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
                              {affectedData.details.map((detail, i) => (
                                <li key={i} style={{ marginBottom: "0.25rem" }}>
                                  <code style={{ fontSize: "0.85rem" }}>{detail.member_id}</code>
                                  {" → "}
                                  <span style={{ color: "#dc2626", fontSize: "0.85rem" }}>
                                    {detail.member_email || "(empty)"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : affectedData?.issue_type === 'invalid_value' && affectedData?.details ? (
                            /* Show details for invalid values (e.g., negative balances) */
                            <table style={{ width: "100%", fontSize: "0.85rem" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                  <th style={{ textAlign: "left", padding: "4px" }}>Member ID</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Points</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Cash Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {affectedData.details.map((detail, i) => (
                                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "4px" }}>
                                      <code style={{ fontSize: "0.8rem" }}>{detail.member_id}</code>
                                    </td>
                                    <td style={{ 
                                      textAlign: "right", 
                                      padding: "4px",
                                      color: detail.points < 0 ? "#dc2626" : "#374151"
                                    }}>
                                      {Number(detail.points).toLocaleString()}
                                    </td>
                                    <td style={{ 
                                      textAlign: "right", 
                                      padding: "4px",
                                      color: detail.cash_balance < 0 ? "#dc2626" : "#374151"
                                    }}>
                                      ${Number(detail.cash_balance).toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : affectedData?.issue_type === 'outlier' && affectedData?.details ? (
                            /* Show details for outliers */
                            <table style={{ width: "100%", fontSize: "0.85rem" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                  <th style={{ textAlign: "left", padding: "4px" }}>Member ID</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Points</th>
                                  <th style={{ textAlign: "right", padding: "4px" }}>Cash Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {affectedData.details.map((detail, i) => (
                                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                    <td style={{ padding: "4px" }}>
                                      <code style={{ fontSize: "0.8rem" }}>{detail.member_id}</code>
                                    </td>
                                    <td style={{ textAlign: "right", padding: "4px", fontWeight: "600" }}>
                                      {Number(detail.points).toLocaleString()}
                                    </td>
                                    <td style={{ textAlign: "right", padding: "4px", fontWeight: "600" }}>
                                      ${Number(detail.cash_balance).toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : affectedData?.issue_type === 'referential_integrity' && affectedData?.details ? (
                            /* Show details for referential integrity issues */
                            <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
                              {affectedData.details.map((detail, i) => (
                                <li key={i} style={{ marginBottom: "0.25rem" }}>
                                  <code style={{ fontSize: "0.85rem" }}>{detail.member_id}</code>
                                  {" → "}
                                  <span style={{ color: "#dc2626", fontSize: "0.85rem" }}>
                                    merchant_id: {detail.merchant_id}
                                  </span>
                                  {" "}
                                  <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>(not found)</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            /* Simple list for missing data */
                            <div style={{ 
                              display: "flex", 
                              flexWrap: "wrap", 
                              gap: "0.5rem" 
                            }}>
                              {memberIds.map((memberId, i) => (
                                <code 
                                  key={i}
                                  style={{ 
                                    fontSize: "0.85rem",
                                    padding: "2px 6px",
                                    background: "#f3f4f6",
                                    borderRadius: "3px"
                                  }}
                                >
                                  {memberId}
                                </code>
                              ))}
                            </div>
                          )}
                          
                          {showingCount < totalCount && (
                            <p style={{ 
                              marginTop: "0.5rem", 
                              marginBottom: 0,
                              fontSize: "0.8rem", 
                              color: "#6b7280",
                              fontStyle: "italic"
                            }}>
                              Showing first {showingCount} of {totalCount} affected records
                            </p>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Field Analysis */}
          <div className="card">
            <h2 className="subheading" style={{ marginTop: 0 }}>
              Field Analysis
            </h2>

            <div style={{ overflowX: "auto" }}>
              <table className="basket-table">
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th style={{ textAlign: "right" }}>Populated</th>
                    <th style={{ textAlign: "right" }}>Missing</th>
                    <th style={{ textAlign: "right" }}>Completeness</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {profileData.field_analysis?.map((field, idx) => {
                    const completeness = field.completeness_percent || 0;
                    const status = 
                      completeness >= 95 ? "Excellent" :
                      completeness >= 80 ? "Good" :
                      completeness >= 50 ? "Fair" :
                      "Poor";
                    const statusColor =
                      completeness >= 95 ? "#22c55e" :
                      completeness >= 80 ? "#3b82f6" :
                      completeness >= 50 ? "#f59e0b" :
                      "#ef4444";
                    
                    // Check if this field has missing data
                    const hasMissingData = field.missing_count > 0;
                    
                    // Check if we have affected member data for this field
                    const issueKey = "missing_" + field.field_name;
                    const affectedData = profileData.affected_members?.[issueKey];
                    const hasAffectedMembers = affectedData?.member_ids?.length > 0;

                    return (
                      <tr 
                        key={idx}
                        onClick={() => {
                          if (hasMissingData) {
                            console.log("Clicked field:", field.field_name);
                            console.log("Has affected members:", hasAffectedMembers);
                            console.log("Affected data:", affectedData);
                            goToWalletAdmin(field.field_name);
                          }
                        }}
                        style={{ 
                          cursor: hasMissingData ? "pointer" : "default",
                          transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          if (hasMissingData) {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        title={hasMissingData ? `Click to view ${field.missing_count} members with missing ${field.field_name}` : ""}
                      >
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <code style={{ 
                              background: "#f3f4f6", 
                              padding: "2px 6px", 
                              borderRadius: "4px",
                              fontSize: "0.9rem"
                            }}>
                              {field.field_name}
                            </code>
                            {hasMissingData && (
                              <span style={{
                                fontSize: "0.75rem",
                                color: "#3b82f6",
                                fontWeight: "600"
                              }}>
                                {hasAffectedMembers ? "→ View in Admin" : "→ Click to filter"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {field.populated_count?.toLocaleString() || "0"}
                        </td>
                        <td style={{ textAlign: "right", color: field.missing_count > 0 ? "#ef4444" : "#6b7280" }}>
                          {field.missing_count?.toLocaleString() || "0"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "600" }}>
                          {completeness.toFixed(1)}%
                        </td>
                        <td>
                          <span style={{
                            background: `${statusColor}15`,
                            color: statusColor,
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "0.85rem",
                            fontWeight: "600"
                          }}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data Issues by Category */}
          {profileData.issues_by_category && Object.keys(profileData.issues_by_category).length > 0 && (
            <div className="card" style={{ marginTop: "1.5rem" }}>
              <h2 className="subheading" style={{ marginTop: 0 }}>
                Issues by Category
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {Object.entries(profileData.issues_by_category).map(([category, issues]) => (
                  <div key={category}>
                    <h3 style={{ 
                      fontSize: "1rem", 
                      fontWeight: "600", 
                      marginBottom: "0.5rem",
                      color: "#374151"
                    }}>
                      {category} ({issues.length})
                    </h3>
                    <ul style={{ paddingLeft: "1.5rem", marginBottom: 0 }}>
                      {issues.map((issue, idx) => (
                        <li key={idx} style={{ marginBottom: "0.25rem", fontSize: "0.9rem" }}>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {profileData.recommendations?.length > 0 && (
            <div className="card" style={{ marginTop: "1.5rem" }}>
              <h2 className="subheading" style={{ marginTop: 0 }}>
                💡 Recommendations
              </h2>

              <ul style={{ paddingLeft: "1.5rem", marginBottom: 0 }}>
                {profileData.recommendations.map((rec, idx) => (
                  <li key={idx} style={{ marginBottom: "0.5rem", color: "#374151" }}>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Initial State */}
      {!loading && !profileData && !error && (
        <div className="card">
          <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
            <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
              Click "Run Data Profile" to scan the wallet table
            </p>
            <p style={{ fontSize: "0.9rem", marginBottom: 0 }}>
              This will analyze field completeness, identify missing data, and provide recommendations
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for stat cards
function StatCard({ label, value, color }) {
  return (
    <div style={{
      padding: "1rem",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
      background: "#f9fafb"
    }}>
      <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.25rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color }}>
        {value}
      </div>
    </div>
  );
}
