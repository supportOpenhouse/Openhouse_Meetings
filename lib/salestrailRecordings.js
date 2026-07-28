import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Salestrail calls are matched to a `users` row by email at import time (any
// role except direct_rm), so a call belongs to Supply or Demand by that user's
// role.
const SUPPLY_ROLES = ['supply_rm', 'supply_manager'];

// The people whose calls we've pulled — for the person filter dropdown.
export async function salestrailPersons() {
  return sql`
    SELECT u.id, u.name, u.email, u.role, count(*)::int AS n
    FROM meetings m
    JOIN users u ON u.id = m.rm_id
    WHERE m.salestrail_call_id IS NOT NULL
    GROUP BY u.id, u.name, u.email, u.role
    ORDER BY u.name NULLS LAST
  `;
}

// The pulled recordings for a filter window. Lean projection (no summary) — the
// table only needs person / time / duration / status / number.
//   division: 'all' | 'supply' | 'demand'
export const RECORDINGS_LIMIT = 5000;

export async function salestrailRecordings({ since = null, until = null, rmId = null, division = 'all', limit = RECORDINGS_LIMIT } = {}) {
  const div = division === 'supply' ? 'supply' : division === 'demand' ? 'demand' : null;
  return sql`
    SELECT m.id, m.started_at, m.duration_seconds, m.status, m.cp_mobile,
           m.salestrail_call_id, m.audio_url,
           u.id AS rm_id, u.name AS rm_name, u.email AS rm_email, u.role AS rm_role
    FROM meetings m
    LEFT JOIN users u ON u.id = m.rm_id
    WHERE m.salestrail_call_id IS NOT NULL
      AND (${since}::timestamptz IS NULL OR m.started_at >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR m.started_at <= ${until}::timestamptz)
      AND (${rmId}::uuid IS NULL OR m.rm_id = ${rmId}::uuid)
      AND (
        ${div}::text IS NULL
        OR (${div}::text = 'supply' AND u.role = ANY(${SUPPLY_ROLES}))
        OR (${div}::text = 'demand' AND NOT (u.role = ANY(${SUPPLY_ROLES})))
      )
    ORDER BY m.started_at DESC
    LIMIT ${limit}
  `;
}

export function isSupplyRole(role) {
  return SUPPLY_ROLES.includes(role);
}
