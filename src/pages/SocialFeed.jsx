// src/pages/SocialFeed.jsx
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost, apiGet } from "../api.js";
import UserAvatar from "../components/UserAvatar";

// Format full date + time for posts/comments
function formatTimestamp(iso) {
  if (!iso) return "";
  // Handle MySQL-style "YYYY-MM-DD HH:MM:SS" safely
  let date = new Date(iso);
  if (Number.isNaN(date.getTime()) && typeof iso === "string") {
    date = new Date(iso.replace(" ", "T"));
  }
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SocialFeed() {
  const [posts, setPosts] = useState([]);
  const [filterType, setFilterType] = useState("all"); // "all" | "liked" | "commented"

  // initial load state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // infinite scroll state
  const LIMIT = 20;
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [expandedCommentsPostId, setExpandedCommentsPostId] = useState(null);
  const [comments, setComments] = useState({});
  const [commentInput, setCommentInput] = useState({});

  const memberId = localStorage.getItem("memberId") || "";

  const navigate = useNavigate();
  const location = useLocation();

  // 🔍 Read ?member_id=XYZ from query string (e.g. from OrderTicker link) – this is the AUTHOR filter
  const params = new URLSearchParams(location.search);
  const filterMemberId = params.get("member_id") || "";

  // Prevent duplicate fetch triggers
  const inflightRef = useRef(false);

  const buildPayload = useCallback(
    (offset) => {
      const payload = {
        filter_type: filterType, // "all" | "liked" | "commented"
        member_id: memberId || undefined, // "me" for likes/comments filters
        offset,
        limit: LIMIT,
      };

      // optional author filter from ticker (?member_id=XYZ)
      if (filterMemberId) payload.author_member_id = filterMemberId;

      return payload;
    },
    [filterType, memberId, filterMemberId]
  );

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError("");
    setHasMore(true);
    setExpandedCommentsPostId(null);

    try {
      const data = await apiPost("social_feed.php", buildPayload(0));

      if (!data.success) {
        setError(data.error || "Failed to load feed.");
        setPosts([]);
        setHasMore(false);
        return;
      }

      const first = data.posts || [];
      setPosts(first);

      // If returned fewer than LIMIT, there may be no more
      setHasMore(first.length >= LIMIT);
    } catch (e) {
      console.error("[SocialFeed] error:", e);
      setError("Network error while loading feed.");
      setPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [buildPayload]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    if (loadingMore) return;
    if (!hasMore) return;
    if (inflightRef.current) return;

    inflightRef.current = true;
    setLoadingMore(true);

    try {
      const offset = posts.length;
      const data = await apiPost("social_feed.php", buildPayload(offset));

      if (!data.success) {
        // don’t wipe existing content — just stop
        setHasMore(false);
        return;
      }

      const next = data.posts || [];
      if (next.length === 0) {
        setHasMore(false);
        return;
      }

      // Avoid duplicates if server returns overlapping pages
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of next) {
          if (!seen.has(p.id)) merged.push(p);
        }
        return merged;
      });

      setHasMore(next.length >= LIMIT);
    } catch (e) {
      console.error("[SocialFeed] loadMore error:", e);
      setHasMore(false);
    } finally {
      inflightRef.current = false;
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore, posts.length, buildPayload]);

  // Initial load + reload when filterType / author filter / memberId changes
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

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
          p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p
        )
      );
    } catch (e) {
      console.error("[SocialFeed] handleAddComment error:", e);
    }
  };

  // 🧠 Optional client-side guard for AUTHOR filter only (likes/comments handled server-side)
  const filteredPosts = useMemo(() => {
    if (!filterMemberId) return posts;
    const fid = filterMemberId.toString().trim().toLowerCase();
    return posts.filter((p) => {
      const pid = (p.member_id ?? "").toString().trim().toLowerCase();
      return pid === fid;
    });
  }, [posts, filterMemberId]);

  const handleClearMemberFilter = () => {
    // Remove ?member_id from URL but stay on /social
    navigate("/social", { replace: true });
  };

  // Infinite scroll sentinel
  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          loadMore();
        }
      },
      { root: null, rootMargin: "200px", threshold: 0.01 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div className="page-container">
      <h2 className="page-title" style={{ textAlign: "center" }}>
        StockLoyal Community
      </h2>
      <p
        style={{
          textAlign: "center",
          marginBottom: "0.75rem",
          fontSize: "0.9rem",
        }}
      >
        See how members are turning everyday points into investment strategies.
      </p>

      {/* 🔎 Banner when filtering by author (from ticker) */}
      {filterMemberId && (
        <div
          className="card"
          style={{
            marginBottom: "0.75rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.8rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fefce8",
            border: "1px solid #facc15",
          }}
        >
          <span>
            Showing posts from{" "}
            <strong style={{ color: "#92400e" }}>{filterMemberId}</strong>
          </span>
          <button
            type="button"
            onClick={handleClearMemberFilter}
            style={{
              fontSize: "0.75rem",
              background: "none",
              border: "none",
              color: "#2563eb",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* 🔽 Interaction filter: All / Liked / Commented */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "0.75rem",
        }}
      >
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="member-form-input"
          style={{ width: "80%", maxWidth: 320, fontSize: "0.85rem" }}
        >
          <option value="all">All community posts</option>
          <option value="liked">Posts I&apos;ve liked</option>
          <option value="commented">Posts I&apos;ve commented on</option>
        </select>
      </div>

      {loading && <p style={{ textAlign: "center" }}>Loading feed…</p>}
      {error && (
        <p className="form-error" style={{ textAlign: "center" }}>
          {error}
        </p>
      )}

      {!loading && !error && filteredPosts.length === 0 && (
        <p style={{ textAlign: "center", fontSize: "0.9rem" }}>
          {filterMemberId
            ? "No posts found for this member."
            : "No posts yet. Be the first to share from your wallet!"}
        </p>
      )}

      <div style={{ marginBottom: 120 }}>
        {filteredPosts.map((post) => (
          <div key={post.id} className="card" style={{ marginBottom: "0.75rem" }}>
            {/* Header row with avatar + name + timestamp */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <UserAvatar
                  src={post.member_avatar || null}
                  size="sm"
                  alt={post.member_handle || post.member_id || "Member"}
                />
                <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  {post.member_handle || post.member_id || "Member"}
                </div>
              </div>

              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                {formatTimestamp(post.created_at)}
              </div>
            </div>

            <div style={{ fontSize: "0.9rem", marginBottom: 4 }}>
              <strong>{Number(post.points_used || 0).toLocaleString()} pts</strong> → $
              {Number(post.cash_value || 0).toFixed(2)} {" worth in securities"}
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
              <div
                style={{
                  marginBottom: 6,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                }}
              >
                {post.tickers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => navigate(`/symbol-chart/${t}`)}
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 6px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: "pointer",
                      color: "#2563eb",
                      fontWeight: 500,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "#eff6ff";
                      e.target.style.borderColor = "#2563eb";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "#fff";
                      e.target.style.borderColor = "#e5e7eb";
                    }}
                  >
                    {t}
                  </button>
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
                  onClick={() => toggleLike(post.id)}
                  style={{
                    fontSize: "0.85rem",
                    background: "none",
                    border: "none",
                    color: "#2563eb",
                    padding: 0,
                    cursor: "pointer",
                  }}
                  aria-label="Like post"
                >
                  👍 {post.like_count}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleComments(post.id)}
                  style={{
                    fontSize: "0.85rem",
                    background: "none",
                    border: "none",
                    color: "#2563eb",
                    padding: 0,
                    cursor: "pointer",
                  }}
                  aria-label="View comments"
                >
                  💬 {post.comment_count}
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/social/post/${post.id}`)}
                style={{
                  fontSize: "0.85rem",
                  background: "none",
                  border: "none",
                  color: "#1d4ed8",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                View post &amp; thread →
              </button>
            </div>

            {/* Comments (inline preview) */}
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
                          {formatTimestamp(c.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.8rem" }}>{c.text}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      marginBottom: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {["🚀", "📈", "📉", "💰", "🎯", "👍", "💪", "🔥", "✅", "❌"].map(
                      (emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() =>
                            setCommentInput((prev) => ({
                              ...prev,
                              [post.id]: (prev[post.id] || "") + emoji + " ",
                            }))
                          }
                          style={{
                            fontSize: "1rem",
                            background: "#f9fafb",
                            border: "1px solid #e5e7eb",
                            borderRadius: 4,
                            padding: "2px 6px",
                            cursor: "pointer",
                            lineHeight: 1,
                          }}
                          title={`Add ${emoji}`}
                        >
                          {emoji}
                        </button>
                      )
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                    <textarea
                      className="member-form-input"
                      placeholder="Add a comment…"
                      value={commentInput[post.id] || ""}
                      onChange={(e) =>
                        setCommentInput((prev) => ({
                          ...prev,
                          [post.id]: e.target.value,
                        }))
                      }
                      rows={3}
                      style={{
                        flex: 1,
                        fontSize: "0.8rem",
                        minHeight: "3.5rem",
                        resize: "vertical",
                      }}
                    />
                    <button
                      type="button"
                      className="refresh-btn"
                      style={{
                        fontSize: "0.75rem",
                        padding: "4px 8px",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => handleAddComment(post.id)}
                    >
                      💬 Post
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Infinite scroll sentinel + status */}
        {!loading && !error && (
          <div ref={sentinelRef} style={{ padding: "10px 0", textAlign: "center" }}>
            {loadingMore && <div style={{ fontSize: "0.85rem" }}>Loading more…</div>}
            {!loadingMore && hasMore && (
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                Keep scrolling to load more
              </div>
            )}
            {!loadingMore && !hasMore && posts.length > 0 && (
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                You&apos;re all caught up ✅
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
