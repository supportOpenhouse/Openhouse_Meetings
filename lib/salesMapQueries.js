// Live-map + clock data access. Clock sessions track a rep's working day
// (one open session at a time); location pings are the GPS breadcrumb trail
// rendered as route polylines on the map. All timestamps are UTC; the IST day
// boundary is computed the same way as the dashboard rollup so "today" matches
// the field team's actual working day in India.

import { db } from '@/lib/db';
import { salesClockSessions, salesLocationPings, users } from '@/drizzle/schema';
import { eq, and, asc, desc, gte, sql } from 'drizzle-orm';

// IST (Asia/Kolkata, UTC+5:30, no DST) local-midnight expressed as the
// equivalent UTC instant. Returns a Date.
function startOfIstDay() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Clock sessions
// ─────────────────────────────────────────────────────────────────────────────

// The rep's current open session, or undefined if they are clocked out.
export async function openSessionFor(rmId) {
  const [row] = await db
    .select()
    .from(salesClockSessions)
    .where(
      and(eq(salesClockSessions.sales_rm_id, rmId), eq(salesClockSessions.status, 'open'))
    )
    .orderBy(desc(salesClockSessions.clock_in_time))
    .limit(1);
  return row;
}

// Open a new work session. If a stale open session already exists we close it
// first so the "one open session per rep" invariant always holds.
export async function clockIn(rmId, lat, lng) {
  await db
    .update(salesClockSessions)
    .set({ status: 'closed', clock_out_time: new Date() })
    .where(
      and(eq(salesClockSessions.sales_rm_id, rmId), eq(salesClockSessions.status, 'open'))
    );

  const [row] = await db
    .insert(salesClockSessions)
    .values({
      sales_rm_id: rmId,
      clock_in_time: new Date(),
      clock_in_lat: lat,
      clock_in_lng: lng,
      status: 'open',
    })
    .returning();
  return row;
}

// Close the rep's open session. Returns the closed row, or undefined if they
// were not clocked in.
export async function clockOut(rmId, lat, lng) {
  const [row] = await db
    .update(salesClockSessions)
    .set({
      status: 'closed',
      clock_out_time: new Date(),
      clock_out_lat: lat,
      clock_out_lng: lng,
    })
    .where(
      and(eq(salesClockSessions.sales_rm_id, rmId), eq(salesClockSessions.status, 'open'))
    )
    .returning();
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Location pings
// ─────────────────────────────────────────────────────────────────────────────

export async function insertPing({ rmId, lat, lng, accuracy, sessionId }) {
  const [row] = await db
    .insert(salesLocationPings)
    .values({
      sales_rm_id: rmId,
      clock_session_id: sessionId ?? null,
      lat,
      lng,
      accuracy: accuracy ?? null,
      recorded_at: new Date(),
    })
    .returning();
  return row;
}

// Today's pings (IST day) for one rep, or for everyone when { all: true }.
// Ordered oldest→newest so the route polyline draws in travel order.
export async function todayPingsByRep({ rmId, all } = {}) {
  const start = startOfIstDay();
  const conds = [gte(salesLocationPings.recorded_at, start)];
  if (!all && rmId) conds.push(eq(salesLocationPings.sales_rm_id, rmId));

  return db
    .select({
      id: salesLocationPings.id,
      sales_rm_id: salesLocationPings.sales_rm_id,
      clock_session_id: salesLocationPings.clock_session_id,
      lat: salesLocationPings.lat,
      lng: salesLocationPings.lng,
      accuracy: salesLocationPings.accuracy,
      recorded_at: salesLocationPings.recorded_at,
    })
    .from(salesLocationPings)
    .where(and(...conds))
    .orderBy(asc(salesLocationPings.recorded_at));
}

// The latest ping per rep today + whether they currently have an open clock
// session. Correlated subqueries keep this a single round-trip. NOTE the
// outer column is written as the literal qualified name `users.id` inside the
// sql`` template — never interpolate ${users.id} (drizzle renders it
// unqualified and the subquery silently returns wrong rows).
export async function latestPerRep() {
  const start = startOfIstDay();
  const startIso = start.toISOString();

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      latest_lat: sql`(
        select p.lat from sales_location_pings p
        where p.sales_rm_id = users.id and p.recorded_at >= ${startIso}::timestamptz
        order by p.recorded_at desc limit 1
      )`.mapWith(Number),
      latest_lng: sql`(
        select p.lng from sales_location_pings p
        where p.sales_rm_id = users.id and p.recorded_at >= ${startIso}::timestamptz
        order by p.recorded_at desc limit 1
      )`.mapWith(Number),
      last_seen: sql`(
        select max(p.recorded_at) from sales_location_pings p
        where p.sales_rm_id = users.id and p.recorded_at >= ${startIso}::timestamptz
      )`,
      ping_count: sql`(
        select count(*) from sales_location_pings p
        where p.sales_rm_id = users.id and p.recorded_at >= ${startIso}::timestamptz
      )`.mapWith(Number),
      is_clocked_in: sql`exists(
        select 1 from sales_clock_sessions s
        where s.sales_rm_id = users.id and s.status = 'open'
      )`,
    })
    .from(users)
    .where(eq(users.role, 'sales_rm'))
    .orderBy(asc(users.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-level fetchers (shape the payload the map client consumes)
// ─────────────────────────────────────────────────────────────────────────────

// Admin team view: every active rep that has pings today, with their route +
// latest position + clock state.
export async function teamMapData() {
  const reps = await latestPerRep();
  const pings = await todayPingsByRep({ all: true });

  const byRep = new Map();
  for (const p of pings) {
    if (!byRep.has(p.sales_rm_id)) byRep.set(p.sales_rm_id, []);
    byRep.get(p.sales_rm_id).push({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at });
  }

  const active = reps
    .filter((r) => (r.ping_count || 0) > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      image: r.image,
      is_clocked_in: !!r.is_clocked_in,
      last_seen: r.last_seen,
      latest: { lat: r.latest_lat, lng: r.latest_lng },
      route: byRep.get(r.id) || [],
    }));

  return { reps: active };
}

// Rep self view: their own route today + open clock session (if any).
export async function myMapData(rmId) {
  const pings = await todayPingsByRep({ rmId });
  const session = await openSessionFor(rmId);
  return {
    route: pings.map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: p.recorded_at })),
    session: session
      ? {
          id: session.id,
          status: session.status,
          clock_in_time: session.clock_in_time,
          clock_in_lat: session.clock_in_lat,
          clock_in_lng: session.clock_in_lng,
        }
      : null,
  };
}
