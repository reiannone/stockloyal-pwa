// src/components/AddressLookup.jsx
// Reusable address autocomplete powered by Geoapify (free tier: 3,000 req/day)
// Usage:
//   <AddressLookup onSelect={({ line1, line2, city, state, zip, country }) => { ... }} />
//
// Requires env variable: VITE_GEOAPIFY_KEY=your_api_key
// Sign up free at https://myprojects.geoapify.com/

import React, { useRef, useEffect, useCallback } from "react";
import { GeocoderAutocomplete } from "@geoapify/geocoder-autocomplete";
import "@geoapify/geocoder-autocomplete/styles/minimal.css";
import "./AddressLookup.css";

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_KEY || "";

/**
 * @param {Object}   props
 * @param {Function} props.onSelect  - called with { line1, line2, city, state, zip, country, formatted }
 * @param {string}   [props.placeholder] - input placeholder text
 * @param {string}   [props.className]   - extra CSS class on wrapper div
 */
export default function AddressLookup({ onSelect, placeholder = "Start typing an address…", className = "" }) {
  const containerRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Stable callback ref so we don't re-init on every render
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || autocompleteRef.current) return;
    if (!GEOAPIFY_KEY) {
      console.warn("[AddressLookup] No VITE_GEOAPIFY_KEY found — autocomplete disabled");
      return;
    }

    const ac = new GeocoderAutocomplete(containerRef.current, GEOAPIFY_KEY, {
      type: "street",            // street-level results
      lang: "en",
      limit: 6,
      placeholder,
      filter: { countrycodes: ["us", "ca"] },
      bias: { countrycodes: ["us", "ca"] },
    });

    ac.on("select", (location) => {
      if (!location?.properties) return;
      const p = location.properties;

      // Parse US/CA state code from state_code or fall back to state name
      const stateCode = p.state_code || p.state || "";

      // Build house + street into line1
      const houseNumber = p.housenumber || "";
      const street = p.street || "";
      const line1 = `${houseNumber} ${street}`.trim();

      const parsed = {
        line1,
        line2: "",                           // Geoapify doesn't return apt/suite
        city: p.city || p.town || p.village || p.municipality || "",
        state: stateCode.toUpperCase(),
        zip: p.postcode || "",
        country: (p.country_code || "").toUpperCase(),
        formatted: p.formatted || "",
      };

      console.log("[AddressLookup] selected:", parsed);

      if (onSelectRef.current) onSelectRef.current(parsed);
    });

    autocompleteRef.current = ac;

    // Cleanup
    return () => {
      // GeocoderAutocomplete doesn't expose a destroy method,
      // but clearing the container handles it when the component unmounts
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      autocompleteRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!GEOAPIFY_KEY) {
    return null; // Gracefully hide if no API key configured
  }

  return (
    <div
      ref={containerRef}
      className={`address-lookup-wrapper ${className}`}
      style={{ position: "relative" }}
    />
  );
}
