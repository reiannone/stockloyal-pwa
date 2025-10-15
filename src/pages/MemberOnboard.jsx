// src/pages/MemberOnboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js"; // ✅ universal helper

function MemberOnboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const memberId = location.state?.memberId || localStorage.getItem("memberId");

  // ✅ Try to get local timezone; fall back to "America/New_York"
  const localTZ = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  // ✅ Build timezone list; prefer browser list, else fallback to a curated set
  const timezoneOptions = useMemo(() => {
    try {
      if (typeof Intl.supportedValuesOf === "function") {
        const tzs = Intl.supportedValuesOf("timeZone");
        // Group US-first, then rest alphabetically for nicer UX
        const usFirst = tzs.filter((z) => z.startsWith("America/"));
        const rest = tzs.filter((z) => !z.startsWith("America/"));
        return [...usFirst.sort(), ...rest.sort()];
      }
    } catch {}
    // Fallback (common timezones)
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
    member_email:
      location.state?.memberEmail ||
      localStorage.getItem("memberEmail") ||
      "",
    member_address_line1: "",
    member_address_line2: "",
    member_town_city: "",
    member_state: "",
    member_zip: "",
    member_country: "",
    member_timezone: "", // ✅ new field
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ US States + Territories list (ISO2 codes)
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

  // ✅ Common countries list (ISO2 codes)
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
    // 👉 expand as needed (full ISO2 country list can be added)
  ];

  console.log("Start MemberOnboard.jsx");
  console.log(memberId);

  // ✅ Load wallet details
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
            // If no timezone saved yet, default to local
            if (!merged.member_timezone) merged.member_timezone = localTZ;
            return merged;
          });
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

  // ✅ If still no timezone (e.g., new user and fetch failed), set to local on mount
  useEffect(() => {
    if (!formData.member_timezone) {
      setFormData((p) => ({ ...p, member_timezone: localTZ }));
    }
  }, [localTZ, formData.member_timezone]);

  // ✅ Handle form changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ✅ Save updates
  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const data = await apiPost("update_wallet.php", {
        member_id: memberId,
        ...formData,
      });

      if (data.success) {
        localStorage.setItem("memberEmail", formData.member_email);
        navigate("/wallet");
      } else {
        setError(data.error || "Failed to update wallet.");
      }
    } catch (err) {
      console.error("Update wallet error:", err);
      setError("Network error while saving.");
    }
  };

  // ✅ Cancel (no save)
  const handleCancel = () => {
    // Go back if possible; otherwise land on wallet
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
        {/* Member ID (display only) */}
        <div className="member-form-row">
          <label className="member-form-label">Member ID:</label>
          <input value={memberId} disabled className="member-form-input" />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">First Name:</label>
          <input
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Middle Name:</label>
          <input
            name="middle_name"
            value={formData.middle_name}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Last Name:</label>
          <input
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Email:</label>
          <input
            name="member_email"
            type="email"
            value={formData.member_email}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Address Line 1:</label>
          <input
            name="member_address_line1"
            value={formData.member_address_line1}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">Address Line 2:</label>
          <input
            name="member_address_line2"
            value={formData.member_address_line2}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        <div className="member-form-row">
          <label className="member-form-label">City / Town:</label>
          <input
            name="member_town_city"
            value={formData.member_town_city}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        {/* State Dropdown */}
        <div className="member-form-row">
          <label className="member-form-label">State:</label>
          <select
            name="member_state"
            value={formData.member_state}
            onChange={handleChange}
            className="member-form-input"
          >
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
          <input
            name="member_zip"
            value={formData.member_zip}
            onChange={handleChange}
            className="member-form-input"
          />
        </div>

        {/* Country Dropdown */}
        <div className="member-form-row">
          <label className="member-form-label">Country:</label>
          <select
            name="member_country"
            value={formData.member_country}
            onChange={handleChange}
            className="member-form-input"
          >
            <option value="">-- Select Country --</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* ✅ Timezone Dropdown */}
        <div className="member-form-row">
          <label className="member-form-label">Local Timezone:</label>
          <select
            name="member_timezone"
            value={formData.member_timezone || localTZ}
            onChange={handleChange}
            className="member-form-input"
          >
            {!formData.member_timezone && (
              <option value={localTZ}>{localTZ} (Detected)</option>
            )}
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
