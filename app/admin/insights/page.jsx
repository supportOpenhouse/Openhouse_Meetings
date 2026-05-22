import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import AppShell from '@/components/AppShell';
import {
  getVisitMetrics,
  getEngagementMetrics,
  getOnboardingMetrics,
  getCallMetrics,
  getCpFocusList,
} from '@/lib/analytics';
import InsightsClient from './client';

export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const period = 90;
  const sql = neon(process.env.DATABASE_URL);

  const [visit, engagement, onboarding, direct, cpFocus, standardRows, custom] = await Promise.all([
    getVisitMetrics(period),
    getEngagementMetrics(period),
    getOnboardingMetrics(period),
    getCallMetrics(period),
    getCpFocusList(15),
    sql`
      SELECT DISTINCT ON (scope, insight_key)
        id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at
      FROM insights
      WHERE insight_key <> 'custom'
      ORDER BY scope, insight_key, generated_at DESC
    `,
    sql`
      SELECT id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at
      FROM insights
      WHERE insight_key = 'custom'
      ORDER BY generated_at DESC
      LIMIT 20
    `,
  ]);

  const standard = {};
  for (const row of standardRows) standard[row.insight_key] = row;

  const initial = {
    period,
    tier1: { visit, engagement, onboarding, direct, cpFocus },
    standard,
    custom,
  };

  return (
    <AppShell user={session.user} current="insights">
      <InsightsClient initialData={JSON.parse(JSON.stringify(initial))} />
    </AppShell>
  );
}
