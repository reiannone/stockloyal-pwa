// src/api.js  ← the ONLY place that defines API_BASE
export const API_BASE =
  (typeof window !== 'undefined' && (window.__VITE_API_BASE__ || window.__API_BASE__)) ||
  (import.meta.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE).trim()) ||
  '/api';

// Small helper to build URLs safely
const join = (base, path) => {
  const b = base.replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
};

async function handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${text || 'no body'}`);
  }
  return (await res.json().catch(() => ({})));
}

export async function apiGet(path) {
  const url = join(API_BASE, path);
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });
  return handle(res);
}

export async function apiPost(path, body = {}) {
  const url = join(API_BASE, path);
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return handle(res);
}

// Helpful at runtime
if (typeof window !== 'undefined') {
  console.log('[API_BASE]', API_BASE);
}
