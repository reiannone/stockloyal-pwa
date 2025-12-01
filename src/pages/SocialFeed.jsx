// src/pages/SocialFeed.jsx
import React, { useEffect, useState } from "react";
import { apiPost, apiGet } from "../api.js";

function formatRelativeTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr > 1 ? "s" : ""} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

export default function SocialFeed() {
  const [posts, setPosts] = useState([]);
  const [strategyFilter, setStrategyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedCommentsPostId, setExpandedCommentsPostId] = useState(null);
  const [comments, setComments] = useState({});
  const [commentInput, setCommentInput] = useState({});
  const memberId = localStorage.getItem("memberId") || "";

  const STRATEGIES = [
    { value: "", label: "All strategies" },
    { value: "growth_tech", label: "Growth Tech" },
    { value: "index_core", label: "Index Core" },
    { value: "dividends", label: "Dividend Focus" },
    { value: "balanced", label: "Balanced Mix" },
    { value: "crypto_satellite", label: "Crypto Satellite" },
  ];

  const loadFeed = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("social_feed.php", {
        strategy_tag: strategyFilter || undefined,
        offset: 0,
        limit: 20,
      });
      if (!data.success) {
        setError(data.error || "Failed to load feed.");
        setPosts([]);
        return;
      }
      setPosts(data.posts || []);
    } catch (e) {
      console.error("[SocialFeed] error:", e);
      setError("Network error while loading feed.");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [strategyFilter]);

  const toggleLike = async (postId) => {
    if (!memberId) {
      alert("Please log in to like posts.");
      return;
    }
    try {
      const data = await apiPost("social_like_toggle.php", {
        post_id: postId,
        member_id: memberId,
      });
      if (!data.success) return;

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                like_count: p.like_count + (data.liked ? 1 : -1),
                __liked: data.liked,
              }
            : p
        )
      );
    } catch (e) {
      console.error("[SocialFeed] toggleLike error:", e);
    }
  };

  const loadComments = async (postId) => {
    try {
      const res = await apiGet(`social_get_comments.php?post_id=${postId}`);
      if (!res.success) return;
      setComments((prev) => ({
        ...prev,
        [postId]: res.comments || [],
      }));
    } catch (e) {
      console.error("[SocialFeed] loadComments error:", e);
    }
  };

  const handleToggleComments = (postId) => {
    if (expandedCommentsPostId === postId) {
      setExpandedCommentsPostId(null);
      return;
    }
    setExpandedCommentsPostId(postId);
    if (!comments[postId]) {
      loadComments(postId);
    }
  };

  const handleAddComment = async (postId) => {
    if (!memberId) {
      alert("Please log in to comment.");
      return;
    }
    const text = (commentInput[postId] || "").trim();
    if (!text) return;

    try {
      await apiPost("social_add_comment.php", {
        post_id: postId,
        member_id: memberId,
        text,
      });
      setCommentInput((prev) => ({ ...prev, [postId]: "" }));
      await loadComments(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comment_count: p.comment_count + 1 }
            : p
        )
      );
    } catch (e) {
      console.error("[SocialFeed] handleAddComment error:", e);
    }
  };

  return (
    <div className="page-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        StockLoyal Community
      </h2>
      <p style={{ textAlign: "center", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
        See how members are turning everyday points into investment strategies.
      </p>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem" }}>
        <select
          value={strategyFilter}
          onChange={(e) => setStrategyFilter(e.target.value)}
          className="member-form-input"
          style={{ width: "80%", maxWidth: 320, fontSize: "0.85rem" }}
        >
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p style={{ textAlign: "center" }}>Loading feed…</p>}
      {error && (
        <p className="form-error" style={{ textAlign: "center" }}>
          {error}
        </p>
      )}

      {!loading && !error && posts.length === 0 && (
        <p style={{ textAlign: "center", fontSize: "0.9rem" }}>
          No posts yet. Be the first to share from your wallet!
        </p>
      )}

      <div style={{ marginBottom: 120 }}>
        {posts.map((post) => (
          <div key={post.id} className="card" style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {post.member_handle || "Member"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                {formatRelativeTime(post.created_at)}
              </div>
            </div>

            <div style={{ fontSize: "0.9rem", marginBottom: 4 }}>
              <strong>{post.points_used.toLocaleString()} pts</strong> → $
              {post.cash_value.toFixed(2)}
              {post.primary_ticker && (
                <> in <strong>{post.primary_ticker}</strong></>
              )}
            </div>

            {post.strategy_tag && (
              <div
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: "0.75rem",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  marginBottom: 4,
                }}
              >
                {post.strategy_tag.replace(/_/g, " ")}
              </div>
            )}

            {post.text && (
              <p style={{ fontSize: "0.85rem", margin: "4px 0 6px" }}>
                {post.text}
              </p>
            )}

            {Array.isArray(post.tickers) && post.tickers.length > 0 && (
              <div style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {post.tickers.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 6px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <div style={{ display: "flex", gap: 12, fontSize: "0.85rem" }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => toggleLike(post.id)}
                  style={{ fontSize: "0.85rem" }}
                >
                  ❤️ {post.like_count}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => handleToggleComments(post.id)}
                  style={{ fontSize: "0.85rem" }}
                >
                  💬 {post.comment_count}
                </button>
              </div>
            </div>

            {/* Comments */}
            {expandedCommentsPostId === post.id && (
              <div style={{ marginTop: 8 }}>
                <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 6 }}>
                  {(comments[post.id] || []).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        padding: "4px 0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          marginBottom: 2,
                        }}
                      >
                        {c.member_id}
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: "0.7rem",
                            color: "#9ca3af",
                          }}
                        >
                          {formatRelativeTime(c.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.8rem" }}>{c.text}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    className="member-form-input"
                    placeholder="Add a comment…"
                    value={commentInput[post.id] || ""}
                    onChange={(e) =>
                      setCommentInput((prev) => ({
                        ...prev,
                        [post.id]: e.target.value,
                      }))
                    }
                    style={{ flex: 1, fontSize: "0.8rem" }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: "0.8rem", padding: "6px 10px" }}
                    onClick={() => handleAddComment(post.id)}
                  >
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
