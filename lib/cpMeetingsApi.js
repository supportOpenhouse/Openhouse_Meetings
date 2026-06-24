// Server-side client for the Open House Core "CP Meetings — Broker Create" API.
// Registers channel partners (brokers) in Core. The X-CP-Meetings-Key is a
// server-to-server secret and must NEVER reach the browser, so every call here
// runs only in our API routes. See CP_MEETINGS_BROKER_API.md.
const BASE = (
  process.env.CP_MEETINGS_API_BASE ||
  'https://backend-prod-561394753846.asia-south2.run.app/api/v1/oh'
).replace(/\/+$/, '');
const KEY = process.env.CP_MEETINGS_API_KEY;

export function isCpMeetingsConfigured() {
  return !!KEY;
}

function keyHeaders(extra = {}) {
  return { 'X-CP-Meetings-Key': KEY, ...extra };
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// GET /get-cities/ (key required) → [{ id, name }]
export async function getCities() {
  const res = await fetch(`${BASE}/get-cities/`, { headers: keyHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`get-cities ${res.status}`);
  const data = await readJson(res);
  return Array.isArray(data?.cities) ? data.cities : [];
}

// GET /get-micro-markets-by-city/?city= (public) → [{ id, name }]
export async function getMicroMarketsByCity(city) {
  const res = await fetch(
    `${BASE}/get-micro-markets-by-city/?city=${encodeURIComponent(city)}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`get-micro-markets ${res.status}`);
  const data = await readJson(res);
  return Array.isArray(data?.microMarkets) ? data.microMarkets : [];
}

// GET /brokers/last/ (key required) → next "CP00124" code. Called before each create.
export async function getNextCpCode() {
  const res = await fetch(`${BASE}/brokers/last/`, { headers: keyHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`brokers/last ${res.status}`);
  const data = await readJson(res);
  return data?.cpCode || null;
}

// POST /create-broker/ (key required). Throws with the API's message on failure
// (e.g. duplicate phone → 400, sales_manager_not_found → 422).
export async function createBroker(payload) {
  const res = await fetch(`${BASE}/create-broker/`, {
    method: 'POST',
    headers: keyHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await readJson(res);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `create-broker ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
