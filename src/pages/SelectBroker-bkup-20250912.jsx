// src/pages/SelectBroker.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config/api";
import { useTheme } from "../context/ThemeContext";
import { useBroker } from "../context/BrokerContext"; // ✅ import context

console.log("SelectBroker.jsx start");
console.log("API_BASE =", API_BASE);

const ASSET = (p) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, "")}`;

const brokers = [
  { id: "Public.com", name: "Public.com", logo: ASSET("/logos/public.png") },
  { id: "Robinhood", name: "Robinhood", logo: ASSET("/logos/robinhood.png") },
  { id: "Fidelity", name: "Fidelity", logo: ASSET("/logos/fidelity.png") },
];

export default function SelectBroker() {
  const [selected, setSelected] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const { changeTheme } = useTheme();
  const { updateBroker } = useBroker(); // ✅ get updater

  const canSubmit = useMemo(
    () => Boolean(selected && username && password && !submitting),
    [selected, username, password, submitting]
  );

  const handleBrokerSelect = (brokerId) => {
    setSelected(brokerId);
    updateBroker(brokerId); // ✅ update context immediately
    if (brokerId === "Public.com") changeTheme("public");
    if (brokerId === "Robinhood") changeTheme("robinhood");
    if (brokerId === "Fidelity") changeTheme("fidelity");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);

    try {
      const form = new FormData();
      form.append("broker", selected);
      form.append("username", username);
      form.append("password", password);
      form.append("memberId", localStorage.getItem("memberId"));

      const resp = await fetch(`${API_BASE}/store-broker-credentials.php`, {
        method: "POST",
        body: form,
      });

      const ct = resp.headers.get("content-type") || "";
      let data;
      if (ct.includes("application/json")) {
        data = await resp.json();
      } else {
        const text = await resp.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { success: resp.ok, message: text };
        }
      }

      if (!resp.ok || data?.success === false) {
        setError(data?.error || data?.message || `Error (HTTP ${resp.status})`);
        return;
      }

      if (data.member_id) {
        localStorage.setItem("memberId", data.member_id);
      }

      updateBroker(selected); // ✅ confirm broker on successful link
      navigate("/wallet");
    } catch (err) {
      console.error(err);
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Connect your broker</h2>
      <p className="text-sm text-gray-600 mb-6">
        Select your broker and enter your existing login to link your investment
        account to your rewards program.
      </p>

      {/* ✅ Broker logos vertically stacked, centered */}
      <div className="flex flex-col space-y-4 mb-6">
        {brokers.map((b) => {
          const active = selected === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => handleBrokerSelect(b.id)}
              disabled={submitting}
              className={`w-full border rounded-lg h-24 flex items-center justify-center transition
                ${active ? "border-blue-600 ring-2 ring-blue-300" : "border-gray-300 hover:border-blue-400"}
                bg-white ${submitting ? "opacity-60 cursor-wait" : ""}`}
            >
              <img src={b.logo} alt={b.name} className="h-12 object-contain" />
            </button>
          );
        })}
      </div>

      {/* Credentials form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Username</label>
          <input
            type="text"
            className="mt-1 w-full p-2 border rounded"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!selected || submitting}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Password</label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              className="mt-1 w-full p-2 border rounded pr-20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!selected || submitting}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              disabled={!selected || submitting}
              className="absolute right-2 top-2 text-sm px-2 py-1 border rounded"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-2 rounded text-white ${
            canSubmit
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          {submitting ? "Linking…" : "Continue"}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={submitting}
          className="text-sm text-gray-500 underline"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
