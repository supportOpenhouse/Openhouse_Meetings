// Pulls visit rows from the configured Google Sheet and upserts them into
// cp_visits. Idempotent via the sheet's `id` column → cp_visits.source_row_id.
//
// Env required:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON of the service-account key, single line
//   GOOGLE_SHEET_ID              — spreadsheet ID from the sheet URL
//   GOOGLE_SHEET_TAB             — tab name (defaults to 'Sheet1')
//
// The sheet must be shared with the service-account email (Viewer is enough).

import { neon } from '@neondatabase/serverless';
import { google } from 'googleapis';

const DEFAULT_TAB = 'Sheet1';
const COLUMNS = ['selected_date', 'id', 'status', 'broker_contact', 'cp_code', 'assigned_rm'];

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ' + e.message);
  }
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Header-row detection: scan the first 5 rows, pick the one that contains our
// required columns. Lets the sheet have title/note rows above the data.
function findHeaderRow(rows) {
  const max = Math.min(rows.length, 5);
  for (let i = 0; i < max; i++) {
    const row = rows[i] || [];
    const norm = row.map((c) => String(c || '').trim().toLowerCase());
    if (norm.includes('cp_code') && norm.includes('id') && norm.includes('selected_date')) {
      return { headerIdx: i, header: norm };
    }
  }
  throw new Error('Could not find header row with cp_code/id/selected_date in first 5 rows');
}

// "2025-05-14" → "2025-05-14"; "14/05/2025" → "2025-05-14"; "5/14/2025" → "2025-05-14"
// Returns null for unparseable values so we can skip the row.
function parseSheetDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Already ISO-ish.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // D/M/YYYY or M/D/YYYY — sheets in IST typically use D/M/YYYY.
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    let [, a, b, y] = slash;
    if (y.length === 2) y = '20' + y;
    // Heuristic: if a > 12, it must be the day, so format is D/M.
    // Otherwise default to D/M (Indian convention).
    const day = Number(a);
    const month = Number(b);
    if (day > 12) return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Last resort: let Date parse it (handles things like "May 14, 2025").
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Live read for the /new-meeting visit dropdown: returns every row in the
// sheet matching (cp_code, selected_date == dateIso). Unlike fetchSheetRows
// this is NOT filtered by status — visits to be recorded are typically
// 'scheduled' (not 'completed' yet) — and it pulls a richer column set so
// the dropdown can show buyer + society + broker context.
const VISIT_DROPDOWN_FIELDS = [
  'id', 'selected_date', 'selected_time', 'status', 'lead_status',
  'broker_name', 'broker_contact', 'broker_alt_contact',
  'cp_code', 'company_name', 'city',
  'buyer_name', 'buyer_contact', 'profession',
  'society_name', 'unit_address_line1', 'unit_address_line2',
];

export async function fetchVisitsForCpOnDate(cpCode, dateIso) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not set');
  const tab = process.env.GOOGLE_SHEET_TAB || DEFAULT_TAB;

  const sheets = getSheetsClient();
  const range = `${tab}!A1:ZZ100000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const values = res.data.values || [];
  if (values.length === 0) return [];

  const { headerIdx, header } = findHeaderRow(values);
  const colIdx = {};
  for (const col of VISIT_DROPDOWN_FIELDS) colIdx[col] = header.indexOf(col);

  const wantCp = String(cpCode || '').trim().toLowerCase();
  const matched = [];
  for (let i = headerIdx + 1; i < values.length; i++) {
    const r = values[i];
    if (!r || r.length === 0) continue;
    const get = (col) => (colIdx[col] >= 0 ? r[colIdx[col]] : null);
    const rowCp = String(get('cp_code') || '').trim().toLowerCase();
    if (rowCp !== wantCp) continue;
    const rowDate = parseSheetDate(get('selected_date'));
    if (rowDate !== dateIso) continue;
    const row = {};
    for (const f of VISIT_DROPDOWN_FIELDS) {
      const v = get(f);
      row[f] = v == null || v === '' ? null : String(v).trim() || null;
    }
    matched.push(row);
  }
  return matched;
}

export async function fetchSheetRows() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not set');
  const tab = process.env.GOOGLE_SHEET_TAB || DEFAULT_TAB;

  const sheets = getSheetsClient();
  const range = `${tab}!A1:Z100000`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const values = res.data.values || [];
  if (values.length === 0) return { rows: [], skipped: 0, reasons: {} };

  const { headerIdx, header } = findHeaderRow(values);
  const colIdx = {};
  for (const col of COLUMNS) colIdx[col] = header.indexOf(col);
  if (colIdx.cp_code < 0) throw new Error('cp_code column not found in header');

  const rows = [];
  const reasons = {};
  let skipped = 0;
  for (let i = headerIdx + 1; i < values.length; i++) {
    const r = values[i];
    if (!r || r.length === 0) continue;
    const get = (col) => (colIdx[col] >= 0 ? r[colIdx[col]] : undefined);
    const cp_code = String(get('cp_code') || '').trim();
    const source_row_id = String(get('id') || '').trim();
    const visited_at = parseSheetDate(get('selected_date'));
    const status = String(get('status') || '').trim().toLowerCase();
    if (!cp_code || !source_row_id || !visited_at) {
      skipped++;
      const why = !cp_code ? 'missing cp_code' : !source_row_id ? 'missing id' : 'unparseable date';
      reasons[why] = (reasons[why] || 0) + 1;
      continue;
    }
    // We only count visits with status='completed' (case-insensitive). Other
    // statuses (scheduled, cancelled, no-show, etc.) are not visits.
    if (status !== 'completed') {
      skipped++;
      reasons['status not completed'] = (reasons['status not completed'] || 0) + 1;
      continue;
    }
    rows.push({
      source_row_id,
      cp_code,
      visited_at,
      status_raw: get('status') ? String(get('status')).trim() : null,
      broker_contact: get('broker_contact') ? String(get('broker_contact')).trim() : null,
      assigned_rm: get('assigned_rm') ? String(get('assigned_rm')).trim() : null,
      raw: Object.fromEntries(COLUMNS.map((c) => [c, get(c) ?? null])),
    });
  }
  return { rows, skipped, reasons };
}

// Performs the actual sync: pull → upsert → update sync state.
// Returns { rowCount, inserted, skipped, durationMs }.
export async function syncSheetToDb({ logger = console } = {}) {
  const sql = neon(process.env.DATABASE_URL);
  const started = Date.now();

  // Mark sync in progress so concurrent triggers don't double-pull.
  await sql`UPDATE cp_sync_state SET in_progress = true WHERE id = 1`;
  try {
    logger.log('[cp-sync] fetching sheet…');
    const { rows, skipped, reasons } = await fetchSheetRows();
    logger.log(`[cp-sync] got ${rows.length} parseable rows (skipped ${skipped})`);

    if (rows.length > 0) {
      // Chunked upsert to keep payloads small.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const source_row_ids = slice.map((r) => r.source_row_id);
        const cp_codes = slice.map((r) => r.cp_code);
        const visited_ats = slice.map((r) => r.visited_at);
        const statuses = slice.map((r) => r.status_raw);
        const contacts = slice.map((r) => r.broker_contact);
        const raws = slice.map((r) => JSON.stringify(r.raw));
        await sql`
          INSERT INTO cp_visits (source_row_id, cp_code, visited_at, status_raw, broker_contact, raw)
          SELECT s, c, v::date, st, bc, rw::jsonb
          FROM unnest(
            ${source_row_ids}::text[],
            ${cp_codes}::text[],
            ${visited_ats}::text[],
            ${statuses}::text[],
            ${contacts}::text[],
            ${raws}::text[]
          ) AS t(s, c, v, st, bc, rw)
          ON CONFLICT (source_row_id) DO UPDATE SET
            cp_code = EXCLUDED.cp_code,
            visited_at = EXCLUDED.visited_at,
            status_raw = EXCLUDED.status_raw,
            broker_contact = EXCLUDED.broker_contact,
            raw = EXCLUDED.raw,
            synced_at = now()
        `;
      }

      // Backfill cp_assignments for any CPs the sheet mentions but we don't
      // have on file. These land as unassigned (rm_id=NULL, source='sheet') and
      // can be picked up later by the admin UI.
      const cpSet = Array.from(new Set(rows.map((r) => r.cp_code)));
      await sql`
        INSERT INTO cp_assignments (cp_code, rm_id, source)
        SELECT cp, NULL, 'sheet'
        FROM unnest(${cpSet}::text[]) AS t(cp)
        ON CONFLICT (cp_code) DO NOTHING
      `;

      // If the sheet provided an assigned_rm column, set those mappings — but
      // ONLY for rows that aren't is_admin_override=true.
      const sheetAssigned = rows
        .filter((r) => r.assigned_rm)
        .map((r) => ({ cp: r.cp_code, rm: r.assigned_rm.toLowerCase() }));
      if (sheetAssigned.length > 0) {
        // Look up RMs by lowercased name match for flexibility ("Abhash Kumar" → user).
        const names = Array.from(new Set(sheetAssigned.map((s) => s.rm)));
        const users = await sql`
          SELECT id, lower(name) AS lname FROM users WHERE lower(name) = ANY(${names})
        `;
        const byName = new Map(users.map((u) => [u.lname, u.id]));
        const cps = sheetAssigned.map((s) => s.cp);
        const rmIds = sheetAssigned.map((s) => byName.get(s.rm) || null);
        await sql`
          UPDATE cp_assignments AS a
          SET rm_id = t.rm, source = 'sheet', updated_at = now()
          FROM unnest(${cps}::text[], ${rmIds}::uuid[]) AS t(cp, rm)
          WHERE a.cp_code = t.cp AND a.is_admin_override = false AND t.rm IS NOT NULL
        `;
      }
    }

    await sql`
      UPDATE cp_sync_state
      SET last_synced_at = now(),
          last_row_count = ${rows.length},
          last_error = NULL,
          in_progress = false
      WHERE id = 1
    `;
    const durationMs = Date.now() - started;
    logger.log(`[cp-sync] done in ${durationMs}ms (skipped=${skipped} ${JSON.stringify(reasons)})`);
    return { rowCount: rows.length, skipped, reasons, durationMs };
  } catch (e) {
    await sql`
      UPDATE cp_sync_state
      SET last_error = ${String(e?.message || e)}, in_progress = false
      WHERE id = 1
    `;
    throw e;
  }
}

// TTL check used by the lazy cache layer.
export async function isSyncFresh(ttlSeconds = 3600) {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`SELECT last_synced_at, in_progress FROM cp_sync_state WHERE id = 1`;
  if (!rows[0]) return false;
  const { last_synced_at, in_progress } = rows[0];
  if (in_progress) return true; // another request is already syncing — don't pile on
  if (!last_synced_at) return false;
  const age = (Date.now() - new Date(last_synced_at).getTime()) / 1000;
  return age < ttlSeconds;
}
