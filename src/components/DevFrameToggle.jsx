// src/components/DevFrameToggle.jsx
import React, { useEffect, useState } from "react";

/**
 * DevFrameToggle
 * - Only renders in dev (import.meta.env.DEV)
 * - Toggles `body.dev-frame`
 * - Persists setting in localStorage
 */
const LS_KEY = "devFrameEnabled";

export default function DevFrameToggle() {
  // only render in dev mode
  if (!import.meta.env.DEV) return null;

  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === "1";
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (enabled) {
        document.body.classList.add("dev-frame");
        localStorage.setItem(LS_KEY, "1");
      } else {
        document.body.classList.remove("dev-frame");
        localStorage.removeItem(LS_KEY);
      }
    } catch (e) {
      // ignore storage/dom errors
    }
  }, [enabled]);

  return (
    <button
      type="button"
      className="dev-toggle"
      aria-pressed={enabled}
      title={enabled ? "Disable dev frame preview" : "Enable dev frame preview"}
      onClick={() => setEnabled((v) => !v)}
    >
      <span aria-hidden className="dev-toggle-icon">
        {enabled ? "📱" : "📴"}
      </span>
      <span className="dev-toggle-text" aria-hidden>
        {enabled ? "Dev Frame On" : "Dev Frame Off"}
      </span>
    </button>
  );
}
