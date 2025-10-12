// src/api/index.js
export const API_BASE = __API_BASE__;

if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
  console.log("index.js [API] MODE:", import.meta.env.MODE, "API_BASE:", API_BASE);
}

const buildUrl = (endpoint) => {
  if (endpoint.startsWith("http")) return endpoint;
  const cleaned = String(endpoint).replace(/^\/?api\/+/, "");
  return `${API_BASE}/${cleaned}`;
};

async function requestJson(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    let msg = `HTTP ${resp.status} ${resp.statusText}`;
    try {
      const j = await resp.clone().json();
      if (j?.error) msg = String(j.error);
    } catch {
      try { const t = await resp.clone().text(); if (t) msg = t; } catch {}
    }
    const err = new Error(msg); err.status = resp.status; throw err;
  }
  try { return await resp.json(); }
  catch { const t = await resp.text().catch(()=>"<no body>"); throw new Error("Invalid JSON response: " + t); }
}

export async function apiPost(endpoint, body) {
  return requestJson(buildUrl(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiGet(endpoint) {
  return requestJson(buildUrl(endpoint), { method: "GET" });
}

export { buildUrl };
