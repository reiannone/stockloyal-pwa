// src/api.js
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Small helper to build URLs safely
const join = (base, path) => {
  const b = base.replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
};

async function handle(res) {
  // Throw on non-2xx
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${text || 'no body'}`);
  }
  // Expect JSON from PHP
  const data = await res.json().catch(() => ({}));
  return data;
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
