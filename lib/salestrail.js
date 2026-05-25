// Salestrail Call Analytics API client.
// Docs: https://callanalytics.salestrail.io/integration/apidocs
// Auth: HTTP Basic with a Pull-API username/password (env vars).
//
// We only READ: list calls (by createdAt) + download a recording for a callId.
// The OWNER credentials return the whole org's calls; the sync route filters
// down to calls made by known Openhouse RMs.

const API_BASE = 'https://standalone-api.salestrail.io';

// IST offset — RMs operate in India. The Monday/Friday filter is computed in
// IST, not UTC, so a late-evening IST call isn't bucketed to the wrong day.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Only calls that START on these IST weekdays are imported (0=Sun … 6=Sat).
export const SYNC_WEEKDAYS = [1, 5]; // Monday, Friday

// Quiet hours — the continuous drain (cron + self-chaining) only runs between
// these IST hours, so it doesn't fight live RM uploads during the workday.
// The admin "Sync now" button bypasses this (single pass, no chain).
export const SYNC_START_HOUR_IST = 22; // 10 PM IST (inclusive)
export const SYNC_END_HOUR_IST = 6; //  6 AM IST (exclusive)

export function istHour() {
  return new Date(Date.now() + IST_OFFSET_MS).getUTCHours();
}

export function isWithinSyncHours() {
  const h = istHour();
  // Window straddles midnight (22 → 06): inside if either side matches.
  if (SYNC_START_HOUR_IST > SYNC_END_HOUR_IST) {
    return h >= SYNC_START_HOUR_IST || h < SYNC_END_HOUR_IST;
  }
  return h >= SYNC_START_HOUR_IST && h < SYNC_END_HOUR_IST;
}

export function isSalestrailConfigured() {
  return !!(
    (process.env.SALESTRAIL_API_USERNAME || '').trim() &&
    (process.env.SALESTRAIL_API_PASSWORD || '').trim()
  );
}

function authHeader() {
  // Trim — pasted Vercel env vars often carry a trailing space/newline, which
  // silently corrupts the Basic credentials and yields a 401.
  const u = (process.env.SALESTRAIL_API_USERNAME || '').trim();
  const p = (process.env.SALESTRAIL_API_PASSWORD || '').trim();
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

// IST weekday (0=Sun … 6=Sat) for an ISO timestamp, or null if unparseable.
export function istWeekday(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + IST_OFFSET_MS).getUTCDay();
}

export function isSyncWeekday(iso) {
  const d = istWeekday(iso);
  return d != null && SYNC_WEEKDAYS.includes(d);
}

// Salestrail's CallData field names differ slightly between the webhook and
// pull schemas — read defensively across the known aliases.
export function normalizeCall(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const callId = raw.callId || raw.id || raw.call_id || null;
  const startTime = raw.startTime || raw.startedAt || raw.start_time || raw.start || null;
  if (!callId || !startTime) return null;
  const duration = raw.duration ?? raw.durationSeconds ?? raw.duration_seconds ?? 0;
  return {
    callId: String(callId),
    userEmail: (raw.userEmail || raw.email || raw.user_email || '').toLowerCase().trim() || null,
    userName: raw.userName || raw.user_name || raw.name || null,
    contactNumber:
      raw.number || raw.formattedNumber || raw.phoneNumber || raw.contactNumber || null,
    startTime,
    createdAt: raw.createdAt || raw.created_at || raw.created || startTime,
    durationSeconds: parseInt(duration, 10) || 0,
    inbound: !!raw.inbound,
  };
}

// GET /export/calls/byCreated/json?from=&to= — calls whose record was CREATED
// in [from, to]. Filtering on createdAt (not call start) means a recording
// that uploads days after the call is still caught by the next incremental run.
export async function listCallsByCreated(fromDate, toDate) {
  const url =
    `${API_BASE}/export/calls/byCreated/json` +
    `?from=${encodeURIComponent(new Date(fromDate).toISOString())}` +
    `&to=${encodeURIComponent(new Date(toDate).toISOString())}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint =
      res.status === 401
        ? ' — Salestrail rejected the credentials. Re-check SALESTRAIL_API_USERNAME / SALESTRAIL_API_PASSWORD in Vercel and redeploy.'
        : '';
    throw new Error(`Salestrail list failed (${res.status})${hint} ${body.slice(0, 200)}`.trim());
  }
  const data = await res.json();
  const arr = Array.isArray(data) ? data : Array.isArray(data?.calls) ? data.calls : [];
  return arr.map(normalizeCall).filter(Boolean);
}

// GET /export/calls/{callId}/recording — 302-redirects to a blob storage URL
// (fetch follows it; the cross-origin redirect drops our Basic auth header).
// 404 means no recording exists / no access. Returns
// { ok, status, buffer, contentType }.
export async function fetchRecording(callId) {
  const url = `${API_BASE}/export/calls/${encodeURIComponent(callId)}/recording`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader() },
    redirect: 'follow',
  });
  if (res.status === 404) return { ok: false, status: 404 };
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Salestrail recording fetch failed (${res.status}): ${body.slice(0, 150)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  let contentType = res.headers.get('content-type') || '';
  // Azure blob often serves recordings as octet-stream — fall back to MP3,
  // which is what phone call recorders produce in practice.
  if (!contentType.toLowerCase().startsWith('audio')) contentType = 'audio/mpeg';
  return { ok: true, status: res.status, buffer, contentType };
}

// File extension for a recording's content type — used for the Blob key.
export function extForAudio(mime) {
  const m = (mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('amr')) return 'amr';
  if (m.includes('3gpp') || m.includes('3gp')) return '3gp';
  if (m.includes('webm')) return 'webm';
  return 'mp3';
}
