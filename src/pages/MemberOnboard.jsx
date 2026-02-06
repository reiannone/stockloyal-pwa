// src/pages/MemberOnboard.jsx (Option A: ensure memberId is persisted + dispatch member-updated)
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import AvatarUpload from "../components/AvatarUpload.jsx";
import AddressLookup from "../components/AddressLookup.jsx";

function MemberOnboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const memberId = location.state?.memberId || localStorage.getItem("memberId");

  // ✅ If we arrived with state.memberId, persist it + notify header (same tab)
  useEffect(() => {
    const stateMemberId = location.state?.memberId;
    if (stateMemberId && stateMemberId !== localStorage.getItem("memberId")) {
      localStorage.setItem("memberId", stateMemberId);
      window.dispatchEvent(new Event("member-updated"));
    }
  }, [location.state?.memberId]);

  const localTZ = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  const timezoneOptions = useMemo(() => {
    try {
      if (typeof Intl.supportedValuesOf === "function") {
        const tzs = Intl.supportedValuesOf("timeZone");
        const usFirst = tzs.filter((z) => z.startsWith("America/"));
        const rest = tzs.filter((z) => !z.startsWith("America/"));
        return [...usFirst.sort(), ...rest.sort()];
      }
    } catch {}
    return [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "America/Toronto",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Australia/Sydney",
      "UTC",
    ];
  }, []);

  const [formData, setFormData] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    member_email: location.state?.memberEmail || localStorage.getItem("memberEmail") || "",
    member_address_line1: "",
    member_address_line2: "",
    member_town_city: "",
    member_state: "",
    member_zip: "",
    member_country: "",
    member_timezone: "",
  });

  const [avatar, setAvatar] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Read-only merchant/account information
  const [merchantInfo, setMerchantInfo] = useState({
    merchant_id: "",
    merchant_name: "",
    tier_name: "",
    election_type: "",
    sweep_percentage: "",
    broker: "",
  });

  const usStates = [
    { code: "AL", name: "Alabama" },
    { code: "AK", name: "Alaska" },
    { code: "AS", name: "American Samoa" },
    { code: "AZ", name: "Arizona" },
    { code: "AR", name: "Arkansas" },
    { code: "CA", name: "California" },
    { code: "CO", name: "Colorado" },
    { code: "CT", name: "Connecticut" },
    { code: "DE", name: "Delaware" },
    { code: "DC", name: "District of Columbia" },
    { code: "FL", name: "Florida" },
    { code: "GA", name: "Georgia" },
    { code: "GU", name: "Guam" },
    { code: "HI", name: "Hawaii" },
    { code: "ID", name: "Idaho" },
    { code: "IL", name: "Illinois" },
    { code: "IN", name: "Indiana" },
    { code: "IA", name: "Iowa" },
    { code: "KS", name: "Kansas" },
    { code: "KY", name: "Kentucky" },
    { code: "LA", name: "Louisiana" },
    { code: "ME", name: "Maine" },
    { code: "MD", name: "Maryland" },
    { code: "MA", name: "Massachusetts" },
    { code: "MI", name: "Michigan" },
    { code: "MN", name: "Minnesota" },
    { code: "MS", name: "Mississippi" },
    { code: "MO", name: "Missouri" },
    { code: "MT", name: "Montana" },
    { code: "NE", name: "Nebraska" },
    { code: "NV", name: "Nevada" },
    { code: "NH", name: "New Hampshire" },
    { code: "NJ", name: "New Jersey" },
    { code: "NM", name: "New Mexico" },
    { code: "NY", name: "New York" },
    { code: "NC", name: "North Carolina" },
    { code: "ND", name: "North Dakota" },
    { code: "MP", name: "Northern Mariana Islands" },
    { code: "OH", name: "Ohio" },
    { code: "OK", name: "Oklahoma" },
    { code: "OR", name: "Oregon" },
    { code: "PA", name: "Pennsylvania" },
    { code: "PR", name: "Puerto Rico" },
    { code: "RI", name: "Rhode Island" },
    { code: "SC", name: "South Carolina" },
    { code: "SD", name: "South Dakota" },
    { code: "TN", name: "Tennessee" },
    { code: "TX", name: "Texas" },
    { code: "UT", name: "Utah" },
    { code: "VT", name: "Vermont" },
    { code: "VI", name: "U.S. Virgin Islands" },
    { code: "VA", name: "Virginia" },
    { code: "WA", name: "Washington" },
    { code: "WV", name: "West Virginia" },
    { code: "WI", name: "Wisconsin" },
    { code: "WY", name: "Wyoming" },
  ];

  const countries = [
    { code: "US", name: "United States" },
    { code: "CA", name: "Canada" },
    { code: "MX", name: "Mexico" },
    { code: "GB", name: "United Kingdom" },
    { code: "FR", name: "France" },
    { code: "DE", name: "Germany" },
    { code: "JP", name: "Japan" },
    { code: "CN", name: "China" },
    { code: "IN", name: "India" },
    { code: "AU", name: "Australia" },
  ];

  console.log("Start MemberOnboard.jsx");
  console.log(memberId);

  useEffect(() => {
    if (!memberId) {
      setError("No member ID found — please log in again.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (data.success && data.wallet) {
          setFormData((prev) => {
            const merged = { ...prev, ...data.wallet };
            if (!merged.member_timezone) merged.member_timezone = localTZ;
            return merged;
          });

          // Debug: Log wallet data to see available fields
          console.log("Wallet data received:", data.wallet);
          console.log("Tier-related fields:", {
            tier_name: data.wallet.tier_name,
            current_tier: data.wallet.current_tier,
            member_tier: data.wallet.member_tier,
            memberTier: data.wallet.memberTier,
            tier: data.wallet.tier,
          });

          // Set merchant and account information (using camelCase field names from API)
          setMerchantInfo({
            merchant_id: data.wallet.merchantId || data.wallet.merchant_id || "",
            merchant_name: data.wallet.merchantName || data.wallet.merchant_name || "",
            // Check both camelCase and snake_case field names
            tier_name: data.wallet.memberTier || data.wallet.tier_name || data.wallet.current_tier || data.wallet.member_tier || data.wallet.tier || "",
            election_type: data.wallet.election_type || data.wallet.electionType || "",
            sweep_percentage: data.wallet.sweep_percentage != null ? data.wallet.sweep_percentage : (data.wallet.sweepPercentage != null ? data.wallet.sweepPercentage : ""),
            broker: data.wallet.broker || "",
          });

          // ✅ Load avatar ONLY from database
          if (data.wallet.member_avatar) {
            setAvatar(data.wallet.member_avatar);
            // Sync to localStorage for consistency
            localStorage.setItem("userAvatar", data.wallet.member_avatar);
          } else {
            // No avatar in database - clear any stale localStorage
            setAvatar(null);
            localStorage.removeItem("userAvatar");
          }
        } else {
          setError(data.error || "Failed to load wallet.");
        }
      } catch (err) {
        console.error("MemberOnboard fetch error:", err);
        setError("Network error while fetching wallet.");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId, localTZ]);

  useEffect(() => {
    if (!formData.member_timezone) {
      setFormData((p) => ({ ...p, member_timezone: localTZ }));
    }
  }, [localTZ, formData.member_timezone]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (newAvatar) => {
    setAvatar(newAvatar);

    if (newAvatar) localStorage.setItem("userAvatar", newAvatar);
    else localStorage.removeItem("userAvatar");

    // (kept existing behavior) notify avatar listeners
    window.dispatchEvent(new Event("avatar-updated"));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const data = await apiPost("update_wallet.php", {
        member_id: memberId,
        ...formData,
        member_avatar: avatar,
      });

      if (data.success) {
        localStorage.setItem("memberEmail", formData.member_email);

        if (formData.first_name) {
          localStorage.setItem("userName", formData.first_name);
        }

        // ✅ Ensure memberId is persisted + notify header (safe even if already set)
        if (memberId) {
          localStorage.setItem("memberId", memberId);
          window.dispatchEvent(new Event("member-updated"));
        }

        // ✅ Check if broker is populated in localStorage
        const broker = localStorage.getItem("broker");
        
        if (broker && broker.trim() !== "") {
          // Broker exists → go to wallet
          navigate("/wallet");
        } else {
          // No broker → go to select-broker
          navigate("/select-broker");
        }
      } else {
        setError(data.error || "Failed to update wallet.");
      }
    } catch (err) {
      console.error("Update wallet error:", err);
      setError("Network error while saving.");
    }
  };

  const handleCancel = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/wallet");
  };

  if (loading) {
    return (
      <div className="page-container">
        <h2 className="heading">Member Onboarding</h2>
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h2 className="page-title">Member Onboarding</h2>
      {error && <p className="member-form-error">{error}</p>}

      <form className="form member-form-grid" onSubmit={handleSave}>
        {/* Avatar Upload Section - Full Width */}
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "20px 0",
            borderBottom: "2px solid #e5e7eb",
            marginBottom: "20px",
          }}
        >
          <label
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#111827",
              marginBottom: "12px",
            }}
          >
            Profile Picture
          </label>
          <AvatarUpload currentAvatar={avatar} onAvatarChange={handleAvatarChange} size="xl" />
          <p
            style={{
              fontSize: "13px",
              color: "#6b7280",
              marginTop: "12px",
              textAlign: "center",
              maxWidth: "300px",
            }}
          >
            Upload a profile picture to personalize your account and social comments
          </p>
        </div>

        {/* Member ID (display only) */}
        <div className="member-form-row">
          <label className="member-form-label">Member ID:</label>
          <input value={memberId || ""} disabled className="member-form-input" />
        </div>

        {/* Merchant Information Section (read-only) */}
        <div
          style={{
            gridColumn: "1 / -1",
            background: "#f9fafb",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            marginBottom: "20px",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: "600",
              color: "#374151",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Merchant & Account Information
          </h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
                Merchant ID
              </label>
              <input 
                value={merchantInfo.merchant_id || "-"} 
                disabled 
                className="member-form-input"
                style={{ background: "#f3f4f6", cursor: "not-allowed" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
                Merchant Name
              </label>
              <input 
                value={merchantInfo.merchant_name || "-"} 
                disabled 
                className="member-form-input"
                style={{ background: "#f3f4f6", cursor: "not-allowed" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
                Member Tier
              </label>
              <input 
                value={merchantInfo.tier_name || "-"} 
                disabled 
                className="member-form-input"
                style={{ background: "#f3f4f6", cursor: "not-allowed" }}
              />
            </div>

            {/* Broker - Clickable */}
            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
                Broker
              </label>
              <input 
                value={merchantInfo.broker || "-"} 
                readOnly
                onClick={() => navigate("/select-broker")}
                className="member-form-input"
                style={{ 
                  background: "#e0f2fe", 
                  cursor: "pointer",
                  color: "#0369a1",
                  fontWeight: "500",
                  border: "1px solid #0ea5e9"
                }}
                title="Click to change broker"
              />
            </div>

            {/* Election Type - Clickable */}
            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
                Election Type
              </label>
              <input 
                value={merchantInfo.election_type || "-"} 
                readOnly
                onClick={() => navigate("/election")}
                className="member-form-input"
                style={{ 
                  background: "#e0f2fe", 
                  cursor: "pointer",
                  color: "#0369a1",
                  fontWeight: "500",
                  border: "1px solid #0ea5e9"
                }}
                title="Click to change election type"
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
                Sweep Percentage
              </label>
              <input 
                value={merchantInfo.sweep_percentage !== "" ? `${merchantInfo.sweep_percentage}%` : "-"} 
                disabled 
                className="member-form-input"
                style={{ background: "#f3f4f6", cursor: "not-allowed" }}
              />
            </div>
          </div>
        </div>

        <div className="member-form-row">
          <label className="member-form-label">First Name:</label>
          <input name="first_name" value={formData.first_name} onChange={handleChange} className="member-form-input" />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Middle Name:</label>
          <input name="middle_name" value={formData.middle_name} onChange={handleChange} className="member-form-input" />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Last Name:</label>
          <input name="last_name" value={formData.last_name} onChange={handleChange} className="member-form-input" />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Email:</label>
          <input name="member_email" type="email" value={formData.member_email} onChange={handleChange} className="member-form-input" />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Address Lookup:</label>
          <AddressLookup
            onSelect={({ line1, city, state, zip, country }) => {
              setFormData((prev) => ({
                ...prev,
                member_address_line1: line1,
                member_town_city: city,
                member_state: state,
                member_zip: zip,
                member_country: country,
              }));
            }}
          />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Address Line 1:</label>
          <input name="member_address_line1" value={formData.member_address_line1} onChange={handleChange} className="member-form-input" />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Address Line 2:</label>
          <input name="member_address_line2" value={formData.member_address_line2} onChange={handleChange} className="member-form-input" />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">City / Town:</label>
          <input name="member_town_city" value={formData.member_town_city} onChange={handleChange} className="member-form-input" />
        </div>

        {/* State Dropdown */}
        <div className="member-form-row">
          <label className="member-form-label">State:</label>
          <select name="member_state" value={formData.member_state} onChange={handleChange} className="member-form-input">
            <option value="">-- Select State --</option>
            {usStates.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        </div>

        <div className="member-form-row">
          <label className="member-form-label">ZIP Code:</label>
          <input name="member_zip" value={formData.member_zip} onChange={handleChange} className="member-form-input" />
        </div>

        {/* Country Dropdown */}
        <div className="member-form-row">
          <label className="member-form-label">Country:</label>
          <select name="member_country" value={formData.member_country} onChange={handleChange} className="member-form-input">
            <option value="">-- Select Country --</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Timezone Dropdown */}
        <div className="member-form-row">
          <label className="member-form-label">Local Timezone:</label>
          <select name="member_timezone" value={formData.member_timezone || localTZ} onChange={handleChange} className="member-form-input">
            {!formData.member_timezone && <option value={localTZ}>{localTZ} (Detected)</option>}
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="member-form-actions">
          <button type="submit" className="btn-primary">
            Save & Continue
          </button>
          <button type="button" className="btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default MemberOnboard;
