// src/api/index.js
// Robust POST helper used across the app

console.log("Start src/api/index.js");

// Prefer the Vite env var, otherwise fallback to a reasonable default
export const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost/stockloyal-pwa/api").replace(/\/+$/, "");

console.log("API_BASE:", API_BASE);

/**
 * POST helper with robust error handling
 * @param {string} endpoint - relative PHP endpoint (e.g., "login.php" or "get-wallet.php")
 * @param {object} payload - JSON payload to send
 * @returns {Promise<object>} parsed JSON response
 */
export async function apiPost(endpoint, payload) {
  // allow either "login.php" or "/login.php" or full url
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}/${String(endpoint).replace(/^\/+/, "")}`;
  console.log("[apiPost] POST →", url, "payload:", payload);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // If non-2xx, try to read a helpful body
    if (!resp.ok) {
      let message = `HTTP ${resp.status} ${resp.statusText}`;
      let body = null;

      try {
        // Prefer JSON body if present
        body = await resp.json();
        if (body && body.error) message = body.error;
      } catch (jsonErr) {
        try {
          body = await resp.text();
          if (body) message = body;
        } catch {
          body = null;
        }
      }

      const error = new Error(message);
      error.status = resp.status;
      error.body = body;
      throw error;
    }

    // Parse JSON response (throw if invalid)
    const data = await resp.json().catch(async (e) => {
      const txt = await resp.text().catch(() => "<no body>");
      throw new Error("Invalid JSON response: " + txt);
    });

    console.log("[apiPost] Response:", data);
    return data;
  } catch (err) {
    // Network-level errors (CORS/preflight, DNS, offline) also surface here
    console.error("[apiPost] API error:", err);
    throw err;
  }
}
