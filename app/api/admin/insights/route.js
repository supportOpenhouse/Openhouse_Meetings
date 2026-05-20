import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import {
  getVisitMetrics,
  getEngagementMetrics,
  getOnboardingMetrics,
  getCpFocusList,
} from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/insights?period=90
// Returns Tier-1 SQL metrics (computed live, free) + the latest cached
// Tier-2 Claude insight per key + recent custom questions.
export async function GET(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = parseInt(searchParams.get('period') || '90', 10) || 90;

  const sql = neon(process.env.DATABASE_URL);

  const [visit, engagement, onboarding, cpFocus, standardRows, custom] = await Promise.all([
    getVisitMetrics(period),
    getEngagementMetrics(period),
    getOnboardingMetrics(period),
    getCpFocusList(15),
    // Standard insights: latest row per (scope, insight_key).
    sql`
      SELECT DISTINCT ON (scope, insight_key)
        id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at
      FROM insights
      WHERE insight_key <> 'custom'
      ORDER BY scope, insight_key, generated_at DESC
    `,
    // Custom questions: every row, most recent first (do NOT dedupe).
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

  return NextResponse.json({
    period,
    tier1: { visit, engagement, onboarding, cpFocus },
    standard,
    custom,
  });
}
