// Dashboard query layer for the CP tab. Responsibilities:
//   - Ensure data is fresh (lazy 1h TTL — triggers a sync if stale)
//   - Aggregate cp_visits into per-CP monthly counts
//   - Compute one of seven statuses per CP, relative to a "current month"
//   - Apply RM scoping (RM sees only their CPs; admin sees all)
//
// Status definitions (current month = M):
//   Consistently Active   visits in M, M-1, and M-2
//   Active (M-1, M)       visits in M and M-1, but not M-2
//   Active (M-2, M-1)     visits in M-2 and M-1, but not M
//   New in M              first ever visit is in M (no prior visits)
//   Churned (M-1 → M)     visits in M-1, none in M, AND had visits in M-2 or earlier
//                         (CSV legend's "Churned" — distinguishes from "Ghosted")
//   Ghosted (M-2 only)    visits only in M-2; nothing in M-1 or M; no earlier history
//   Dormant               had visits before M-2 but nothing in M-2, M-1, or M

import { neon } from '@neondatabase/serverless';
import { isSyncFresh, syncSheetToDb } from './sheetsSync';

const SYNC_TTL_SECONDS = 3600;

// Returns the first day (UTC) of `monthsBack` months before `ref`.
// e.g. shiftMonth(2025-05-18, 0) → 2025-05-01, shiftMonth(2025-05-18, 2) → 2025-03-01.
function shiftMonth(ref, monthsBack) {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - monthsBack, 1));
  return d;
}

function ym(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d) {
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function monthLabelShort(d) {
  return d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
}

// Map a YYYY-MM string back to a Date at the 1st of that month, UTC.
function ymToDate(s) {
  const [y, m] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function classify(perMonth, monthsAsc, anyPriorVisit) {
  // monthsAsc is oldest→newest. The last three are M-2, M-1, M.
  const len = monthsAsc.length;
  const m = monthsAsc[len - 1];
  const m1 = monthsAsc[len - 2];
  const m2 = monthsAsc[len - 3];
  const inM = (perMonth.get(m) || 0) > 0;
  const inM1 = (perMonth.get(m1) || 0) > 0;
  const inM2 = (perMonth.get(m2) || 0) > 0;
  const hadPrior = anyPriorVisit; // any visit strictly before m2

  if (inM && inM1 && inM2) return 'Consistently Active';
  if (inM && inM1 && !inM2) return 'Active (recent)';
  if (!inM && inM1 && inM2) return 'Active (waning)';
  if (inM && !inM1 && !inM2 && !hadPrior) return 'New';
  if (!inM && inM1) return 'Churned';
  if (!inM && !inM1 && inM2 && !hadPrior) return 'Ghosted';
  if (!inM && !inM1 && !inM2 && (hadPrior || inM2)) return 'Dormant';
  // Edge: visits ONLY in m (not first time) — treat as Active (recent).
  if (inM) return 'Active (recent)';
  return 'Dormant';
}

// Display labels are dynamic because they include month names ("Apr→May" etc).
export function statusLabel(key, monthsAsc) {
  const len = monthsAsc.length;
  const mLabel = monthLabelShort(ymToDate(monthsAsc[len - 1]));
  const m1Label = monthLabelShort(ymToDate(monthsAsc[len - 2]));
  const m2Label = monthLabelShort(ymToDate(monthsAsc[len - 3]));
  switch (key) {
    case 'Consistently Active': return 'Consistently Active';
    case 'Active (recent)': return `Active (${m1Label}–${mLabel})`;
    case 'Active (waning)': return `Active (${m2Label}–${m1Label})`;
    case 'New': return `New in ${mLabel}`;
    case 'Churned': return `Churned (${m1Label}→${mLabel})`;
    case 'Ghosted': return `Ghosted (${m2Label} only)`;
    case 'Dormant': return 'Dormant';
    default: return key;
  }
}

export const STATUS_ORDER = [
  'Consistently Active',
  'Active (recent)',
  'Active (waning)',
  'New',
  'Churned',
  'Ghosted',
  'Dormant',
];

// rmId === null → admin view (all CPs).
// monthsToShow defaults to 4 (Feb–May style); pass 0 / 'all' to expand.
export async function getCpDashboardData({ rmId = null, monthsToShow = 4, today = new Date() }) {
  // Lazy TTL sync — kick off only when stale and not already in flight.
  if (!(await isSyncFresh(SYNC_TTL_SECONDS))) {
    try {
      await syncSheetToDb({ logger: console });
    } catch (e) {
      console.warn('[cp-dashboard] sync failed, serving stale data:', e?.message || e);
    }
  }

  const sql = neon(process.env.DATABASE_URL);

  // Build the month window. The first three months from the right are used for
  // status classification regardless of how many we display.
  const totalMonths = monthsToShow === 'all' ? 24 : Math.max(monthsToShow, 3);
  const months = [];
  for (let i = totalMonths - 1; i >= 0; i--) months.push(shiftMonth(today, i));
  const monthsAsc = months.map(ym);
  const oldestDisplayMonth = months[0];

  // Load visits within the display window + a flag for any earlier visits
  // (needed to distinguish Ghosted from Dormant). Branched on admin/RM scope
  // so we don't try to interpolate SQL fragments via the neon template tag.
  const cutoff = oldestDisplayMonth.toISOString().slice(0, 10);
  const [visits, priorVisits, assignments] = rmId
    ? await Promise.all([
        sql`SELECT v.cp_code, v.visited_at
            FROM cp_visits v
            JOIN cp_assignments a ON a.cp_code = v.cp_code
            WHERE v.visited_at >= ${cutoff} AND a.rm_id = ${rmId}`,
        sql`SELECT DISTINCT v.cp_code
            FROM cp_visits v
            JOIN cp_assignments a ON a.cp_code = v.cp_code
            WHERE v.visited_at < ${cutoff} AND a.rm_id = ${rmId}`,
        sql`SELECT a.cp_code, a.rm_id, a.is_admin_override,
                   u.name AS rm_name, u.email AS rm_email
            FROM cp_assignments a
            LEFT JOIN users u ON u.id = a.rm_id
            WHERE a.rm_id = ${rmId}
            ORDER BY a.cp_code`,
      ])
    : await Promise.all([
        sql`SELECT v.cp_code, v.visited_at
            FROM cp_visits v
            JOIN cp_assignments a ON a.cp_code = v.cp_code
            WHERE v.visited_at >= ${cutoff}`,
        sql`SELECT DISTINCT v.cp_code
            FROM cp_visits v
            JOIN cp_assignments a ON a.cp_code = v.cp_code
            WHERE v.visited_at < ${cutoff}`,
        sql`SELECT a.cp_code, a.rm_id, a.is_admin_override,
                   u.name AS rm_name, u.email AS rm_email
            FROM cp_assignments a
            LEFT JOIN users u ON u.id = a.rm_id
            ORDER BY a.cp_code`,
      ]);
  const priorSet = new Set(priorVisits.map((r) => r.cp_code));

  // Aggregate per-CP monthly counts.
  const perCp = new Map(); // cp_code → Map<YM, count>
  for (const v of visits) {
    const d = new Date(v.visited_at);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    let m = perCp.get(v.cp_code);
    if (!m) { m = new Map(); perCp.set(v.cp_code, m); }
    m.set(k, (m.get(k) || 0) + 1);
  }

  const cps = assignments.map((a) => {
    const counts = perCp.get(a.cp_code) || new Map();
    const monthly = monthsAsc.map((k) => counts.get(k) || 0);
    const statusKey = classify(counts, monthsAsc, priorSet.has(a.cp_code));
    return {
      cp_code: a.cp_code,
      rm_id: a.rm_id,
      rm_name: a.rm_name,
      rm_email: a.rm_email,
      is_admin_override: a.is_admin_override,
      monthly,
      status: statusLabel(statusKey, monthsAsc),
      status_key: statusKey,
    };
  });

  // Slice the display window if the caller asked for fewer months than the
  // 3-month minimum we use for classification.
  const displayCount = monthsToShow === 'all' ? totalMonths : monthsToShow;
  const displayStart = totalMonths - displayCount;
  const displayMonths = monthsAsc.slice(displayStart).map((k) => ({
    key: k,
    label: monthLabel(ymToDate(k)),
    short: monthLabelShort(ymToDate(k)),
  }));
  for (const cp of cps) cp.monthly = cp.monthly.slice(displayStart);

  // Totals per month across CPs in scope.
  const totals = displayMonths.map((_, i) =>
    cps.reduce((sum, cp) => sum + (cp.monthly[i] || 0), 0)
  );

  // Sort: by status (per STATUS_ORDER), then most-recent visit count desc,
  // then cp_code as a tie-breaker.
  const orderRank = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]));
  cps.sort((a, b) => {
    const ra = orderRank[a.status_key] ?? 99;
    const rb = orderRank[b.status_key] ?? 99;
    if (ra !== rb) return ra - rb;
    const last = displayMonths.length - 1;
    const va = a.monthly[last] || 0;
    const vb = b.monthly[last] || 0;
    if (va !== vb) return vb - va;
    return a.cp_code.localeCompare(b.cp_code);
  });

  return {
    months: displayMonths,
    cps,
    totals,
    counts: {
      total: cps.length,
      byStatus: STATUS_ORDER.reduce((acc, s) => {
        acc[s] = cps.filter((c) => c.status_key === s).length;
        return acc;
      }, {}),
    },
  };
}

// Used by the admin assignment UI. Branches by rmFilter shape so we never
// try to cast a non-uuid string ('unassigned' / 'all') to a uuid.
export async function listAssignmentsForAdmin({ search = '', rmFilter = null }) {
  const sql = neon(process.env.DATABASE_URL);
  const like = `%${(search || '').replace(/[%_]/g, '\\$&')}%`;
  const hasSearch = search && search.length > 0;

  if (rmFilter === 'unassigned') {
    return hasSearch
      ? sql`SELECT a.cp_code, a.rm_id, a.is_admin_override, a.source, a.updated_at,
                   u.name AS rm_name, u.email AS rm_email
            FROM cp_assignments a LEFT JOIN users u ON u.id = a.rm_id
            WHERE a.rm_id IS NULL AND a.cp_code ILIKE ${like}
            ORDER BY a.cp_code LIMIT 1000`
      : sql`SELECT a.cp_code, a.rm_id, a.is_admin_override, a.source, a.updated_at,
                   u.name AS rm_name, u.email AS rm_email
            FROM cp_assignments a LEFT JOIN users u ON u.id = a.rm_id
            WHERE a.rm_id IS NULL
            ORDER BY a.cp_code LIMIT 1000`;
  }

  // rmFilter looks like a UUID or is null/'all'.
  const filterIsUuid = rmFilter && rmFilter !== 'all' && /^[0-9a-f-]{36}$/i.test(rmFilter);

  if (filterIsUuid && hasSearch) {
    return sql`SELECT a.cp_code, a.rm_id, a.is_admin_override, a.source, a.updated_at,
                      u.name AS rm_name, u.email AS rm_email
               FROM cp_assignments a LEFT JOIN users u ON u.id = a.rm_id
               WHERE a.rm_id = ${rmFilter}::uuid
                 AND (a.cp_code ILIKE ${like} OR u.name ILIKE ${like})
               ORDER BY a.cp_code LIMIT 1000`;
  }
  if (filterIsUuid) {
    return sql`SELECT a.cp_code, a.rm_id, a.is_admin_override, a.source, a.updated_at,
                      u.name AS rm_name, u.email AS rm_email
               FROM cp_assignments a LEFT JOIN users u ON u.id = a.rm_id
               WHERE a.rm_id = ${rmFilter}::uuid
               ORDER BY a.cp_code LIMIT 1000`;
  }
  if (hasSearch) {
    return sql`SELECT a.cp_code, a.rm_id, a.is_admin_override, a.source, a.updated_at,
                      u.name AS rm_name, u.email AS rm_email
               FROM cp_assignments a LEFT JOIN users u ON u.id = a.rm_id
               WHERE a.cp_code ILIKE ${like} OR u.name ILIKE ${like}
               ORDER BY a.cp_code LIMIT 1000`;
  }
  return sql`SELECT a.cp_code, a.rm_id, a.is_admin_override, a.source, a.updated_at,
                    u.name AS rm_name, u.email AS rm_email
             FROM cp_assignments a LEFT JOIN users u ON u.id = a.rm_id
             ORDER BY a.cp_code LIMIT 1000`;
}
