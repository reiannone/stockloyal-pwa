// src/pages/Onboard.jsx
// KYC Onboarding form for creating an Alpaca brokerage account
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Loader } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const FUNDING_SOURCES = [
  { value: "employment_income", label: "Employment Income" },
  { value: "investments",       label: "Investments" },
  { value: "inheritance",       label: "Inheritance" },
  { value: "business_income",   label: "Business Income" },
  { value: "savings",           label: "Savings" },
  { value: "family",            label: "Family" },
];

const STEPS = ["Personal Info", "Address", "Financial", "Review"];

export default function Onboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const memberId = localStorage.getItem("memberId");

  // ── Pre-filled from SelectBroker ──
  const passedEmail = location.state?.email || localStorage.getItem("onboard_email") || "";
  const passedBroker = location.state?.broker || localStorage.getItem("broker") || "Alpaca";

  // ── Wizard state ──
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null); // { alpaca_account_id, account_number, account_status }

  // ── Step 1: Personal Info ──
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(passedEmail);
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState(""); // YYYY-MM-DD

  // ── Step 2: Address ──
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country] = useState("USA");

  // ── Step 3: Financial / Disclosures ──
  const [taxId, setTaxId] = useState(""); // SSN
  const [showTaxId, setShowTaxId] = useState(false);
  const [fundingSource, setFundingSource] = useState("employment_income");
  const [isControlPerson, setIsControlPerson] = useState(false);
  const [isAffiliated, setIsAffiliated] = useState(false);
  const [isPep, setIsPep] = useState(false);
  const [familyExposed, setFamilyExposed] = useState(false);

  // Pre-fill from wallet if available
  useEffect(() => {
    (async () => {
      try {
        const res = await apiPost("get-wallet.php", { member_id: memberId });
        if (res?.success && res.wallet) {
          const w = res.wallet;
          if (w.first_name)            setFirstName(w.first_name);
          if (w.middle_name)           setMiddleName(w.middle_name);
          if (w.last_name)             setLastName(w.last_name);
          if (w.member_email)          setEmail(w.member_email);
          if (w.member_address_line1)  setStreet(w.member_address_line1);
          if (w.member_town_city)      setCity(w.member_town_city);
          if (w.member_state)          setState(w.member_state);
          if (w.member_zip)            setZip(w.member_zip);
        }
      } catch (err) {
        console.error("[Onboard] Failed to prefill from wallet:", err);
      }
    })();
  }, [memberId]);

  // ── Validation per step ──
  const validateStep = (stepIdx) => {
    switch (stepIdx) {
      case 0: // Personal Info
        if (!firstName.trim()) return "First name is required";
        if (!lastName.trim())  return "Last name is required";
        if (!email.trim() || !email.includes("@")) return "Valid email is required";
        if (!phone.trim())     return "Phone number is required";
        if (!dob)              return "Date of birth is required";
        // Age check: must be 18+
        const age = getAge(dob);
        if (age < 18) return "You must be at least 18 years old to open a brokerage account";
        return null;
      case 1: // Address
        if (!street.trim()) return "Street address is required";
        if (!city.trim())   return "City is required";
        if (!state)         return "State is required";
        if (!zip.trim())    return "ZIP code is required";
        return null;
      case 2: // Financial
        // Tax ID is optional for sandbox, but recommended
        return null;
      default:
        return null;
    }
  };

  const getAge = (dateStr) => {
    const today = new Date();
    const birth = new Date(dateStr);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  // ── Format phone for display ──
  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // ── Format SSN for display ──
  const formatSSN = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  // ╔═══════════════════════════════════════════════════════╗
  // ║  SUBMIT TO ALPACA                                     ║
  // ╚═══════════════════════════════════════════════════════╝
  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        member_id:                 memberId,
        email,
        first_name:                firstName.trim(),
        middle_name:               middleName.trim(),
        last_name:                 lastName.trim(),
        phone:                     phone.replace(/\D/g, ""),
        date_of_birth:             dob,
        street_address:            street.trim(),
        city:                      city.trim(),
        state,
        postal_code:               zip.trim(),
        country,
        tax_id:                    taxId.replace(/\D/g, ""),
        tax_country:               "USA",
        funding_source:            fundingSource,
        is_control_person:         isControlPerson,
        is_affiliated:             isAffiliated,
        is_politically_exposed:    isPep,
        immediate_family_exposed:  familyExposed,
      };

      const res = await apiPost("alpaca-create-account.php", payload);

      if (res?.already_exists) {
        // Already has an Alpaca account
        localStorage.setItem("alpaca_account_id", res.alpaca_account_id);
        setSuccess({
          alpaca_account_id: res.alpaca_account_id,
          account_status: "EXISTING",
          message: "Your brokerage account is already set up!",
        });
        return;
      }

      if (!res?.success) {
        setError(res?.error || "Failed to create brokerage account. Please check your information and try again.");
        setSubmitting(false);
        return;
      }

      // ✅ Success
      localStorage.setItem("alpaca_account_id", res.alpaca_account_id);
      localStorage.setItem("alpaca_account_number", res.account_number || "");
      localStorage.setItem("broker", passedBroker);

      setSuccess({
        alpaca_account_id: res.alpaca_account_id,
        account_number: res.account_number,
        account_status: res.account_status,
        message: res.message,
      });
    } catch (err) {
      console.error("[Onboard] Submit error:", err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──
  if (success) {
    return (
      <div className="page-container" style={{ textAlign: "center" }}>
        <CheckCircle size={64} color="#16a34a" style={{ margin: "0 auto 16px" }} />
        <h2 className="page-title" style={{ color: "#16a34a" }}>
          Account Created!
        </h2>
        <p style={{ fontSize: "1.05rem", marginBottom: 8 }}>
          {success.message || "Your brokerage account has been created successfully."}
        </p>
        {success.account_number && (
          <p className="caption" style={{ marginBottom: 4 }}>
            Account #: <strong>{success.account_number}</strong>
          </p>
        )}
        <p className="caption" style={{ marginBottom: 24 }}>
          Status: <strong style={{ color: success.account_status === "APPROVED" || success.account_status === "ACTIVE" ? "#16a34a" : "#f59e0b" }}>
            {success.account_status}
          </strong>
        </p>
        {success.account_status === "SUBMITTED" && (
          <p className="form-disclosure" style={{ marginBottom: 24 }}>
            Your account is being reviewed. This typically takes a few moments in sandbox
            mode. You can continue setting up your profile.
          </p>
        )}
        <button
          className="btn-primary"
          onClick={() => navigate("/terms")}
          style={{ maxWidth: 300, margin: "0 auto" }}
        >
          Continue to Terms
        </button>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h2 className="page-title">Open Your Brokerage Account</h2>
      <p className="page-deck">
        Complete the information below to open your investment account with
        Alpaca Securities. This is required by financial regulations.
      </p>

      {/* ── Step indicator ── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: 8,
        marginBottom: 24,
      }}>
        {STEPS.map((label, i) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.8rem",
                fontWeight: 700,
                background: i <= step ? "#2563eb" : "#e5e7eb",
                color: i <= step ? "#fff" : "#9ca3af",
                transition: "all 0.2s",
              }}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span
              style={{
                fontSize: "0.75rem",
                color: i <= step ? "#1f2937" : "#9ca3af",
                fontWeight: i === step ? 700 : 400,
                display: window.innerWidth < 400 ? "none" : "inline",
              }}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{
                width: 20,
                height: 2,
                background: i < step ? "#2563eb" : "#e5e7eb",
                marginLeft: 4,
              }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Error display ── */}
      {error && (
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "10px 14px",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          marginBottom: 16,
        }}>
          <AlertCircle size={18} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ color: "#991b1b", fontSize: "0.9rem" }}>{error}</span>
        </div>
      )}

      {/* ╔═══════════════════════════════════════╗ */}
      {/* ║  STEP 0: Personal Info                ║ */}
      {/* ╚═══════════════════════════════════════╝ */}
      {step === 0 && (
        <div className="form">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">First Name *</label>
              <input
                type="text"
                className="form-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                required
              />
            </div>
            <div>
              <label className="form-label">Last Name *</label>
              <input
                type="text"
                className="form-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label">Middle Name (optional)</label>
            <input
              type="text"
              className="form-input"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder=""
            />
          </div>

          <div>
            <label className="form-label">Email Address *</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="form-label">Phone Number *</label>
            <input
              type="tel"
              className="form-input"
              value={formatPhone(phone)}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="(555) 123-4567"
              required
            />
          </div>

          <div>
            <label className="form-label">Date of Birth *</label>
            <input
              type="date"
              className="form-input"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18))
                .toISOString()
                .split("T")[0]}
              required
            />
          </div>
        </div>
      )}

      {/* ╔═══════════════════════════════════════╗ */}
      {/* ║  STEP 1: Address                      ║ */}
      {/* ╚═══════════════════════════════════════╝ */}
      {step === 1 && (
        <div className="form">
          <div>
            <label className="form-label">Street Address *</label>
            <input
              type="text"
              className="form-input"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="123 Main St"
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">City *</label>
              <input
                type="text"
                className="form-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="San Francisco"
                required
              />
            </div>
            <div>
              <label className="form-label">State *</label>
              <select
                className="form-input"
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
              >
                <option value="">Select...</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">ZIP Code *</label>
              <input
                type="text"
                className="form-input"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="94102"
                maxLength={5}
                required
              />
            </div>
            <div>
              <label className="form-label">Country</label>
              <input
                type="text"
                className="form-input"
                value="United States"
                disabled
              />
            </div>
          </div>
        </div>
      )}

      {/* ╔═══════════════════════════════════════╗ */}
      {/* ║  STEP 2: Financial / Disclosures      ║ */}
      {/* ╚═══════════════════════════════════════╝ */}
      {step === 2 && (
        <div className="form">
          <div>
            <label className="form-label">
              Social Security Number {country === "USA" ? "" : "(optional)"}
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showTaxId ? "text" : "password"}
                className="form-input"
                value={showTaxId ? formatSSN(taxId) : taxId ? "•••-••-" + taxId.slice(-4) : ""}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 9))}
                onFocus={() => setShowTaxId(true)}
                placeholder="XXX-XX-XXXX"
                maxLength={11}
              />
              <span
                onClick={() => setShowTaxId((s) => !s)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  color: "#6b7280",
                }}
              >
                {showTaxId ? "Hide" : "Show"}
              </span>
            </div>
            <p className="caption" style={{ marginTop: 4, fontSize: "0.75rem" }}>
              Required for tax reporting. Securely transmitted to Alpaca Securities.
            </p>
          </div>

          <div>
            <label className="form-label">Primary Funding Source</label>
            <select
              className="form-input"
              value={fundingSource}
              onChange={(e) => setFundingSource(e.target.value)}
            >
              {FUNDING_SOURCES.map((fs) => (
                <option key={fs.value} value={fs.value}>{fs.label}</option>
              ))}
            </select>
          </div>

          <div style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            marginTop: 8,
          }}>
            <p style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 12 }}>
              Regulatory Disclosures
            </p>
            {[
              { label: "I am a control person of a publicly traded company", value: isControlPerson, setter: setIsControlPerson },
              { label: "I am affiliated with a stock exchange or FINRA", value: isAffiliated, setter: setIsAffiliated },
              { label: "I am a politically exposed person", value: isPep, setter: setIsPep },
              { label: "An immediate family member is politically exposed", value: familyExposed, setter: setFamilyExposed },
            ].map((d, i) => (
              <label key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                padding: "6px 0",
                fontSize: "0.85rem",
              }}>
                <input
                  type="checkbox"
                  checked={d.value}
                  onChange={(e) => d.setter(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "#2563eb" }}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ╔═══════════════════════════════════════╗ */}
      {/* ║  STEP 3: Review & Submit              ║ */}
      {/* ╚═══════════════════════════════════════╝ */}
      {step === 3 && (
        <div className="form">
          <div style={{
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: 8,
            padding: 16,
          }}>
            <p style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 12 }}>
              Please review your information
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: "0.9rem" }}>
              <span style={{ color: "#6b7280" }}>Name:</span>
              <span style={{ fontWeight: 600 }}>{firstName} {middleName ? middleName + " " : ""}{lastName}</span>

              <span style={{ color: "#6b7280" }}>Email:</span>
              <span style={{ fontWeight: 600 }}>{email}</span>

              <span style={{ color: "#6b7280" }}>Phone:</span>
              <span style={{ fontWeight: 600 }}>{formatPhone(phone)}</span>

              <span style={{ color: "#6b7280" }}>Date of Birth:</span>
              <span style={{ fontWeight: 600 }}>{dob}</span>

              <span style={{ color: "#6b7280" }}>Address:</span>
              <span style={{ fontWeight: 600 }}>{street}, {city}, {state} {zip}</span>

              <span style={{ color: "#6b7280" }}>SSN:</span>
              <span style={{ fontWeight: 600 }}>{taxId ? "•••-••-" + taxId.slice(-4) : "Not provided"}</span>

              <span style={{ color: "#6b7280" }}>Funding:</span>
              <span style={{ fontWeight: 600 }}>
                {FUNDING_SOURCES.find((f) => f.value === fundingSource)?.label || fundingSource}
              </span>
            </div>
          </div>

          {/* Agreements */}
          <div className="form-disclosure" style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>
              By clicking "Create Account" you agree to:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.85rem" }}>
              <li>Alpaca Securities Customer Agreement</li>
              <li>Alpaca Securities Account Agreement</li>
              <li>Alpaca Securities Margin Agreement</li>
            </ul>
            <p style={{ marginTop: 8, fontSize: "0.8rem", color: "#6b7280" }}>
              Alpaca Securities LLC is a registered broker-dealer and member of
              FINRA/SIPC. Your account is protected by SIPC up to $500,000.
            </p>
          </div>

          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ marginTop: 12 }}
          >
            {submitting ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Loader size={18} className="spin" /> Creating Account...
              </span>
            ) : (
              "Create Account"
            )}
          </button>
        </div>
      )}

      {/* ── Navigation buttons ── */}
      {step < 3 && (
        <div style={{
          display: "flex",
          justifyContent: step === 0 ? "flex-end" : "space-between",
          marginTop: 20,
          gap: 12,
        }}>
          {step > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleBack}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={handleNext}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── Go back to broker select ── */}
      {step === 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate("/select-broker")}
          >
            Back to Broker Selection
          </button>
        </div>
      )}
    </div>
  );
}
