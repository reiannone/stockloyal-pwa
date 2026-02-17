// src/pages/CSVFilesBrowser.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";
import { Download, FolderOpen, Calendar, CheckSquare, Square, RefreshCw, Trash2 } from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";

export default function CSVFilesBrowser() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [filterBroker, setFilterBroker] = useState("");
  const [filterMerchant, setFilterMerchant] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");

  // ConfirmModal state
  const [modal, setModal] = useState({
    show: false, title: "", message: "", details: null,
    confirmText: "Delete", confirmColor: "#ef4444",
    icon: <Trash2 size={20} color="#ef4444" />,
  });
  const pendingAction = useRef(null);
  const closeModal = () => setModal(prev => ({ ...prev, show: false }));

  const handleModalConfirm = () => {
    closeModal();
    if (pendingAction.current) {
      pendingAction.current();
      pendingAction.current = null;
    }
  };

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

  // Get unique merchants for filter dropdown
  const merchants = useMemo(() => {
    const merchantSet = new Set(files.map(f => f.merchant_id).filter(Boolean));
    return Array.from(merchantSet).sort();
  }, [files]);

  // Filter and sort files
  const filteredFiles = useMemo(() => {
    let result = [...files];

    // Apply filters
    if (filterMerchant) {
      result = result.filter(f => f.merchant_id === filterMerchant);
    }
    if (filterBroker) {
      result = result.filter(f => f.broker === filterBroker);
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      result = result.filter(f => new Date(f.created_at) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo + "T23:59:59");
      result = result.filter(f => new Date(f.created_at) <= to);
    }

    // Apply sorting
    switch (sortBy) {
      case "date-desc":
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case "date-asc":
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case "merchant":
        result.sort((a, b) => (a.merchant_id || "").localeCompare(b.merchant_id || ""));
        break;
      case "broker":
        result.sort((a, b) => (a.broker || "").localeCompare(b.broker || ""));
        break;
      case "size-desc":
        result.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
        break;
      default:
        break;
    }

    return result;
  }, [files, filterMerchant, filterBroker, filterDateFrom, filterDateTo, sortBy]);

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
  const deleteSelected = () => {
    if (selectedFiles.size === 0) {
      alert("Please select files to delete");
      return;
    }

    pendingAction.current = async () => {
      setLoading(true);
      try {
        const count = selectedFiles.size;
        const res = await apiPost("delete-csv-files.php", {
          file_ids: Array.from(selectedFiles)
        });

        if (res?.success) {
          setSelectedFiles(new Set());
          await loadFiles();
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

    setModal({
      show: true,
      title: "Delete Files",
      message: `Are you sure you want to delete ${selectedFiles.size} file(s)?`,
      details: "This action cannot be undone.",
      confirmText: `Delete (${selectedFiles.size})`,
      confirmColor: "#ef4444",
      icon: <Trash2 size={20} color="#ef4444" />,
    });
  };

  // Delete single file
  const deleteSingleFile = (file) => {
    pendingAction.current = async () => {
      setLoading(true);
      try {
        const res = await apiPost("delete-csv-files.php", {
          file_ids: [file.file_id]
        });

        if (res?.success) {
          selectedFiles.delete(file.file_id);
          setSelectedFiles(new Set(selectedFiles));
          await loadFiles();
        } else {
          alert(res?.error || "Failed to delete file");
        }
      } catch (err) {
        console.error("[CSVFilesBrowser] Delete error:", err);
        alert("Error deleting file");
      } finally {
        setLoading(false);
      }
    };

    setModal({
      show: true,
      title: "Delete File",
      message: `Delete "${file.filename}"?`,
      details: "This action cannot be undone.",
      confirmText: "Delete",
      confirmColor: "#ef4444",
      icon: <Trash2 size={20} color="#ef4444" />,
    });
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

  return (
    <div className="page-container">
      <ConfirmModal
        show={modal.show}
        title={modal.title}
        message={modal.message}
        details={modal.details}
        confirmText={modal.confirmText}
        confirmColor={modal.confirmColor}
        icon={modal.icon}
        onConfirm={handleModalConfirm}
        onCancel={closeModal}
      />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
      
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
          value={filterMerchant}
          onChange={(e) => setFilterMerchant(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          <option value="">All Merchants</option>
          {merchants.map(merchant => (
            <option key={merchant} value={merchant}>{merchant}</option>
          ))}
        </select>

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

        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          title="From date"
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          title="To date"
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        />

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
          <option value="merchant">Merchant A-Z</option>
          <option value="broker">Broker A-Z</option>
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
            title="Refresh file list"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "40px",
              padding: "8px 12px"
            }}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
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
          {(filterMerchant || filterBroker || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => {
                setFilterMerchant("");
                setFilterBroker("");
                setFilterDateFrom("");
                setFilterDateTo("");
              }}
              className="btn-secondary"
              style={{ marginTop: "12px" }}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: "100%", tableLayout: "auto" }}>
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
                <th style={{ minWidth: "200px" }}>File Details</th>
                <th style={{ width: "120px" }}>Merchant / Broker</th>
                <th style={{ width: "100px" }}>Actions</th>
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
                    {/* Stacked file info */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {/* Filename */}
                      <div>
                        <span style={{ 
                          fontSize: "13px",
                          fontWeight: "500",
                          wordBreak: "break-word",
                          lineHeight: 1.3
                        }}>
                          {file.filename}
                        </span>
                      </div>
                      {/* Size and date below filename */}
                      <div style={{ 
                        display: "flex", 
                        gap: "12px", 
                        fontSize: "12px", 
                        color: "#6b7280",
                        flexWrap: "wrap"
                      }}>
                        <span>{formatFileSize(file.file_size)}</span>
                        <span>•</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Calendar size={12} />
                          {formatDate(file.created_at)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {/* Stacked merchant and broker info */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ 
                        fontSize: "11px",
                        color: "#6b7280",
                        fontWeight: "500"
                      }}>
                        {file.merchant_id || "-"}
                      </span>
                      <span style={{ 
                        fontSize: "13px",
                        fontWeight: "500"
                      }}>
                        {file.broker || "-"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        onClick={() => downloadFile(file)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 10px",
                          backgroundColor: "#007bff",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          whiteSpace: "nowrap"
                        }}
                      >
                        <Download size={14} />
                        <span>Get</span>
                      </button>
                      <button
                        onClick={() => deleteSingleFile(file)}
                        title="Delete file"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "6px 8px",
                          backgroundColor: "transparent",
                          color: "#ef4444",
                          border: "1px solid #fecaca",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
