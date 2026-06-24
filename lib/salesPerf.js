import { db } from '@/lib/db';
import {
  salesChannelPartners,
  salesVisits,
  salesClockSessions,
  salesInventory,
  users,
} from '@/drizzle/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Performance & analytics rollups.
//
// Day boundaries are computed in IST (Asia/Kolkata, UTC+5:30, no DST): the
// field-sales team operates in India, so a UTC midnight boundary would put the
// day rollover at 05:30 IST and make "today" wrong for ~5.5h each day.
//
// The page fetches a generous window (the start of the current IST month) and
// the client filters down to Today / This week / This month tabs without
// further round-trips.
// ─────────────────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// IST-local midnight for the 1st of the current month, expressed as the
// equivalent UTC instant — the earliest boundary any tab needs.
function istMonthStart() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}

// Build the list of IST calendar days from `since` through today (inclusive),
// each as { day: 'YYYY-MM-DD', count: 0 } so the bar chart has a slot per day
// even on zero-visit days. The client fills counts from the visit list.
function istDayKeys(since) {
  const pad = (n) => String(n).padStart(2, '0');
  const out = [];
  const startIst = new Date(since.getTime() + IST_OFFSET_MS);
  const todayIst = new Date(Date.now() + IST_OFFSET_MS);
  const cur = new Date(Date.UTC(startIst.getUTCFullYear(), startIst.getUTCMonth(), startIst.getUTCDate()));
  const end = Date.UTC(todayIst.getUTCFullYear(), todayIst.getUTCMonth(), todayIst.getUTCDate());
  while (cur.getTime() <= end) {
    out.push(`${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// VISIT projection used by the perf list — lean (no transcript), plus the rep
// name when scope is the whole team.
const PERF_VISIT_COLUMNS = {
  id: salesVisits.id,
  sales_rm_id: salesVisits.sales_rm_id,
  sales_cp_id: salesVisits.sales_cp_id,
  cp_code: salesVisits.cp_code,
  cp_name: salesVisits.cp_name,
  meeting_type: salesVisits.meeting_type,
  check_in_time: salesVisits.check_in_time,
  duration_seconds: salesVisits.duration_seconds,
  cp_engagement_level: salesVisits.cp_engagement_level,
  meeting_outcome: salesVisits.meeting_outcome,
  inventory_received: salesVisits.inventory_received,
  next_followup_date: salesVisits.next_followup_date,
  next_action_required: salesVisits.next_action_required,
  status: salesVisits.status,
  created_at: salesVisits.created_at,
};

// One rep's performance window: every visit since `since`, plus the counts the
// client needs that don't come from the visit rows themselves (CP
// registrations, inventory submitted, closed clock hours — each per-day so the
// active tab can re-bucket them).
export async function repPerformanceData(rmId) {
  const since = istMonthStart();
  const sinceIso = since.toISOString();

  const visits = await db
    .select(PERF_VISIT_COLUMNS)
    .from(salesVisits)
    .where(and(eq(salesVisits.sales_rm_id, rmId), gte(salesVisits.check_in_time, since)))
    .orderBy(desc(salesVisits.check_in_time));

  // CP registrations by this rep in the window (created_by = rep).
  const registrations = await db
    .select({ created_at: salesChannelPartners.created_at })
    .from(salesChannelPartners)
    .where(
      and(
        eq(salesChannelPartners.created_by, rmId),
        gte(salesChannelPartners.created_at, since)
      )
    );

  // Inventory rows submitted by this rep in the window.
  const inventory = await db
    .select({ created_at: salesInventory.created_at })
    .from(salesInventory)
    .where(and(eq(salesInventory.sales_rm_id, rmId), gte(salesInventory.created_at, since)));

  // Closed clock sessions in the window — duration in seconds computed in SQL.
  const clockSessions = await db
    .select({
      clock_in_time: salesClockSessions.clock_in_time,
      duration_seconds: sql`extract(epoch from (${salesClockSessions.clock_out_time} - ${salesClockSessions.clock_in_time}))::int`.mapWith(
        Number
      ),
    })
    .from(salesClockSessions)
    .where(
      and(
        eq(salesClockSessions.sales_rm_id, rmId),
        eq(salesClockSessions.status, 'closed'),
        gte(salesClockSessions.clock_in_time, since)
      )
    );

  return {
    since: sinceIso,
    days: istDayKeys(since),
    visits,
    registrations,
    inventory,
    clockSessions,
  };
}

// Team performance (admin). Same per-rep window data, plus a leaderboard with
// each rep's totals over the window. Visit/onboarded/registration/inventory
// counts come from correlated subqueries so the leaderboard is one round-trip.
//
// IMPORTANT drizzle rule: inside a correlated subquery the OUTER column is
// written as a LITERAL qualified name (users.id), never interpolated — drizzle
// would render an interpolated ${users.id} unqualified and the correlation
// would break.
export async function teamPerformanceData() {
  const since = istMonthStart();
  const sinceIso = since.toISOString();

  const visits = await db
    .select({
      ...PERF_VISIT_COLUMNS,
      rm_name: users.name,
      rm_email: users.email,
    })
    .from(salesVisits)
    .leftJoin(users, eq(users.id, salesVisits.sales_rm_id))
    .where(gte(salesVisits.check_in_time, since))
    .orderBy(desc(salesVisits.check_in_time));

  const registrations = await db
    .select({
      created_at: salesChannelPartners.created_at,
      created_by: salesChannelPartners.created_by,
    })
    .from(salesChannelPartners)
    .where(gte(salesChannelPartners.created_at, since));

  const inventory = await db
    .select({ created_at: salesInventory.created_at })
    .from(salesInventory)
    .where(gte(salesInventory.created_at, since));

  const clockSessions = await db
    .select({
      clock_in_time: salesClockSessions.clock_in_time,
      duration_seconds: sql`extract(epoch from (${salesClockSessions.clock_out_time} - ${salesClockSessions.clock_in_time}))::int`.mapWith(
        Number
      ),
    })
    .from(salesClockSessions)
    .where(and(eq(salesClockSessions.status, 'closed'), gte(salesClockSessions.clock_in_time, since)));

  const leaderboard = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      visit_count:
        sql`(select count(*) from sales_visits sv where sv.sales_rm_id = users.id and sv.check_in_time >= ${sinceIso}::timestamptz)`.mapWith(
          Number
        ),
      onboarded_count:
        sql`(select count(*) from sales_visits sv where sv.sales_rm_id = users.id and sv.meeting_outcome = 'onboarded' and sv.check_in_time >= ${sinceIso}::timestamptz)`.mapWith(
          Number
        ),
      registered_count:
        sql`(select count(*) from sales_channel_partners cp where cp.created_by = users.id and cp.created_at >= ${sinceIso}::timestamptz)`.mapWith(
          Number
        ),
    })
    .from(users)
    .where(eq(users.role, 'supply_rm'))
    .orderBy(
      desc(
        sql`(select count(*) from sales_visits sv where sv.sales_rm_id = users.id and sv.check_in_time >= ${sinceIso}::timestamptz)`
      )
    );

  return {
    since: sinceIso,
    days: istDayKeys(since),
    visits,
    registrations,
    inventory,
    clockSessions,
    leaderboard,
  };
}
