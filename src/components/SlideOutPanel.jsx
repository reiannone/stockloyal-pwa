// src/components/SlideOutPanel.jsx
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";

export default function SlideOutPanel({
  isOpen,
  onClose,
  title,
  side = "right",
  width = 360,
  zIndex = 2000,
  anchorSelector = ".app-container",
  children,
}) {
  const isLeft = side === "left";
  const [rect, setRect] = useState(null);
  const location = useLocation();

  const getRect = () => {
    const el = document.querySelector(anchorSelector);
    return el ? el.getBoundingClientRect() : null;
  };

  useLayoutEffect(() => {
    if (isOpen) setRect(getRect());
  }, [isOpen, anchorSelector]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => setRect(getRect());
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [isOpen, anchorSelector]);

  // 🔑 Auto-close when navigating to a new route
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
  }, [location]); // runs whenever URL changes

  // Backdrop always mounted
  const backdropStyle = rect && {
    position: "fixed",
    top: 37,
    left: 0,
    width: "100%",
    height: "calc(100vh - 37px)",
    background: "rgba(0,0,0,.4)",
    opacity: isOpen ? 1 : 0,
    transition: "opacity 260ms ease",
    zIndex,
    pointerEvents: isOpen ? "auto" : "none",
  };

  // Drawer always mounted
  const drawerStyle = rect && {
    position: "fixed",
    top: 37,
    bottom: 0,
    [isLeft ? "left" : "right"]: 0,
    width: `${width}px`,
    background: "#fff",
    boxShadow: isLeft
      ? "2px 0 14px rgba(0,0,0,.14)"
      : "-2px 0 14px rgba(0,0,0,.14)",
    borderLeft: isLeft ? "none" : "1px solid rgba(0,0,0,0.06)",
    borderRight: isLeft ? "1px solid rgba(0,0,0,0.06)" : "none",
    transform: `translateX(${isOpen ? "0%" : isLeft ? "-100%" : "100%"})`,
    transition: "transform 280ms cubic-bezier(.2,.7,.3,1)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 37px)",
    zIndex: zIndex + 1,
  };

  const headerStyle = {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  };

  const titleStyle = { margin: 0, fontSize: 16, fontWeight: 600 };
  const closeBtnStyle = {
    appearance: "none",
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    borderRadius: 10,
    padding: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const bodyStyle = {
    flex: 1,
    overflowY: "auto",
    padding: 14,
    background: "#fff",
  };
  
  if (!rect) return null;
  
  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <aside role="dialog" aria-modal="true" style={drawerStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>{title}</h3>
          <button style={closeBtnStyle} onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="slideout-body" style={bodyStyle}>
          {children}
        </div>
      </aside>
    </>
  );
}
