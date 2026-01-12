// src/pages/CSVFilesBrowser.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import { Download, FolderOpen, File, Calendar, CheckSquare, Square } from "lucide-react";

export default function CSVFilesBrowser() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [filterBroker, setFilterBroker] = useState("");
  const [filterType, setFilterType] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");

  // Load CSV files list
  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await apiPost("list-csv-files.php", {});
      
      if (!res?.success) {
        setError(res?.error || "Failed to load CSV files.");
        setFiles([]);
      } else {
        setFiles(res.files || []);
      }
    } catch (err) {
      console.error("[CSVFilesBrowser] Error loading files:", err);
      setError("Network error while loading CSV files.");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Get unique brokers for filter dropdown
  const brokers = useMemo(() => {
    const brokerSet = new Set(files.map(f => f.broker).filter(Boolean));
    return Array.from(brokerSet).sort();
  }, [files]);

  // Filter and sort files
  const filteredFiles = useMemo(() => {
    let result = [...files];

    // Apply filters
    if (filterBroker) {
      result = result.filter(f => f.broker === filterBroker);
    }
    if (filterType) {
      result = result.filter(f => f.type === filterType);
    }

    // Apply sorting
    switch (sortBy) {
      case "date-desc":
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case "date-asc":
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case "broker":
        result.sort((a, b) => (a.broker || "").localeCompare(b.broker || ""));
        break;
      case "type":
        result.sort((a, b) => (a.type || "").localeCompare(b.type || ""));
        break;
      case "size-desc":
        result.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
        break;
      default:
        break;
    }

    return result;
  }, [files, filterBroker, filterType, sortBy]);

  // Handle file selection
  const toggleFileSelection = (fileId) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Select all filtered files
  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.file_id)));
    }
  };

  // Download single file
  const downloadFile = async (file) => {
    try {
      const apiBase = window.__VITE_API_BASE__ || 'https://api.stockloyal.com/api';
      const downloadUrl = file.url || `${apiBase}/${file.relative_path}`;
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = file.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
      }, 100);
    } catch (err) {
      console.error("[CSVFilesBrowser] Download error:", err);
      alert(`Failed to download ${file.filename}`);
    }
  };

  // Bulk download selected files
  const bulkDownload = async () => {
    if (selectedFiles.size === 0) {
      alert("Please select files to download");
      return;
    }

    const selectedFileObjects = filteredFiles.filter(f => selectedFiles.has(f.file_id));
    
    for (const file of selectedFileObjects) {
      await downloadFile(file);
      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    alert(`Downloaded ${selectedFiles.size} file(s)`);
  };

  // Delete selected files
  const deleteSelected = async () => {
    if (selectedFiles.size === 0) {
      alert("Please select files to delete");
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedFiles.size} file(s)?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost("delete-csv-files.php", {
        file_ids: Array.from(selectedFiles)
      });

      if (res?.success) {
        setSelectedFiles(new Set());
        await loadFiles();
        alert(`Deleted ${selectedFiles.size} file(s)`);
      } else {
        alert(res?.error || "Failed to delete files");
      }
    } catch (err) {
      console.error("[CSVFilesBrowser] Delete error:", err);
      alert("Error deleting files");
    } finally {
      setLoading(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  // Get file type badge color
  const getTypeBadgeColor = (type) => {
    switch (type?.toLowerCase()) {
      case "detail":
      case "details":
        return "#3b82f6";
      case "ach":
      case "payment":
        return "#22c55e";
      case "legacy":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  return (
    <div className="page-container">
      <h2 className="page-title">CSV Files Browser</h2>

      {/* Toolbar */}
      <div style={{ 
        display: "flex", 
        gap: "12px", 
        marginBottom: "20px",
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        {/* Filters */}
        <select
          value={filterBroker}
          onChange={(e) => setFilterBroker(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          <option value="">All Brokers</option>
          {brokers.map(broker => (
            <option key={broker} value={broker}>{broker}</option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          <option value="">All Types</option>
          <option value="detail">Detail</option>
          <option value="ach">ACH</option>
          <option value="legacy">Legacy</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
          <option value="broker">Broker A-Z</option>
          <option value="type">Type</option>
          <option value="size-desc">Largest First</option>
        </select>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          {selectedFiles.size > 0 && (
            <>
              <button
                onClick={bulkDownload}
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Download size={16} />
                Download ({selectedFiles.size})
              </button>
              
              <button
                onClick={deleteSelected}
                className="btn-secondary"
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "6px",
                  backgroundColor: "#ef4444",
                  color: "white"
                }}
              >
                Delete ({selectedFiles.size})
              </button>
            </>
          )}

          <button
            onClick={loadFiles}
            className="btn-secondary"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: "#ef4444", marginBottom: "16px" }}>{error}</p>
      )}

      {/* Files Table */}
      {loading ? (
        <p>Loading CSV files...</p>
      ) : filteredFiles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
          <FolderOpen size={48} style={{ margin: "0 auto 16px" }} />
          <p>No CSV files found</p>
          {(filterBroker || filterType) && (
            <button
              onClick={() => {
                setFilterBroker("");
                setFilterType("");
              }}
              className="btn-secondary"
              style={{ marginTop: "12px" }}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>
                  <button
                    onClick={toggleSelectAll}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    {selectedFiles.size === filteredFiles.length ? (
                      <CheckSquare size={18} />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th>Filename</th>
                <th>Broker</th>
                <th>Type</th>
                <th>Size</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((file) => (
                <tr key={file.file_id}>
                  <td>
                    <button
                      onClick={() => toggleFileSelection(file.file_id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      {selectedFiles.has(file.file_id) ? (
                        <CheckSquare size={18} color="#007bff" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <File size={16} color="#6b7280" />
                      <span>{file.filename}</span>
                    </div>
                  </td>
                  <td>{file.broker || "-"}</td>
                  <td>
                    <span
                      style={{
                        backgroundColor: getTypeBadgeColor(file.type),
                        color: "white",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "500",
                        textTransform: "uppercase"
                      }}
                    >
                      {file.type || "unknown"}
                    </span>
                  </td>
                  <td>{formatFileSize(file.file_size)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#6b7280" }}>
                      <Calendar size={14} />
                      {formatDate(file.created_at)}
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={() => downloadFile(file)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 12px",
                        backgroundColor: "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "13px"
                      }}
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {!loading && filteredFiles.length > 0 && (
        <div style={{ 
          marginTop: "20px", 
          padding: "12px", 
          backgroundColor: "#f9fafb",
          borderRadius: "4px",
          fontSize: "14px",
          color: "#6b7280"
        }}>
          Showing {filteredFiles.length} file(s)
          {selectedFiles.size > 0 && ` • ${selectedFiles.size} selected`}
        </div>
      )}

      {/* Back Button */}
      <div style={{ marginTop: "20px" }}>
        <button
          onClick={() => navigate("/payments-processing")}
          className="btn-secondary"
        >
          ← Back to Payments Processing
        </button>
      </div>
    </div>
  );
}
