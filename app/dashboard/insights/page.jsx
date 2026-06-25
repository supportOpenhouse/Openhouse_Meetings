import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { getCpFocusList } from '@/lib/analytics';
import RmInsightsClient from './client';

// RM-facing cross-cut insights — scoped to the RM's own assigned CPs.
export default async function RmInsightsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'admin') redirect('/admin/insights');
  if (session.user.role === 'direct_rm') redirect('/direct');

  const rmId = session.user.id;
  const sql = neon(process.env.DATABASE_URL);
  const keys = ['cross_growth', 'cross_pipeline'].map((k) => `${k}#${rmId}`);

  const [cpFocus, cachedRows] = await Promise.all([
    getCpFocusList(15, rmId),
    sql`
      SELECT DISTINCT ON (insight_key)
        id, insight_key, title, result, meeting_count, period_days, generated_at
      FROM insights
      WHERE insight_key = ANY(${keys}::text[])
      ORDER BY insight_key, generated_at DESC
    `,
  ]);

  const standard = {};
  for (const row of cachedRows) {
    standard[row.insight_key.split('#')[0]] = { ...row, insight_key: row.insight_key.split('#')[0] };
  }

  return (
    <>
      <RmInsightsClient
        initial={JSON.parse(JSON.stringify({ cpFocus, standard }))}
        user={{ name: session.user.name }}
      />
    </>
  );
}
