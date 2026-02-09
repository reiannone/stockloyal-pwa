// src/components/ConfirmModal.jsx
import React from "react";

/**
 * ConfirmModal - Reusable confirmation dialog
 * 
 * Props:
 *   isOpen: boolean - whether modal is visible
 *   title: string - modal title
 *   message: string | JSX - confirmation message
 *   details: string | JSX - optional details box
 *   confirmLabel: string - confirm button text (default: "Confirm")
 *   cancelLabel: string - cancel button text (default: "Cancel", set to null to hide)
 *   variant: "danger" | "warning" | "info" | "success" - button color scheme
 *   confirmColor: string - custom confirm button color (overrides variant)
 *   icon: string - optional emoji icon
 *   onConfirm: function - called when confirm clicked
 *   onCancel: function - called when cancel clicked or overlay clicked
 */
export default function ConfirmModal({
  isOpen,
  show, // alias for isOpen (backwards compatibility)
  title = "Confirm",
  message = "Are you sure?",
  details = null,
  confirmLabel,
  confirmText, // alias for confirmLabel (backwards compatibility)
  cancelLabel,
  cancelText, // alias for cancelLabel (backwards compatibility)
  variant = "info",
  confirmColor = null,
  icon = null,
  onConfirm,
  onCancel,
}) {
  // Support both prop names for backwards compatibility
  const visible = isOpen ?? show ?? false;
  const confirmBtn = confirmText ?? confirmLabel ?? "Confirm";
  const cancelBtn = cancelText ?? cancelLabel ?? "Cancel";

  if (!visible) return null;

  // Variant-based button colors
  const variantColors = {
    danger: "#dc2626",
    warning: "#f59e0b",
    info: "#3b82f6",
    success: "#10b981",
  };

  const btnColor = confirmColor || variantColors[variant] || variantColors.info;

  return (
    <div style={styles.overlay} onClick={cancelBtn ? onCancel : undefined}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>
          {icon && <span style={styles.icon}>{icon}</span>}
          {title}
        </h3>
        
        {typeof message === "string" ? (
          <p style={styles.message}>{message}</p>
        ) : (
          <div style={styles.message}>{message}</div>
        )}

        {details && (
          <div style={styles.details}>
            {details}
          </div>
        )}
        
        <div style={styles.actions}>
          {cancelBtn && (
            <button
              type="button"
              onClick={onCancel}
              style={styles.cancelButton}
            >
              {cancelBtn}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...styles.confirmButton,
              backgroundColor: btnColor,
            }}
          >
            {confirmBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    maxWidth: "500px",
    width: "90%",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
  },
  title: {
    margin: "0 0 16px 0",
    fontSize: "18px",
    fontWeight: "600",
    color: "#1a202c",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  icon: {
    fontSize: "24px",
  },
  message: {
    margin: "0 0 16px 0",
    fontSize: "14px",
    color: "#4a5568",
    lineHeight: 1.5,
  },
  details: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "16px",
    fontSize: "13px",
  },
  actions: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
  },
  cancelButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
    backgroundColor: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.15s",
  },
  confirmButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.15s",
  },
};
