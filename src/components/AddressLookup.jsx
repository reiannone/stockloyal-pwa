// src/components/AddressLookup.jsx
// Reusable address autocomplete powered by Geoapify (free tier: 3,000 req/day)
import React, { useRef, useEffect, useState } from "react";
import { GeocoderAutocomplete } from "@geoapify/geocoder-autocomplete";
import "@geoapify/geocoder-autocomplete/styles/minimal.css";
import "./AddressLookup.css";

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_KEY || "";

console.log("[AddressLookup] MODULE LOADED, key present:", !!GEOAPIFY_KEY);

export default function AddressLookup({ onSelect, placeholder = "Start typing an address…", className = "" }) {
  const containerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  console.log("[AddressLookup] RENDER, ready:", ready, "containerRef:", !!containerRef.current);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    console.log("[AddressLookup] setReady(true)");
    setReady(true);
  }, []);

  useEffect(() => {
    console.log("[AddressLookup] Init effect, ready:", ready, "container:", !!containerRef.current, "key:", !!GEOAPIFY_KEY);
    if (!ready || !containerRef.current || !GEOAPIFY_KEY) return;

    // Clear any leftover DOM from previous mount
    containerRef.current.innerHTML = "";

    console.log("[AddressLookup] Creating GeocoderAutocomplete...");

    let ac;
    try {
      ac = new GeocoderAutocomplete(containerRef.current, GEOAPIFY_KEY, {
        type: "street",
        lang: "en",
        limit: 6,
        placeholder,
        filter: { countrycodes: ["us", "ca"] },
        bias: { countrycodes: ["us", "ca"] },
      });

      console.log("[AddressLookup] ✅ Autocomplete created successfully");

      ac.on("select", (location) => {
        if (!location?.properties) return;
        const p = location.properties;
        const stateCode = p.state_code || p.state || "";
        const houseNumber = p.housenumber || "";
        const street = p.street || "";
        const line1 = `${houseNumber} ${street}`.trim();

        const parsed = {
          line1,
          line2: "",
          city: p.city || p.town || p.village || p.municipality || "",
          state: stateCode.toUpperCase(),
          zip: p.postcode || "",
          country: (p.country_code || "").toUpperCase(),
          formatted: p.formatted || "",
        };

        console.log("[AddressLookup] selected:", parsed);
        if (onSelectRef.current) onSelectRef.current(parsed);
      });
    } catch (err) {
      console.error("[AddressLookup] ❌ Failed to initialize:", err);
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [ready]);

  if (!GEOAPIFY_KEY) {
    console.warn("[AddressLookup] No key — returning null");
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`address-lookup-wrapper ${className}`}
      style={{ position: "relative", minHeight: "40px", border: "2px dashed red" }}
    />
  );
}
