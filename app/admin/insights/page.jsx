import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import {
  getVisitMetrics,
  getEngagementMetrics,
  getOnboardingMetrics,
  getCallMetrics,
  getCpFocusList,
} from '@/lib/analytics';
import { listRMs } from '@/lib/queries';
import InsightsClient from './client';

export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const period = 90;
  const sql = neon(process.env.DATABASE_URL);

  const [visit, engagement, onboarding, direct, cpFocus, standardRows, custom, pinned, savedItems, rms] = await Promise.all([
    getVisitMetrics(period),
    getEngagementMetrics(period),
    getOnboardingMetrics(period),
    getCallMetrics(period),
    getCpFocusList(15),
    sql`
      SELECT DISTINCT ON (scope, insight_key)
        id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at, pinned
      FROM insights
      WHERE insight_key <> 'custom'
      ORDER BY scope, insight_key, generated_at DESC
    `,
    sql`
      SELECT id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at, pinned
      FROM insights
      WHERE insight_key = 'custom'
      ORDER BY generated_at DESC
      LIMIT 20
    `,
    sql`
      SELECT id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at, pinned
      FROM insights
      WHERE pinned = true
      ORDER BY scope, generated_at DESC
    `,
    sql`
      SELECT id, source_insight_id, source_title, scope, item, saved_at
      FROM saved_insight_items
      ORDER BY scope, saved_at DESC
    `,
    listRMs(),
  ]);

  const standard = {};
  for (const row of standardRows) standard[row.insight_key] = row;

  // Default date window — computed in IST on the server so it matches what
  // the client computes during hydration (avoids a date input mismatch).
  const initial = {
    period,
    defaultSince: istDateValue(period || 90),
    defaultUntil: istDateValue(0),
    tier1: { visit, engagement, onboarding, direct, cpFocus },
    standard,
    custom,
    pinned,
    savedItems,
    rms,
  };

  return (
    <>
      <InsightsClient initialData={JSON.parse(JSON.stringify(initial))} />
    </>
  );
}

// YYYY-MM-DD for the IST calendar date N days ago (0 = today). Deterministic
// regardless of where it runs, so it produces the same string on both sides
// of an SSR → hydration boundary.
function istDateValue(offsetDays = 0) {
  const ms = Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
