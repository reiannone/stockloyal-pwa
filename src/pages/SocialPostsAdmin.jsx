// src/pages/SocialPostsAdmin.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiPost } from "../api.js";

function FormRow({ label, children }) {
  return (
    <div className="form-row">
      {label && <label className="form-label">{label}:</label>}
      {children}
    </div>
  );
}

export default function SocialPostsAdmin() {
  const location = useLocation();

  const [posts, setPosts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Data Quality state ────────────────────────────────────────────────────
  const [fromDataQuality, setFromDataQuality] = useState(false);
  const [affectedRecords, setAffectedRecords] = useState([]); // post_ids
  const [fieldName, setFieldName] = useState("");
  const [totalAffected, setTotalAffected] = useState(0);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterField, setFilterField] = useState("member_id");
  const [filterValue, setFilterValue] = useState("");
  const [filterVisibility, setFilterVisibility] = useState("");
  const [filterDeleted, setFilterDeleted] = useState("0"); // Default: show non-deleted

  const editPanelRef = useRef(null);

  // ── Strategy tag options ──────────────────────────────────────────────────
  const strategyTags = useMemo(
    () => [
      "",
      "growth",
      "value",
      "dividend",
      "tech",
      "healthcare",
      "energy",
      "financial",
      "consumer",
      "industrial",
      "realestate",
      "mixed",
      "other",
    ],
    []
  );

  const fetchPosts = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const data = await apiPost("get-social-posts.php", filters);
      if (data?.posts) setPosts(data.posts);
      else setPosts([]);
    } catch (err) {
      console.error("Error fetching posts:", err);
      alert("Failed to load posts");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Build filters payload (normal mode)
  const buildFilters = useCallback(() => {
    const f = { sort_by: "created_at", sort_dir: "DESC", limit: 200 };
    const v = (filterValue || "").trim();

    switch (filterField) {
      case "member_id":
        if (v) f.member_id = v;
        break;
      case "post_id":
        if (v) f.post_id = parseInt(v, 10);
        break;
      case "strategy_tag":
        if (v) f.strategy_tag = v;
        break;
      case "primary_ticker":
        if (v) f.primary_ticker = v.toUpperCase();
        break;
      case "date": {
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const start = `${v} 00:00:00`;
          const nextDay = new Date(`${v}T00:00:00Z`);
          if (!isNaN(nextDay.getTime())) {
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
            const yyyy = nextDay.getUTCFullYear();
            const mm = String(nextDay.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(nextDay.getUTCDate()).padStart(2, "0");
            const end = `${yyyy}-${mm}-${dd} 00:00:00`;
            f.date_start = start;
            f.date_end = end;
          }
        }
        break;
      }
      default:
        break;
    }

    if (filterVisibility) f.visibility = filterVisibility;
    if (filterDeleted !== "") f.is_deleted = parseInt(filterDeleted, 10);

    return f;
  }, [filterField, filterValue, filterVisibility, filterDeleted]);

  const handleApplyFilter = () => {
    setFromDataQuality(false);
    setAffectedRecords([]);
    setFieldName("");
    setTotalAffected(0);
    setSelected(null);
    fetchPosts(buildFilters());
  };

  const handleClearDQBanner = () => {
    setFromDataQuality(false);
    setAffectedRecords([]);
    setFieldName("");
    setTotalAffected(0);
    setSelected(null);
    fetchPosts(buildFilters());
  };

  const handleEditClick = (post) => {
    setSelected({ ...post });
    setTimeout(() => {
      if (editPanelRef.current) editPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const savePost = async (e) => {
    e.preventDefault();
    if (!selected) return;

    setSaving(true);
    try {
      const payload = { ...selected };
      const resp = await apiPost("save-social-post.php", payload);
      if (!resp?.success) throw new Error(resp?.error || "Save failed");

      alert("Post saved");
      await fetchPosts(buildFilters());
      setSelected(null);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!selected) return;
    if (!window.confirm("Soft delete this post?")) return;

    setSaving(true);
    try {
      const resp = await apiPost("soft-delete-social-post.php", { id: selected.id });
      if (!resp?.success) throw new Error(resp?.error || "Soft delete failed");

      alert("Post soft-deleted");
      await fetchPosts(buildFilters());
      setSelected(null);
    } catch (err) {
      console.error("Soft delete error:", err);
      alert("Failed to soft delete post");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!selected) return;
    if (!window.confirm("Restore this post?")) return;

    setSaving(true);
    try {
      const resp = await apiPost("restore-social-post.php", { id: selected.id });
      if (!resp?.success) throw new Error(resp?.error || "Restore failed");

      alert("Post restored");
      await fetchPosts(buildFilters());
      setSelected(null);
    } catch (err) {
      console.error("Restore error:", err);
      alert("Failed to restore post");
    } finally {
      setSaving(false);
    }
  };

  // Parse DQ params from URL (if routed from data quality page)
  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const dq = params.get("dq");
    const ids = params.get("ids");
    const field = params.get("field");
    const total = params.get("total");

    if (dq === "1") {
      setFromDataQuality(true);
      setFieldName(field || "");
      setTotalAffected(total ? parseInt(total, 10) : 0);

      if (ids) {
        const parsed = ids
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        setAffectedRecords(parsed);
      }
    }
  }, [location.search]);

  // initial load
  useEffect(() => {
    fetchPosts(buildFilters());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputPlaceholder =
    filterField === "member_id"
      ? "e.g. Utah1220"
      : filterField === "post_id"
      ? "e.g. 123"
      : filterField === "strategy_tag"
      ? "e.g. growth"
      : filterField === "primary_ticker"
      ? "e.g. AAPL"
      : filterField === "date"
      ? "YYYY-MM-DD"
      : "Enter value";

  const truncateText = (text, maxLen = 60) => {
    if (!text) return "-";
    return text.length > maxLen ? text.substring(0, maxLen) + "..." : text;
  };

  return (
    <div className="app-container app-content">
      <h1 className="page-title">Social Posts Administration</h1>
      <p className="page-deck">
        View and manage social posts. Filter by member, post id, strategy tag, ticker, date, visibility, and deleted
        status.
      </p>

      {/* Data Quality Banner */}
      {fromDataQuality && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            backgroundColor: "#fef3c7",
            border: "2px solid #f59e0b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: "1.5rem" }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: "#92400e" }}>Data Quality Issue:</strong>{" "}
              <span style={{ color: "#78350f" }}>
                {totalAffected} posts with missing/invalid{" "}
                <code style={{ background: "#fde68a", padding: "2px 6px", borderRadius: "3px" }}>{fieldName}</code>
              </span>
            </div>
            <button type="button" className="btn-secondary" onClick={handleClearDQBanner} style={{ minWidth: 120 }}>
              Clear Filter
            </button>
          </div>
        </div>
      )}

      {/* Filter bar styled like OrdersAdmin / LedgerAdmin */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <label className="form-label">Filter:</label>

          <select
            className="form-input"
            style={{ maxWidth: 220 }}
            value={filterField}
            onChange={(e) => {
              setFilterField(e.target.value);
              setFilterValue("");
            }}
          >
            <option value="member_id">Member ID</option>
            <option value="post_id">Post ID</option>
            <option value="strategy_tag">Strategy Tag</option>
            <option value="primary_ticker">Primary Ticker</option>
            <option value="date">Date (day)</option>
          </select>

          <input
            className="form-input"
            style={{ maxWidth: 260 }}
            type={filterField === "date" ? "date" : "text"}
            placeholder={inputPlaceholder}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
          />

          <select
            className="form-input"
            style={{ maxWidth: 200 }}
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value)}
          >
            <option value="">All Visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>

          <select
            className="form-input"
            style={{ maxWidth: 200 }}
            value={filterDeleted}
            onChange={(e) => setFilterDeleted(e.target.value)}
          >
            <option value="">All</option>
            <option value="0">Active Only</option>
            <option value="1">Deleted Only</option>
          </select>

          <button type="button" className="btn-primary" onClick={handleApplyFilter}>
            Filter
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFilterField("member_id");
              setFilterValue("");
              setFilterVisibility("");
              setFilterDeleted("0");
              setFromDataQuality(false);
              setAffectedRecords([]);
              setFieldName("");
              setTotalAffected(0);
              setSelected(null);
              fetchPosts({ sort_by: "created_at", sort_dir: "DESC", limit: 200, is_deleted: 0 });
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Edit Panel */}
      {selected && (
        <div className="card" style={{ marginBottom: "1rem" }} ref={editPanelRef}>
          <h2 className="subheading" style={{ marginTop: 0 }}>
            Edit Post #{selected.id}{" "}
            {selected.is_deleted === 1 && (
              <span
                style={{
                  marginLeft: "0.5rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  fontSize: "0.85rem",
                  fontWeight: "600",
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  verticalAlign: "middle",
                }}
              >
                DELETED
              </span>
            )}
          </h2>

          <form onSubmit={savePost} className="form-grid">
            <FormRow label="Post ID">
              <input type="text" className="form-input" value={selected.id || ""} disabled />
            </FormRow>

            <FormRow label="Member ID">
              <input
                type="text"
                className="form-input"
                value={selected.member_id || ""}
                onChange={(e) => setSelected({ ...selected, member_id: e.target.value })}
                required
              />
            </FormRow>

            <FormRow label="Text">
              <textarea
                className="form-input"
                rows={4}
                maxLength={500}
                value={selected.text || ""}
                onChange={(e) => setSelected({ ...selected, text: e.target.value })}
                placeholder="Post text (max 500 chars)"
                style={{ resize: "vertical", minHeight: "100px" }}
              />
            </FormRow>

            <FormRow label="Strategy Tag">
              <select
                className="form-input"
                value={selected.strategy_tag || ""}
                onChange={(e) => setSelected({ ...selected, strategy_tag: e.target.value })}
              >
                {strategyTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag || "(none)"}
                  </option>
                ))}
              </select>
            </FormRow>

            <FormRow label="Primary Ticker">
              <input
                type="text"
                className="form-input"
                value={selected.primary_ticker || ""}
                onChange={(e) => setSelected({ ...selected, primary_ticker: e.target.value.toUpperCase() })}
                placeholder="e.g. AAPL"
              />
            </FormRow>

            <FormRow label="Tickers JSON">
              <textarea
                className="form-input"
                rows={3}
                value={selected.tickers_json || ""}
                onChange={(e) => setSelected({ ...selected, tickers_json: e.target.value })}
                placeholder='e.g. ["AAPL","GOOGL","MSFT"]'
                style={{ fontFamily: "monospace", fontSize: "0.9rem" }}
              />
            </FormRow>

            <FormRow label="Points Used">
              <input
                type="number"
                className="form-input"
                value={selected.points_used || 0}
                onChange={(e) => setSelected({ ...selected, points_used: parseInt(e.target.value, 10) || 0 })}
              />
            </FormRow>

            <FormRow label="Cash Value ($)">
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={selected.cash_value || "0.00"}
                onChange={(e) => setSelected({ ...selected, cash_value: e.target.value })}
              />
            </FormRow>

            <FormRow label="Like Count">
              <input
                type="number"
                className="form-input"
                value={selected.like_count || 0}
                onChange={(e) => setSelected({ ...selected, like_count: parseInt(e.target.value, 10) || 0 })}
              />
            </FormRow>

            <FormRow label="Comment Count">
              <input
                type="number"
                className="form-input"
                value={selected.comment_count || 0}
                onChange={(e) => setSelected({ ...selected, comment_count: parseInt(e.target.value, 10) || 0 })}
              />
            </FormRow>

            <FormRow label="Visibility">
              <select
                className="form-input"
                value={selected.visibility || "public"}
                onChange={(e) => setSelected({ ...selected, visibility: e.target.value })}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </FormRow>

            <FormRow label="Created At">
              <input type="text" className="form-input" value={selected.created_at || ""} disabled />
            </FormRow>

            <FormRow label="Updated At">
              <input type="text" className="form-input" value={selected.updated_at || "-"} disabled />
            </FormRow>

            <FormRow label="Member Avatar">
              <textarea
                className="form-input"
                rows={2}
                value={selected.member_avatar || ""}
                onChange={(e) => setSelected({ ...selected, member_avatar: e.target.value })}
                placeholder="Avatar URL or base64"
                style={{ fontSize: "0.85rem" }}
              />
            </FormRow>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1.25rem", gridColumn: "1 / -1" }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Post"}
              </button>

              {selected.is_deleted === 0 ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSoftDelete}
                  disabled={saving}
                  style={{ backgroundColor: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}
                >
                  Soft Delete
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRestore}
                  disabled={saving}
                  style={{ backgroundColor: "#d1fae5", color: "#065f46", borderColor: "#6ee7b7" }}
                >
                  Restore Post
                </button>
              )}

              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Posts Table */}
      <h2 className="subheading">Posts List</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Member ID</th>
                <th>Text</th>
                <th>Strategy</th>
                <th>Ticker</th>
                <th>Points</th>
                <th>Cash</th>
                <th>👍</th>
                <th>💬</th>
                <th>Visibility</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {posts.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: "center", padding: "2rem" }}>
                    No posts found
                  </td>
                </tr>
              ) : (
                posts.map((post) => {
                  const isAffected = fromDataQuality && affectedRecords.includes(String(post.id));
                  const isDeleted = post.is_deleted === 1;
                  return (
                    <tr
                      key={post.id}
                      onClick={() => handleEditClick(post)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isDeleted ? "#f3f4f6" : isAffected ? "#fef2f2" : "transparent",
                        opacity: isDeleted ? 0.6 : 1,
                      }}
                      title={
                        isDeleted
                          ? "⚠️ Deleted - Click to restore"
                          : isAffected
                          ? `⚠️ Missing ${fieldName} - Click to fix`
                          : "Click to edit"
                      }
                    >
                      <td>{post.id}</td>
                      <td>{post.member_id}</td>
                      <td style={{ maxWidth: "200px" }}>{truncateText(post.text, 50)}</td>
                      <td>
                        {post.strategy_tag ? (
                          <span
                            style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                              fontWeight: "600",
                              backgroundColor: "#dbeafe",
                              color: "#1e40af",
                            }}
                          >
                            {post.strategy_tag}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{post.primary_ticker ? <strong>{post.primary_ticker}</strong> : "-"}</td>
                      <td>{post.points_used?.toLocaleString() || 0}</td>
                      <td>{post.cash_value ? `$${parseFloat(post.cash_value).toFixed(2)}` : "-"}</td>
                      <td>{post.like_count || 0}</td>
                      <td>{post.comment_count || 0}</td>
                      <td>
                        <span
                          style={{
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            fontSize: "0.85rem",
                            fontWeight: "600",
                            backgroundColor: post.visibility === "public" ? "#d1fae5" : "#fef3c7",
                            color: post.visibility === "public" ? "#065f46" : "#92400e",
                          }}
                        >
                          {post.visibility}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                        {post.created_at ? new Date(post.created_at).toLocaleString() : "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
