import React, { useMemo, useState, useEffect } from "react";
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
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { updateBroker } = useBroker();

  const memberId = localStorage.getItem("memberId");

  const canSubmit = useMemo(
    () => Boolean(selected && username && password && !submitting),
    [selected, username, password, submitting]
  );

  // ✅ Load existing broker info from wallet
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (data.success && data.wallet) {
          const currentBroker = data.wallet.broker || "";
          const creds = data.broker_credentials || {};
          if (currentBroker) {
            setSelected(currentBroker);
            setUsername(creds.username || "");
            setPassword(creds.password || "");
          }
        }
      } catch (err) {
        console.error("Failed to fetch current broker:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

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
      const selectedBroker = brokers.find((b) => b.id === selected);

      const payload = {
        member_id: memberId,
        broker: selected,
        broker_url: selectedBroker?.url || "",
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

  const selectedBroker = brokers.find((b) => b.id === selected);

  return (
    <div className="page-container">
      <h2 className="page-title">Connect your broker</h2>
      <p className="page-deck">
        Select your broker and enter your existing login to link your investment
        account to your rewards program.
      </p>

      {/* --- Broker logos --- */}
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
              style={{
                border: active ? "3px solid #007bff" : undefined,
                boxShadow: active ? "0 0 8px rgba(0,123,255,0.3)" : undefined,
                transition: "border 0.2s, box-shadow 0.2s",
              }}
            >
              <img src={b.logo} alt={b.name} className="broker-logo" />
            </button>
          );
        })}
      </div>

      {/* --- Security Notice --- */}
      <p className="form-disclosure mt-4">
        <strong>Security Notice:</strong> Your broker login credentials are used
        only to securely connect your brokerage account with StockLoyal. These
        credentials are <u>encrypted and never visible</u> to StockLoyal, the
        merchant, or any third party. They are stored in encrypted form and
        protected to maintain your security and privacy. We do not share your
        login information under any circumstances.
      </p>

      {/* --- Credentials form --- */}
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

      {/* --- Footer --- */}
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
