// src/pages/MemberOnboard.jsx
// Unified onboarding wizard — collects member profile + KYC in one flow,
// stores locally in StockLoyal DB and submits to Alpaca for brokerage account.
// Fully responsive for mobile, tablet, and desktop.
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import AvatarUpload from "../components/AvatarUpload.jsx";
import AddressLookup from "../components/AddressLookup.jsx";
import { ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Loader } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────
const US_STATES = [
  { code: "AL", name: "Alabama" },  { code: "AK", name: "Alaska" },
  { code: "AS", name: "American Samoa" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" }, { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },  { code: "GA", name: "Georgia" },
  { code: "GU", name: "Guam" },     { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },    { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },   { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },{ code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },   { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "MP", name: "Northern Mariana Islands" },
  { code: "OH", name: "Ohio" },     { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },   { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },{ code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },     { code: "VT", name: "Vermont" },
  { code: "VI", name: "U.S. Virgin Islands" }, { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },{ code: "WY", name: "Wyoming" },
];

const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },  { code: "DE", name: "Germany" },
  { code: "JP", name: "Japan" },   { code: "CN", name: "China" },
  { code: "IN", name: "India" },   { code: "AU", name: "Australia" },
];

const FUNDING_SOURCES = [
  { value: "employment_income", label: "Employment Income" },
  { value: "investments",       label: "Investments" },
  { value: "inheritance",       label: "Inheritance" },
  { value: "business_income",   label: "Business Income" },
  { value: "savings",           label: "Savings" },
  { value: "family",            label: "Family" },
];

const STEPS = ["Profile", "Address", "Financial", "Review"];

// ── Responsive CSS (injected once) ─────────────────────────────
const RESPONSIVE_STYLE_ID = "member-onboard-responsive";
const RESPONSIVE_CSS = `
  /* ── Base: touch-friendly inputs on ALL screen sizes ── */
  .mob-form .form-input,
  .mob-form .member-form-input,
  .mob-form select,
  .mob-form input[type="text"],
  .mob-form input[type="email"],
  .mob-form input[type="tel"],
  .mob-form input[type="date"],
  .mob-form input[type="password"] {
    width: 100%;
    box-sizing: border-box;
    font-size: 16px;            /* prevents iOS auto-zoom on focus */
    min-height: 44px;           /* Apple HIG minimum touch target  */
    padding: 10px 12px;
  }
  .mob-form .form-label,
  .mob-form .member-form-label {
    font-size: 0.875rem;
    margin-bottom: 4px;
    display: block;
  }
  .mob-form .btn-primary,
  .mob-form .btn-secondary {
    min-height: 44px;
    font-size: 0.95rem;
    padding: 10px 20px;
  }

  /* ── Mobile (≤ 600px) ── */
  @media (max-width: 600px) {
    .mob-container.page-container {
      padding: 12px 10px !important;
    }
    .mob-container .page-title  { font-size: 1.25rem; }
    .mob-container .page-deck   { font-size: 0.85rem; }

    .mob-form .form-input,
    .mob-form .member-form-input,
    .mob-form select,
    .mob-form input[type="text"],
    .mob-form input[type="email"],
    .mob-form input[type="tel"],
    .mob-form input[type="date"],
    .mob-form input[type="password"] {
      font-size: 16px;
      min-height: 48px;
      padding: 12px;
      border-radius: 8px;
    }
    .mob-form .btn-primary,
    .mob-form .btn-secondary {
      width: 100%;
      min-height: 48px;
      font-size: 1rem;
      border-radius: 8px;
    }
    /* Stack nav buttons on small screens */
    .mob-nav-buttons {
      flex-direction: column !important;
    }
    .mob-nav-buttons .btn-primary,
    .mob-nav-buttons .btn-secondary {
      width: 100%;
      justify-content: center;
    }
    /* Review grid — stack labels above values */
    .mob-review-grid {
      grid-template-columns: 1fr !important;
      gap: 2px 0 !important;
    }
    .mob-review-grid .mob-review-label { margin-top: 10px; }
    /* Larger disclosure checkboxes */
    .mob-disclosure-item {
      padding: 10px 0 !important;
      font-size: 0.9rem !important;
    }
    .mob-disclosure-item input[type="checkbox"] {
      width: 22px !important;
      height: 22px !important;
    }
  }
  /* ── Tablet (601–768px) ── */
  @media (min-width: 601px) and (max-width: 768px) {
    .mob-container.page-container { padding: 16px 14px !important; }
  }
`;

// ── Helpers ────────────────────────────────────────────────────
const formatPhone = (val) => {
  const d = val.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
const formatSSN = (val) => {
  const d = val.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};
const getAge = (dateStr) => {
  const today = new Date(), birth = new Date(dateStr);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// ── useIsMobile hook ──────────────────────────────────────────
function useIsMobile(bp = 600) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= bp : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${bp}px)`);
    const h = (e) => setMobile(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", h);
    else mql.addListener(h);
    setMobile(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", h);
      else mql.removeListener(h);
    };
  }, [bp]);
  return mobile;
}

// ════════════════════════════════════════════════════════════════
//  COMPONENT
// ════════════════════════════════════════════════════════════════
export default function MemberOnboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const memberId    = location.state?.memberId || localStorage.getItem("memberId");
  const passedBroker = location.state?.broker  || localStorage.getItem("broker") || "Alpaca";
  const isMobile = useIsMobile(600);

  // ── Inject responsive CSS once ──
  useEffect(() => {
    if (document.getElementById(RESPONSIVE_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = RESPONSIVE_STYLE_ID;
    s.textContent = RESPONSIVE_CSS;
    document.head.appendChild(s);
    return () => { const el = document.getElementById(RESPONSIVE_STYLE_ID); if (el) el.remove(); };
  }, []);

  // Persist memberId from navigation state
  useEffect(() => {
    const sid = location.state?.memberId;
    if (sid && sid !== localStorage.getItem("memberId")) {
      localStorage.setItem("memberId", sid);
      window.dispatchEvent(new Event("member-updated"));
    }
    // When arriving from SelectBroker to create a NEW brokerage account,
    // clear any stale broker_account_id so handleSubmit takes the CREATE path.
    if (location.state?.fromSelectBroker) {
      localStorage.removeItem("broker_account_id");
      localStorage.removeItem("broker_account_number");
    }
  }, [location.state?.memberId, location.state?.fromSelectBroker]);

  // ── Timezone ──
  const localTZ = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
    catch { return "America/New_York"; }
  }, []);

  const timezoneOptions = useMemo(() => {
    try {
      if (typeof Intl.supportedValuesOf === "function") {
        const tzs = Intl.supportedValuesOf("timeZone");
        const us = tzs.filter((z) => z.startsWith("America/"));
        const rest = tzs.filter((z) => !z.startsWith("America/"));
        return [...us.sort(), ...rest.sort()];
      }
    } catch {}
    return [
      "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
      "America/Phoenix","America/Anchorage","Pacific/Honolulu","America/Toronto",
      "Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Asia/Shanghai",
      "Asia/Kolkata","Australia/Sydney","UTC",
    ];
  }, []);

  // ── Wizard ──
  const [step, setStep]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(null);

  // ── Profile (Step 0) ──
  const [avatar, setAvatar]       = useState(null);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState(location.state?.memberEmail || localStorage.getItem("memberEmail") || "");
  const [phone, setPhone]         = useState("");
  const [dob, setDob]             = useState("");

  // ── Address (Step 1) ──
  const [street, setStreet]       = useState("");
  const [street2, setStreet2]     = useState("");
  const [city, setCity]           = useState("");
  const [state, setState]         = useState("");
  const [zip, setZip]             = useState("");
  const [country, setCountry]     = useState("US");
  const [timezone, setTimezone]   = useState("");

  // ── Financial (Step 2) ──
  const [taxId, setTaxId]         = useState("");
  const [showTaxId, setShowTaxId] = useState(false);
  const [fundingSource, setFundingSource] = useState("employment_income");
  const [isControlPerson, setIsControlPerson] = useState(false);
  const [isAffiliated, setIsAffiliated]       = useState(false);
  const [isPep, setIsPep]                     = useState(false);
  const [familyExposed, setFamilyExposed]     = useState(false);

  // ── Merchant context (read-only) ──
  const [merchantInfo, setMerchantInfo] = useState({
    merchant_id:"", merchant_name:"", tier_name:"",
    election_type:"", sweep_percentage:"", broker:"",
  });

  // ── Load wallet ──
  useEffect(() => {
    if (!memberId) { setError("No member ID found — please log in again."); setLoading(false); return; }
    (async () => {
      try {
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (data.success && data.wallet) {
          const w = data.wallet;
          if (w.first_name)           setFirstName(w.first_name);
          if (w.middle_name)          setMiddleName(w.middle_name);
          if (w.last_name)            setLastName(w.last_name);
          if (w.member_email)         setEmail(w.member_email);
          if (w.member_phone)         setPhone(w.member_phone);
          if (w.date_of_birth)        setDob(w.date_of_birth);
          if (w.member_address_line1) setStreet(w.member_address_line1);
          if (w.member_address_line2) setStreet2(w.member_address_line2);
          if (w.member_town_city)     setCity(w.member_town_city);
          if (w.member_state)         setState(w.member_state);
          if (w.member_zip)           setZip(w.member_zip);
          if (w.member_country)       setCountry(w.member_country || "US");
          setTimezone(w.member_timezone || localTZ);
          if (w.funding_source)       setFundingSource(w.funding_source);
          if (w.member_avatar) { setAvatar(w.member_avatar); localStorage.setItem("userAvatar", w.member_avatar); }
          else { setAvatar(null); localStorage.removeItem("userAvatar"); }
          setMerchantInfo({
            merchant_id:      w.merchantId   || w.merchant_id   || "",
            merchant_name:    w.merchantName || w.merchant_name || "",
            tier_name:        w.memberTier   || w.tier_name     || w.current_tier || w.member_tier || w.tier || "",
            election_type:    w.election_type || w.electionType || "",
            sweep_percentage: w.sweep_percentage ?? w.sweepPercentage ?? "",
            broker:           w.broker || "",
          });
        } else { setError(data.error || "Failed to load wallet."); }
      } catch (err) { console.error("MemberOnboard fetch error:", err); setError("Network error while fetching wallet."); }
      finally { setLoading(false); }
    })();
  }, [memberId, localTZ]);

  useEffect(() => { if (!timezone) setTimezone(localTZ); }, [localTZ, timezone]);

  const handleAvatarChange = useCallback((a) => {
    setAvatar(a);
    if (a) localStorage.setItem("userAvatar", a); else localStorage.removeItem("userAvatar");
    window.dispatchEvent(new Event("avatar-updated"));
  }, []);

  // ── Validation ──
  const validateStep = (idx) => {
    switch (idx) {
      case 0:
        if (!firstName.trim()) return "First name is required";
        if (!lastName.trim())  return "Last name is required";
        if (!email.trim() || !email.includes("@")) return "Valid email is required";
        if (!phone.trim())     return "Phone number is required";
        if (!dob)              return "Date of birth is required";
        if (getAge(dob) < 18)  return "You must be at least 18 years old to open a brokerage account";
        return null;
      case 1:
        if (!street.trim()) return "Street address is required";
        if (!city.trim())   return "City is required";
        if (!state)         return "State is required";
        if (!zip.trim())    return "ZIP code is required";
        return null;
      case 2: return null;
      default: return null;
    }
  };

  const handleNext = () => {
    const e = validateStep(step);
    if (e) { setError(e); return; }
    setError(""); setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleBack = () => {
    setError(""); setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ╔═══════════════════════════════════════════════════════════════╗
  // ║  SUBMIT — Save to StockLoyal DB + Create OR Update Alpaca   ║
  // ╚═══════════════════════════════════════════════════════════════╝
  const handleSubmit = async () => {
    setError(""); setSubmitting(true);
    try {
      // ── 1. Save profile to StockLoyal DB ──
      const walletPayload = {
        member_id: memberId, first_name: firstName.trim(), middle_name: middleName.trim(),
        last_name: lastName.trim(), member_email: email.trim(),
        member_phone: phone.replace(/\D/g, ""), date_of_birth: dob,
        member_address_line1: street.trim(), member_address_line2: street2.trim(),
        member_town_city: city.trim(), member_state: state, member_zip: zip.trim(),
        member_country: country, member_timezone: timezone,
        funding_source: fundingSource, member_avatar: avatar,
      };
      const walletRes = await apiPost("update_wallet.php", walletPayload);
      if (!walletRes?.success) { setError(walletRes?.error || "Failed to save profile."); setSubmitting(false); return; }

      localStorage.setItem("memberEmail", email.trim());
      if (firstName) localStorage.setItem("userName", firstName.trim());
      if (memberId) { localStorage.setItem("memberId", memberId); window.dispatchEvent(new Event("member-updated")); }

      // ── 2. Build Alpaca payload (shared by create & update) ──
      const alpacaPayload = {
        member_id: memberId, email: email.trim(), first_name: firstName.trim(),
        middle_name: middleName.trim(), last_name: lastName.trim(),
        phone: phone.replace(/\D/g, ""), date_of_birth: dob,
        street_address: street.trim(), city: city.trim(), state,
        postal_code: zip.trim(), country: country === "US" ? "USA" : country,
        tax_id: taxId.replace(/\D/g, ""), tax_country: "USA",
        funding_source: fundingSource, is_control_person: isControlPerson,
        is_affiliated: isAffiliated, is_politically_exposed: isPep,
        immediate_family_exposed: familyExposed,
      };

      // ── 3. Route: UPDATE existing account or CREATE new one ──
      const existingAccountId = localStorage.getItem("broker_account_id");

      if (existingAccountId) {
        // ── UPDATE path — sync profile changes to Alpaca ──
        alpacaPayload.broker_account_id = existingAccountId;
        const updateRes = await apiPost("alpaca-update-account.php", alpacaPayload);

        if (!updateRes?.success) {
          // Non-fatal: local DB already saved, warn but don't block
          console.warn("[MemberOnboard] Alpaca update failed:", updateRes?.error);
          setError(updateRes?.error || "Profile saved locally, but brokerage account update failed. Your broker profile may be out of sync.");
          setSubmitting(false); return;
        }
        setSuccess({
          broker_account_id: existingAccountId,
          account_status: updateRes.account_status || "UPDATED",
          message: updateRes.message || "Profile and brokerage account updated!",
        });
      } else {
        // ── CREATE path — first-time brokerage account ──
        const alpacaRes = await apiPost("alpaca-create-account.php", alpacaPayload);

        if (alpacaRes?.already_exists) {
          localStorage.setItem("broker_account_id", alpacaRes.broker_account_id);
          localStorage.setItem("broker", passedBroker);
          setSuccess({ broker_account_id: alpacaRes.broker_account_id, account_status: "EXISTING", message: "Your brokerage account is already set up!" });
          return;
        }
        if (!alpacaRes?.success) {
          setError(alpacaRes?.error || "Profile saved, but brokerage account creation failed. Please try again.");
          setSubmitting(false); return;
        }
        localStorage.setItem("broker_account_id", alpacaRes.broker_account_id);
        localStorage.setItem("broker_account_number", alpacaRes.account_number || "");
        localStorage.setItem("broker", passedBroker);
        setSuccess({ broker_account_id: alpacaRes.broker_account_id, account_number: alpacaRes.account_number, account_status: alpacaRes.account_status, message: alpacaRes.message });
      }
    } catch (err) {
      console.error("[MemberOnboard] Submit error:", err);
      setError("Network error. Please check your connection and try again.");
    } finally { setSubmitting(false); }
  };

  // ── Responsive grid style objects ──
  const twoCol  = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 10 : 12, overflow: "hidden" };
  const merchGrid = { display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: isMobile ? 8 : 12 };

  // ── Loading ──
  if (loading) {
    return (
      <div className="page-container mob-container">
        <h2 className="page-title">Member Onboarding</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 0" }}>
          <Loader size={20} className="spin" /><span>Loading profile...</span>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (success) {
    return (
      <div className="page-container mob-container" style={{ textAlign: "center" }}>
        <CheckCircle size={isMobile ? 48 : 64} color="#16a34a" style={{ margin: "0 auto 16px" }} />
        <h2 className="page-title" style={{ color: "#16a34a" }}>Account Created!</h2>
        <p style={{ fontSize: isMobile ? "0.95rem" : "1.05rem", marginBottom: 8, padding: "0 8px" }}>
          {success.message || "Your profile has been saved and brokerage account created successfully."}
        </p>
        {success.account_number && (
          <p className="caption" style={{ marginBottom: 4 }}>Account #: <strong>{success.account_number}</strong></p>
        )}
        <p className="caption" style={{ marginBottom: 24 }}>
          Status: <strong style={{ color: ["APPROVED","ACTIVE","EXISTING"].includes(success.account_status) ? "#16a34a" : "#f59e0b" }}>
            {success.account_status}
          </strong>
        </p>
        {success.account_status === "SUBMITTED" && (
          <p className="form-disclosure" style={{ marginBottom: 24, padding: "0 8px" }}>
            Your account is being reviewed. This typically takes a few moments in sandbox mode.
          </p>
        )}
        <button className="btn-primary" onClick={() => navigate("/terms")}
          style={{ maxWidth: 300, margin: "0 auto", width: isMobile ? "100%" : "auto" }}>
          Continue to Terms
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div className="page-container mob-container">
      <h2 className="page-title">Member Onboarding</h2>
      <p className="page-deck" style={{ marginBottom: isMobile ? 16 : 20 }}>
        Complete your profile and open your brokerage account in one step.
        All information is securely stored and transmitted to Alpaca Securities.
      </p>

      {/* ── Step Indicator ── */}
      <div style={{ display:"flex", justifyContent:"center", gap: isMobile?4:8, marginBottom: isMobile?16:24, flexWrap:"nowrap", overflow:"hidden" }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap: isMobile?2:4 }}>
            <div style={{
              width: isMobile?24:28, height: isMobile?24:28, borderRadius:"50%",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize: isMobile?"0.7rem":"0.8rem", fontWeight:700,
              background: i<=step?"#2563eb":"#e5e7eb", color: i<=step?"#fff":"#9ca3af",
              transition:"all 0.2s", flexShrink:0,
            }}>
              {i < step ? "✓" : i + 1}
            </div>
            <span style={{
              fontSize: isMobile?"0.65rem":"0.75rem",
              color: i<=step?"#1f2937":"#9ca3af",
              fontWeight: i===step?700:400, whiteSpace:"nowrap",
            }}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ width: isMobile?12:20, height:2, background: i<step?"#2563eb":"#e5e7eb", marginLeft: isMobile?2:4, flexShrink:0 }}/>
            )}
          </div>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          display:"flex", alignItems:"flex-start", gap:8,
          padding: isMobile?"10px 12px":"10px 14px", background:"#fef2f2",
          border:"1px solid #fecaca", borderRadius:8, marginBottom:16,
        }}>
          <AlertCircle size={18} color="#dc2626" style={{ marginTop:1, flexShrink:0 }}/>
          <span style={{ color:"#991b1b", fontSize:"0.9rem" }}>{error}</span>
        </div>
      )}

      {/* ╔═══════════════════════════════════════╗ */}
      {/* ║  STEP 0: Profile                      ║ */}
      {/* ╚═══════════════════════════════════════╝ */}
      {step === 0 && (
        <div className="form mob-form">
          {/* Avatar */}
          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center",
            padding: isMobile?"16px 0":"20px 0",
            borderBottom:"2px solid #e5e7eb", marginBottom: isMobile?16:20,
          }}>
            <label style={{ fontSize: isMobile?"14px":"16px", fontWeight:"600", color:"#111827", marginBottom:12 }}>
              Profile Picture
            </label>
            <AvatarUpload currentAvatar={avatar} onAvatarChange={handleAvatarChange} size={isMobile?"lg":"xl"} />
            <p style={{ fontSize:"13px", color:"#6b7280", marginTop:12, textAlign:"center", maxWidth:280, padding:"0 8px" }}>
              Upload a profile picture to personalize your account and social comments
            </p>
          </div>

          {/* Member ID */}
          <div>
            <label className="form-label">Member ID</label>
            <input value={memberId||""} disabled className="form-input" style={{ background:"#f3f4f6" }}/>
          </div>

          {/* Merchant Info */}
          {merchantInfo.merchant_name && (
            <div style={{ background:"#f9fafb", padding: isMobile?12:16, borderRadius:8, border:"1px solid #e5e7eb", marginBottom:12 }}>
              <h3 style={{ fontSize: isMobile?"12px":"14px", fontWeight:"600", color:"#374151", marginBottom: isMobile?8:12, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                Merchant & Account Info
              </h3>
              <div style={merchGrid}>
                {[
                  { label:"Merchant", value: merchantInfo.merchant_name||"-" },
                  { label:"Tier",     value: merchantInfo.tier_name||"-" },
                  { label:"Broker",   value: merchantInfo.broker||passedBroker||"-" },
                  { label:"Sweep",    value: merchantInfo.sweep_percentage!==""?`${merchantInfo.sweep_percentage}%`:"-" },
                ].map((f,i)=>(
                  <div key={i}>
                    <label style={{ fontSize:"12px", color:"#6b7280", display:"block", marginBottom:4 }}>{f.label}</label>
                    <input value={f.value} disabled className="form-input"
                      style={{ background:"#f3f4f6", cursor:"not-allowed", fontSize: isMobile?"13px":"inherit" }}/>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div style={twoCol}>
            <div style={{ minWidth:0 }}>
              <label className="form-label">First Name *</label>
              <input type="text" className="form-input" value={firstName} onChange={(e)=>setFirstName(e.target.value)} placeholder="John" required/>
            </div>
            <div style={{ minWidth:0 }}>
              <label className="form-label">Last Name *</label>
              <input type="text" className="form-input" value={lastName} onChange={(e)=>setLastName(e.target.value)} placeholder="Doe" required/>
            </div>
          </div>
          <div>
            <label className="form-label">Middle Name (optional)</label>
            <input type="text" className="form-input" value={middleName} onChange={(e)=>setMiddleName(e.target.value)}/>
          </div>
          <div>
            <label className="form-label">Email Address *</label>
            <input type="email" className="form-input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" required/>
          </div>
          <div>
            <label className="form-label">Phone Number *</label>
            <input type="tel" className="form-input" value={formatPhone(phone)}
              onChange={(e)=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="(555) 123-4567" required/>
          </div>
          <div>
            <label className="form-label">Date of Birth *</label>
            <input type="date" className="form-input" value={dob} onChange={(e)=>setDob(e.target.value)}
              max={new Date(new Date().setFullYear(new Date().getFullYear()-18)).toISOString().split("T")[0]} required/>
          </div>
        </div>
      )}

      {/* ╔═══════════════════════════════════════╗ */}
      {/* ║  STEP 1: Address                      ║ */}
      {/* ╚═══════════════════════════════════════╝ */}
      {step === 1 && (
        <div className="form mob-form">
          <div>
            <label className="form-label">Address Lookup</label>
            <AddressLookup onSelect={({ line1, city:c, state:s, zip:z, country:co })=>{
              setStreet(line1||""); setCity(c||""); setState(s||""); setZip(z||""); if(co) setCountry(co);
            }}/>
          </div>
          <div>
            <label className="form-label">Street Address *</label>
            <input type="text" className="form-input" value={street} onChange={(e)=>setStreet(e.target.value)} placeholder="123 Main St" required/>
          </div>
          <div>
            <label className="form-label">Address Line 2</label>
            <input type="text" className="form-input" value={street2} onChange={(e)=>setStreet2(e.target.value)} placeholder="Apt, Suite, Unit (optional)"/>
          </div>
          <div style={twoCol}>
            <div style={{ minWidth:0 }}>
              <label className="form-label">City *</label>
              <input type="text" className="form-input" value={city} onChange={(e)=>setCity(e.target.value)} placeholder="San Francisco" required/>
            </div>
            <div style={{ minWidth:0 }}>
              <label className="form-label">State *</label>
              <select className="form-input" value={state} onChange={(e)=>setState(e.target.value)} required>
                <option value="">-- Select State --</option>
                {US_STATES.map((s)=>(<option key={s.code} value={s.code}>{s.name}</option>))}
              </select>
            </div>
          </div>
          <div style={twoCol}>
            <div style={{ minWidth:0 }}>
              <label className="form-label">ZIP Code *</label>
              <input type="text" className="form-input" value={zip}
                onChange={(e)=>setZip(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="94102" maxLength={5} required/>
            </div>
            <div style={{ minWidth:0 }}>
              <label className="form-label">Country</label>
              <select className="form-input" value={country} onChange={(e)=>setCountry(e.target.value)}>
                {COUNTRIES.map((c)=>(<option key={c.code} value={c.code}>{c.name}</option>))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Local Timezone</label>
            <select className="form-input" value={timezone||localTZ} onChange={(e)=>setTimezone(e.target.value)}>
              {!timezone && <option value={localTZ}>{localTZ} (Detected)</option>}
              {timezoneOptions.map((tz)=>(<option key={tz} value={tz}>{tz}</option>))}
            </select>
          </div>
        </div>
      )}

      {/* ╔═══════════════════════════════════════╗ */}
      {/* ║  STEP 2: Financial / Disclosures      ║ */}
      {/* ╚═══════════════════════════════════════╝ */}
      {step === 2 && (
        <div className="form mob-form">
          <div>
            <label className="form-label">Social Security Number {country!=="US"?"(optional)":""}</label>
            <div style={{ position:"relative" }}>
              <input
                type={showTaxId?"text":"password"} className="form-input"
                value={showTaxId ? formatSSN(taxId) : taxId ? "•••-••-"+taxId.slice(-4) : ""}
                onChange={(e)=>setTaxId(e.target.value.replace(/\D/g,"").slice(0,9))}
                onFocus={()=>setShowTaxId(true)} placeholder="XXX-XX-XXXX"
                maxLength={11} style={{ paddingRight:50 }}
              />
              <span onClick={()=>setShowTaxId((s)=>!s)} style={{
                position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                cursor:"pointer", fontSize:"0.8rem", color:"#6b7280", padding:4,
              }}>
                {showTaxId?"Hide":"Show"}
              </span>
            </div>
            <p className="caption" style={{ marginTop:4, fontSize:"0.75rem" }}>
              Required for tax reporting. Securely transmitted to Alpaca Securities.
            </p>
          </div>
          <div>
            <label className="form-label">Primary Funding Source</label>
            <select className="form-input" value={fundingSource} onChange={(e)=>setFundingSource(e.target.value)}>
              {FUNDING_SOURCES.map((fs)=>(<option key={fs.value} value={fs.value}>{fs.label}</option>))}
            </select>
          </div>
          <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, padding: isMobile?12:16, marginTop:8 }}>
            <p style={{ fontWeight:700, fontSize:"0.9rem", marginBottom:12 }}>Regulatory Disclosures</p>
            {[
              { label:"I am a control person of a publicly traded company", value:isControlPerson, setter:setIsControlPerson },
              { label:"I am affiliated with a stock exchange or FINRA",     value:isAffiliated,    setter:setIsAffiliated },
              { label:"I am a politically exposed person",                  value:isPep,           setter:setIsPep },
              { label:"An immediate family member is politically exposed",  value:familyExposed,   setter:setFamilyExposed },
            ].map((d,i)=>(
              <label key={i} className="mob-disclosure-item" style={{
                display:"flex", alignItems:"center", gap:10, cursor:"pointer", padding:"6px 0", fontSize:"0.85rem",
              }}>
                <input type="checkbox" checked={d.value} onChange={(e)=>d.setter(e.target.checked)}
                  style={{ width:18, height:18, accentColor:"#2563eb", flexShrink:0 }}/>
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
        <div className="form mob-form">
          {avatar && (
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <img src={avatar} alt="Profile" style={{
                width: isMobile?64:80, height: isMobile?64:80, borderRadius:"50%",
                objectFit:"cover", border:"3px solid #2563eb",
              }}/>
            </div>
          )}

          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding: isMobile?12:16 }}>
            <p style={{ fontWeight:700, fontSize:"0.95rem", marginBottom:12 }}>Please review your information</p>
            <div className="mob-review-grid" style={{
              display:"grid",
              gridTemplateColumns: isMobile?"1fr":"auto 1fr",
              gap: isMobile?"2px 0":"6px 16px",
              fontSize: isMobile?"0.85rem":"0.9rem",
            }}>
              {[
                { label:"Name",     value:`${firstName} ${middleName?middleName+" ":""}${lastName}` },
                { label:"Email",    value:email },
                { label:"Phone",    value:formatPhone(phone) },
                { label:"DOB",      value:dob },
                { label:"Address",  value:`${street}${street2?`, ${street2}`:""}, ${city}, ${state} ${zip}` },
                { label:"Country",  value:COUNTRIES.find((c)=>c.code===country)?.name||country },
                { label:"Timezone", value:timezone },
                { label:"SSN",      value:taxId?"•••-••-"+taxId.slice(-4):"Not provided" },
                { label:"Funding",  value:FUNDING_SOURCES.find((f)=>f.value===fundingSource)?.label||fundingSource },
                { label:"Broker",   value:passedBroker },
              ].map((r,i)=>(
                <React.Fragment key={i}>
                  <span className="mob-review-label" style={{
                    color:"#6b7280", fontWeight: isMobile?600:400,
                    marginTop: isMobile&&i>0?8:0,
                  }}>
                    {r.label}{isMobile?"":":"}
                  </span>
                  <span style={{ fontWeight:600, wordBreak:"break-word" }}>{r.value}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="form-disclosure" style={{ marginTop:16 }}>
            <p style={{ fontWeight:600, marginBottom:4, fontSize: isMobile?"0.85rem":"inherit" }}>
              By clicking "Save Profile & Create Account" you agree to:
            </p>
            <ul style={{ margin:0, paddingLeft:20, fontSize: isMobile?"0.8rem":"0.85rem" }}>
              <li>Alpaca Securities Customer Agreement</li>
              <li>Alpaca Securities Account Agreement</li>
              <li>Alpaca Securities Margin Agreement</li>
            </ul>
            <p style={{ marginTop:8, fontSize:"0.8rem", color:"#6b7280" }}>
              Alpaca Securities LLC is a registered broker-dealer and member of
              FINRA/SIPC. Your account is protected by SIPC up to $500,000.
            </p>
          </div>

          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}
            style={{ marginTop:12, width: isMobile?"100%":"auto" }}>
            {submitting ? (
              <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <Loader size={18} className="spin"/> Saving & Creating Account...
              </span>
            ) : "Save Profile & Create Account"}
          </button>
        </div>
      )}

      {/* ── Navigation ── */}
      {step < 3 && (
        <div className="mob-nav-buttons" style={{
          display:"flex", justifyContent: step===0?"flex-end":"space-between",
          marginTop: isMobile?16:20, gap:12,
        }}>
          {step > 0 && (
            <button type="button" className="btn-secondary" onClick={handleBack}
              style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:4 }}>
              <ChevronLeft size={16}/> Back
            </button>
          )}
          <button type="button" className="btn-primary" onClick={handleNext}
            style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:4 }}>
            Next <ChevronRight size={16}/>
          </button>
        </div>
      )}

      {step === 3 && !submitting && (
        <div style={{ marginTop:12 }}>
          <button type="button" className="btn-secondary" onClick={handleBack}
            style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:4, width: isMobile?"100%":"auto" }}>
            <ChevronLeft size={16}/> Back to Edit
          </button>
        </div>
      )}

      {step === 0 && (
        <div style={{ marginTop:16 }}>
          <button type="button" className="btn-secondary" onClick={()=>navigate("/select-broker")}
            style={{ width: isMobile?"100%":"auto" }}>
            Back to Broker Selection
          </button>
        </div>
      )}
    </div>
  );
}
