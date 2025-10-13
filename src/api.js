// src/api.js
// Safe default: in production on stockloyal.com, point to the Lightsail API.
// Else (localhost, previews), fall back to /api
const isProd =
  typeof window !== 'undefined' && /\.?stockloyal\.com$/i.test(window.location.hostname);

const DEFAULT_API = isProd ? 'https://api.stockloyal.com/api' : '/api';

// Precedence: Amplify build-time env → runtime override → default
const API_BASE =
  (import.meta.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE).trim()) ||
  (typeof window !== 'undefined' && window.__API_BASE) ||
  DEFAULT_API;

// Small helper to build URLs safely
const join = (base, path) =>
  `${base.replace(/\/+$/, '')}/${String(path || '').replace(/^\/+/, '')}`;

async function handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${text || 'no body'}`);
  }
  return (await res.json().catch(() => ({})));
}

export async function apiGet(path) {
  const res = await fetch(join(API_BASE, path), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return handle(res);
}

export async function apiPost(path, body = {}) {
  const res = await fetch(join(API_BASE, path), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle(res);
}

// (Optional) debug
if (typeof window !== 'undefined') {
  console.log('[API_BASE]', API_BASE);
}
