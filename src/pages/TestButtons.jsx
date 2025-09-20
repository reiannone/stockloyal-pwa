// src/pages/TestButtons.jsx
import React from "react";

export default function TestButtons() {
  return (
    <div className="p-6 space-y-4 bg-gray-50 min-h-screen flex flex-col items-center justify-center">
      <h2 className="text-xl font-bold mb-6">Button Style Test</h2>

      <button type="button" className="btn-primary">
        Primary Button
      </button>

      <button type="button" className="btn-secondary">
        Secondary Button
      </button>

      <button type="button" className="btn-cta">
        CTA Button
      </button>
    </div>
  );
}
