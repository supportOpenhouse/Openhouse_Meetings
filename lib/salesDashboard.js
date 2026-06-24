import { db } from '@/lib/db';
import { salesVisits } from '@/drizzle/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// Default daily targets for a field-sales rep. Used by the Daily Targets card.
export const DAILY_MEETING_TARGET = 5;
export const DAILY_CP_TARGET = 5;

// IST (Asia/Kolkata, UTC+5:30, no DST) day boundary — same logic as
// salesDashboardData; a UTC midnight would roll over at 05:30 IST.
function istStartOfDay() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  );
}

// Extra rollups for the rich FCP home, computed entirely from this rep's visits
// (partners come from the external inventory now, keyed by cp_code):
//  - meetings logged today + distinct partners visited today (Daily Targets)
//  - the 3 most-recently-visited partners (Recent partners cards)
export async function salesHomeExtras(rmId) {
  const startOfDay = istStartOfDay().toISOString();

  const [row] = await db
    .select({
      meetings: sql`count(*) filter (where ${salesVisits.check_in_time} >= ${startOfDay}::timestamptz)::int`,
      partners: sql`count(distinct ${salesVisits.cp_code}) filter (where ${salesVisits.check_in_time} >= ${startOfDay}::timestamptz)::int`,
    })
    .from(salesVisits)
    .where(eq(salesVisits.sales_rm_id, rmId));

  const recentRows = await db
    .select({
      cp_code: salesVisits.cp_code,
      cp_name: sql`max(${salesVisits.cp_name})`,
      last_visit_at: sql`max(${salesVisits.check_in_time})`,
      visit_count: sql`count(*)::int`,
    })
    .from(salesVisits)
    .where(and(eq(salesVisits.sales_rm_id, rmId), sql`${salesVisits.cp_code} is not null`))
    .groupBy(salesVisits.cp_code)
    .orderBy(desc(sql`max(${salesVisits.check_in_time})`))
    .limit(3);

  const recentCps = recentRows.map((r) => ({
    id: r.cp_code,
    cp_id: r.cp_code,
    cp_name: r.cp_name,
    phone_primary: null,
    visit_count: r.visit_count,
    last_visit_at: r.last_visit_at,
  }));

  return {
    targets: {
      meetingsToday: row?.meetings || 0,
      cpsToday: row?.partners || 0,
      meetingTarget: DAILY_MEETING_TARGET,
      cpTarget: DAILY_CP_TARGET,
    },
    recentCps,
  };
}
