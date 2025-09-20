import { API_BASE } from "../config/api";

// ✅ Universal POST request helper
export async function apiPost(endpoint, payload) {
  const resp = await fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid server response: " + text.slice(0, 120));
  }
}
