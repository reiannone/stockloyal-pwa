// src/pages/PostDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";

// Reuse relative time helper
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

export default function PostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loadingPost, setLoadingPost] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);

  const memberId = localStorage.getItem("memberId");

  async function loadPost() {
    if (!postId) return;
    setLoadingPost(true);
    try {
      const data = await apiGet(`social_get_post.php?post_id=${postId}`);
      if (data?.success) {
        setPost(data.post);
      } else {
        console.error("Failed to load post:", data);
      }
    } catch (err) {
      console.error("Error loading post", err);
    } finally {
      setLoadingPost(false);
    }
  }

  async function loadComments() {
    if (!postId) return;
    setLoadingComments(true);
    try {
      const data = await apiGet(`social_get_comments.php?post_id=${postId}`);
      if (data?.success) {
        setComments(data.comments || []);
      } else {
        console.error("Failed to load comments:", data);
      }
    } catch (err) {
      console.error("Error loading comments", err);
    } finally {
      setLoadingComments(false);
    }
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;

    if (!memberId) {
      alert("Please log in again to post a comment.");
      return;
    }

    try {
      const data = await apiPost("social_add_comment.php", {
        post_id: postId,
        member_id: memberId,
        text: newComment, // matches PHP: $_POST['text']
      });

      if (data?.success) {
        setNewComment("");
        loadComments(); // refresh thread
      } else {
        console.error("Failed to add comment:", data);
        alert(data?.message || "Could not add comment.");
      }
    } catch (err) {
      console.error("Error adding comment", err);
      alert("Error adding comment.");
    }
  }

  useEffect(() => {
    loadPost();
    loadComments();
  }, [postId]);

  if (loadingPost) {
    return (
      <div className="page-container">
        <div style={{ padding: "1rem" }}>Loading…</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="page-container">
        <button
          type="button"
          onClick={() => navigate("/social")}
          className="link-button"
          style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}
        >
          ← Back to community feed
        </button>
        <div className="card" style={{ padding: "1rem" }}>
          Post not found.
        </div>
      </div>
    );
  }

  const createdAt = post.created_at || post.createdAt;
  const headerTitle = post.member_handle || "Community post";
  const mainText = post.text || "";
  const strategyTag = post.strategy_tag || "";
  const pointsUsed = post.points_used;
  const cashValue = post.cash_value;
  const primaryTicker = post.primary_ticker;
  const tickers = Array.isArray(post.tickers) ? post.tickers : [];

  return (
    <div className="page-container" style={{ paddingBottom: 120 }}>
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate("/social")}
        className="link-button"
        style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}
      >
        ← Back to community feed
      </button>

      {/* Post card */}
      <div className="card" style={{ marginBottom: "0.75rem" }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            {headerTitle}
          </div>
          {createdAt && (
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              {formatRelativeTime(createdAt)}
            </div>
          )}
        </div>

        {/* Points / cash / primary ticker line */}
        {(pointsUsed != null || cashValue != null || primaryTicker) && (
          <div style={{ fontSize: "0.9rem", marginBottom: 4 }}>
            {pointsUsed != null && (
              <>
                <strong>{Number(pointsUsed).toLocaleString()} pts</strong>
              </>
            )}
            {cashValue != null && (
              <>
                {" "}
                → ${Number(cashValue).toFixed(2)}
              </>
            )}
            {primaryTicker && (
              <>
                {" "}
                in <strong>{primaryTicker}</strong>
              </>
            )}
          </div>
        )}

        {/* Strategy pill */}
        {strategyTag && (
          <div
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: "0.75rem",
              background: "#eff6ff",
              color: "#1d4ed8",
              marginBottom: 4,
              textTransform: "capitalize",
            }}
          >
            {strategyTag.replace(/_/g, " ")}
          </div>
        )}

        {/* Main text */}
        {mainText && (
          <p
            style={{
              fontSize: "0.85rem",
              margin: "4px 0 6px",
            }}
          >
            {mainText}
          </p>
        )}

        {/* Ticker chips */}
        {tickers.length > 0 && (
          <div
            style={{
              marginTop: 4,
              marginBottom: 4,
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {tickers.map((t) => (
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
      </div>

      {/* Comments card */}
      <div className="card">
        <h3
          className="text-lg font-semibold"
          style={{ fontSize: "1rem", marginBottom: "0.5rem" }}
        >
          Comments
        </h3>

        {loadingComments ? (
          <div
            className="text-gray-500"
            style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}
          >
            Loading comments…
          </div>
        ) : comments.length === 0 ? (
          <div
            className="text-gray-500"
            style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}
          >
            No comments yet.
          </div>
        ) : (
          <div
            style={{
              marginBottom: "0.75rem",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {comments.map((c) => (
              <div
                key={c.id}
                style={{
                  borderBottom: "1px solid #f3f4f6",
                  padding: "6px 0",
                }}
              >
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    marginBottom: 2,
                  }}
                >
                  {c.member_id || "Member"}
                  {c.created_at && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: "0.7rem",
                        color: "#9ca3af",
                      }}
                    >
                      {formatRelativeTime(c.created_at)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.8rem" }}>{c.text}</div>
              </div>
            ))}
          </div>
        )}

        {/* Add comment */}
        <div style={{ marginTop: "0.25rem" }}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment…"
            className="member-form-input"
            rows={3}
            style={{ fontSize: "0.8rem", width: "100%", resize: "vertical" }}
          />
          <button
            type="button"
            onClick={handleAddComment}
            className="btn-primary"
            style={{
              marginTop: "0.5rem",
              fontSize: "0.8rem",
              padding: "6px 12px",
            }}
          >
            Post Comment
          </button>
        </div>
      </div>
    </div>
  );
}
