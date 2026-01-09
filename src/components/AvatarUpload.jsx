// src/components/AvatarUpload.jsx
import React, { useState, useRef } from "react";
import { Camera, Upload, X } from "lucide-react";
import UserAvatar from "./UserAvatar";

export default function AvatarUpload({ currentAvatar, onAvatarChange, size = "xl" }) {
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5MB");
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setShowPreview(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onAvatarChange(preview);
    setShowPreview(false);
    setPreview(null);
  };

  const handleCancel = () => {
    setShowPreview(false);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    onAvatarChange(null);
  };

  const handleCameraClick = (e) => {
    // CRITICAL: Prevent form submission
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleAvatarClick = (e) => {
    // CRITICAL: Prevent form submission
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  return (
    <>
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Avatar Display */}
        <button
          type="button"
          onClick={handleAvatarClick}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            position: "relative",
          }}
          aria-label="Change profile picture"
        >
          <UserAvatar src={currentAvatar} size={size} alt="Profile" />
          
          {/* Overlay on hover */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: "50%",
              background: "rgba(0, 0, 0, 0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s",
              pointerEvents: "none",
            }}
            className="avatar-overlay"
          >
            <Upload size={24} color="white" style={{ opacity: 0 }} className="upload-icon" />
          </div>
        </button>

        {/* Camera Icon Button */}
        <button
          type="button"
          onClick={handleCameraClick}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#2563eb",
            border: "2px solid white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            transition: "transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
          aria-label="Upload photo"
        >
          <Camera size={20} color="white" strokeWidth={2.5} />
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: "none" }}
          aria-label="Select image file"
        />
      </div>

      {/* Remove button (if avatar exists) */}
      {currentAvatar && (
        <button
          type="button"
          onClick={handleRemove}
          style={{
            marginTop: 12,
            padding: "6px 16px",
            fontSize: "13px",
            background: "transparent",
            border: "1px solid #dc2626",
            borderRadius: 6,
            color: "#dc2626",
            cursor: "pointer",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#dc2626";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#dc2626";
          }}
        >
          Remove Photo
        </button>
      )}

      {/* Preview Modal */}
      {showPreview && preview && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleCancel}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              zIndex: 9998,
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "white",
              borderRadius: 16,
              padding: "24px",
              maxWidth: 400,
              width: "90%",
              zIndex: 9999,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
                Preview Profile Picture
              </h3>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "#6b7280",
                }}
                aria-label="Close preview"
              >
                <X size={24} />
              </button>
            </div>

            {/* Preview Image */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <img
                src={preview}
                alt="Preview"
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "3px solid #e5e7eb",
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Save Photo
              </button>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* CSS for hover effect */}
      <style>{`
        button:hover .avatar-overlay {
          background: rgba(0, 0, 0, 0.4) !important;
        }
        button:hover .upload-icon {
          opacity: 1 !important;
        }
      `}</style>
    </>
  );
}
