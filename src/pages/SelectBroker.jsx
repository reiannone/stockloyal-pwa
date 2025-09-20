// src/pages/SelectBroker.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBroker } from "../context/BrokerContext";
import { apiPost } from "../api"; // ✅ universal JSON API

const ASSET = (p) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

const brokers = [
  {
    id: "Public.com",
    name: "Public.com",
    logo: ASSET("/logos/public.png"),
    url: "https://public.com/",
  },
  {
    id: "Robinhood",
    name: "Robinhood",
    logo: ASSET("/logos/robinhood.png"),
    url: "https://robinhood.com/",
  },
  {
    id: "Fidelity",
    name: "Fidelity",
    logo: ASSET("/logos/fidelity.png"),
    url: "https://www.fidelity.com/",
  },
  {
    id: "Charles Schwab",
    name: "Charles Schwab",
    logo: ASSET("/logos/schwab.png"),
    url: "https://www.schwab.com/",
  },
  {
    id: "Interactive Brokers",
    name: "Interactive Brokers",
    logo: ASSET("/logos/ibkr.png"),
    url: "https://www.interactivebrokers.com/",
  },
  {
    id: "Betterment",
    name: "Betterment",
    logo: ASSET("/logos/betterment.png"),
    url: "https://www.betterment.com/",
  },
];

export default function SelectBroker() {
  const [selected, setSelected] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const { updateBroker } = useBroker();

  const canSubmit = useMemo(
    () => Boolean(selected && username && password && !submitting),
    [selected, username, password, submitting]
  );

  const handleBrokerSelect = (brokerId) => {
    setSelected(brokerId);
    updateBroker(brokerId);
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  if (!canSubmit) return;
  setError("");
  setSubmitting(true);

  try {
    const memberId = localStorage.getItem("memberId");
    const selectedBroker = brokers.find((b) => b.id === selected);

    const payload = {
      member_id: memberId,
      broker: selected,
      broker_url: selectedBroker?.url || "",  // ✅ include broker_url
      username,
      password,
    };

    console.log("Submitting broker payload:", payload);

    const data = await apiPost("store-broker-credentials.php", payload);

    if (!data.success) {
      setError(data.error || "Failed to link broker");
      return;
    }

    if (data.member_id) {
      localStorage.setItem("memberId", data.member_id);
    }

    updateBroker(selected);
    navigate("/wallet");
  } catch (err) {
    console.error("SelectBroker error:", err);
    setError("Network error — please try again.");
  } finally {
    setSubmitting(false);
  }
};

  // ✅ Find broker name for label
  const selectedBroker = brokers.find((b) => b.id === selected);

  return (
    <div className="page-container">
      <h2 className="heading mb-2">Connect your broker</h2>
      <p className="body-text mb-4">
        Select your broker and enter your existing login to link your investment
        account to your rewards program.
      </p>

      {/* Broker logos stacked */}
      <div className="broker-list">
        {brokers.map((b) => {
          const active = selected === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => handleBrokerSelect(b.id)}
              disabled={submitting}
              className={`broker-card ${active ? "active" : ""} ${
                submitting ? "disabled" : ""
              }`}
            >
              <img src={b.logo} alt={b.name} className="broker-logo" />
            </button>
          );
        })}
      </div>

      {/* Disclosure */}
      <p className="form-disclosure mt-4">
        <strong>Security Notice:</strong> Your broker login credentials are used
        only to securely connect your brokerage account with StockLoyal. These
        credentials are <u>encrypted and never visible</u> to StockLoyal, the
        merchant, or any third party. They are stored in encrypted form and
        protected to maintain your security and privacy. We do not share your
        login information under any circumstances.
      </p>


      {/* Credentials form */}
      <form onSubmit={handleSubmit} className="form">
        <div>
          <label className="form-label">
            {selectedBroker
              ? `Username at ${selectedBroker.name}`
              : "Username"}
          </label>
          <input
            type="text"
            className="form-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!selected || submitting}
            required
          />
        </div>

        <div>
          <label className="form-label">
            {selectedBroker
              ? `Password for ${selectedBroker.name}`
              : "Password"}
          </label>
          <div className="password-wrapper" style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!selected || submitting}
              required
            />
            <img
              src={showPw ? "/icons/hide.png" : "/icons/show.png"}
              alt={showPw ? "Hide password" : "Show password"}
              onClick={() => !submitting && setShowPw((s) => !s)}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "24px",
                height: "24px",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: !selected || submitting ? 0.5 : 1,
              }}
            />
          </div>
        </div>

        <button type="submit" disabled={!canSubmit} className="btn-primary">
          {submitting ? "Linking…" : "Save and Continue"}
        </button>

        {error && <p className="form-error">{error}</p>}
      </form>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={submitting}
          className="btn-secondary"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
