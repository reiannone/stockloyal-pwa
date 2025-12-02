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
      // ✅ call the new backend endpoint
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
      // ✅ match the working pattern from SocialFeed.jsx
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
      // match what works in SocialFeed: social_add_comment.php expects `text`
      const data = await apiPost("social_add_comment.php", {
        post_id: postId,
        member_id: memberId,
        text: newComment,
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

  if (loadingPost) return <div className="p-4">Loading…</div>;
  if (!post) {
    return (
      <div className="p-4">
        <button
          type="button"
          onClick={() => navigate("/social")}
          className="link-button mb-3 text-sm"
          style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}
        >
          ← Back to community feed
        </button>
        <div>Post not found.</div>
      </div>
    );
  }

  const createdAt = post.created_at || post.createdAt;
  const headerTitle = post.member_handle || "Community post";
  const mainText = post.text || "";

  return (
    <div className="p-4">
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate("/social")}
        className="link-button mb-3 text-sm"
        style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}
      >
        ← Back to community feed
      </button>

      {/* Post header */}
      <h2 className="text-xl font-semibold">{headerTitle}</h2>

      {mainText && (
        <p className="mt-2 text-gray-700" style={{ marginTop: "0.5rem" }}>
          {mainText}
        </p>
      )}

      {createdAt && (
        <div className="text-sm text-gray-500 mt-1">
          Posted {formatRelativeTime(createdAt)}
        </div>
      )}

      {/* Comments */}
      <h3 className="text-lg font-semibold mt-6 mb-2">Comments</h3>

      {loadingComments ? (
        <div className="text-gray-500">Loading comments…</div>
      ) : comments.length === 0 ? (
        <div className="text-gray-500">No comments yet.</div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div
              key={c.id ?? c.comment_id}
              className="p-3 bg-gray-100 rounded-lg"
            >
              <div className="text-sm font-medium">
                {c.member_name || c.author || "Member"}
              </div>
              <div>{c.text || c.comment || c.body}</div>
              <div className="text-xs text-gray-500">
                {formatRelativeTime(c.created_at || c.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add comment */}
      <div className="mt-6">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment…"
          className="w-full p-2 border rounded-lg text-sm"
          rows={3}
        />
        <button
          onClick={handleAddComment}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          Post Comment
        </button>
      </div>
    </div>
  );
}
