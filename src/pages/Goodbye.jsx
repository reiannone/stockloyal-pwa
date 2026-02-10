// src/pages/Goodbye.jsx
import React from "react";

export default function Goodbye() {
  return (
    <div className="page-container" style={{ textAlign: "center", paddingTop: "3rem" }}>
      <div
        style={{
          fontSize: "4rem",
          marginBottom: "1rem",
        }}
      >
        👋
      </div>

      <h2 className="page-title" style={{ marginBottom: "0.5rem" }}>
        Goodbye
      </h2>

      <p
        style={{
          fontSize: "1rem",
          color: "#4b5563",
          lineHeight: 1.6,
          maxWidth: 480,
          margin: "0 auto 1.5rem",
        }}
      >
        Your account has been temporarily locked due to too many failed
        credential verification attempts.
      </p>

      <p
        style={{
          fontSize: "0.9rem",
          color: "#6b7280",
          lineHeight: 1.6,
          maxWidth: 480,
          margin: "0 auto 2rem",
        }}
      >
        For the security of your brokerage account, we've paused access.
        Please contact our support team if you believe this is an error or
        need help connecting your broker.
      </p>

      <div
        className="card"
        style={{
          maxWidth: 420,
          margin: "0 auto 2rem",
          padding: "1.25rem",
          background: "#fef2f2",
          border: "1px solid #fecaca",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            color: "#991b1b",
            fontWeight: 600,
          }}
        >
          If you need assistance, please reach out to{" "}
          <a
            href="mailto:support@stockloyal.com"
            style={{ color: "#1e40af", textDecoration: "underline" }}
          >
            support@stockloyal.com
          </a>
        </p>
      </div>

      <p
        style={{
          fontSize: "0.8rem",
          color: "#9ca3af",
        }}
      >
        Thank you for using StockLoyal.
      </p>
    </div>
  );
}
