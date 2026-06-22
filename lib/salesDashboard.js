import { db } from '@/lib/db';
import { salesChannelPartners, salesVisits } from '@/drizzle/schema';
import { eq, desc, sql } from 'drizzle-orm';

// Default daily targets for a field-sales rep. Used by the Daily Targets card.
export const DAILY_MEETING_TARGET = 5;
export const DAILY_CP_TARGET = 5;

// IST (Asia/Kolkata, UTC+5:30, no DST) day boundary — the field-sales team
// operates in India, so a UTC midnight boundary would rollover at 05:30 IST and
// make "today" wrong for ~5.5h each day. Same logic as salesDashboardData.
function istStartOfDay() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  );
}

// Extra rollups the rich FCP home needs on top of salesDashboardData:
//  - today's meeting count + today's CP-registration count for this rep
//    (drives the Daily Targets progress bars)
//  - the 3 most-recently-registered partners (the Recent partners cards)
export async function salesHomeExtras(rmId) {
  const startOfDay = istStartOfDay().toISOString();

  // Meetings (visits) this rep checked in today.
  const [meetingRow] = await db
    .select({
      n: sql`count(*) filter (where ${salesVisits.check_in_time} >= ${startOfDay}::timestamptz)::int`,
    })
    .from(salesVisits)
    .where(eq(salesVisits.sales_rm_id, rmId));

  // Channel partners this rep registered today.
  const [cpRow] = await db
    .select({
      n: sql`count(*) filter (where ${salesChannelPartners.created_at} >= ${startOfDay}::timestamptz)::int`,
    })
    .from(salesChannelPartners)
    .where(eq(salesChannelPartners.created_by, rmId));

  // Most-recent active partners (shared registry) for the Recent partners cards.
  const recentCps = await db
    .select({
      id: salesChannelPartners.id,
      cp_id: salesChannelPartners.cp_id,
      cp_name: salesChannelPartners.cp_name,
      phone_primary: salesChannelPartners.phone_primary,
      created_at: salesChannelPartners.created_at,
    })
    .from(salesChannelPartners)
    .where(eq(salesChannelPartners.is_active, true))
    .orderBy(desc(salesChannelPartners.created_at))
    .limit(3);

  return {
    targets: {
      meetingsToday: meetingRow?.n || 0,
      cpsToday: cpRow?.n || 0,
      meetingTarget: DAILY_MEETING_TARGET,
      cpTarget: DAILY_CP_TARGET,
    },
    recentCps,
  };
}
