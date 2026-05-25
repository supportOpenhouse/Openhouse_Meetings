import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import {
  getVisitMetrics,
  getEngagementMetrics,
  getOnboardingMetrics,
  getCallMetrics,
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
  const since = searchParams.get('since') || null;
  const until = searchParams.get('until') || null;
  const rm = searchParams.get('rm');
  const rmId = rm && rm !== 'all' ? rm : null;
  const opts = { since, until, rmId };

  const sql = neon(process.env.DATABASE_URL);

  const [visit, engagement, onboarding, direct, cpFocus, standardRows, custom, pinnedList, savedItems] = await Promise.all([
    getVisitMetrics(period, opts),
    getEngagementMetrics(period, opts),
    getOnboardingMetrics(period, opts),
    getCallMetrics(period, opts),
    // CP focus is RM-assignment scoped, not meeting-RM-scoped — pass rmId through.
    getCpFocusList(15, rmId),
    // Standard insights: latest row per (scope, insight_key).
    sql`
      SELECT DISTINCT ON (scope, insight_key)
        id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at, pinned
      FROM insights
      WHERE insight_key <> 'custom'
      ORDER BY scope, insight_key, generated_at DESC
    `,
    // Custom questions: every row, most recent first (do NOT dedupe).
    sql`
      SELECT id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at, pinned
      FROM insights
      WHERE insight_key = 'custom'
      ORDER BY generated_at DESC
      LIMIT 20
    `,
    // Pinned insights — legacy "save whole card" rows, no longer surfaced in
    // the new UI but kept in the DB for backward compatibility.
    sql`
      SELECT id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at, pinned
      FROM insights
      WHERE pinned = true
      ORDER BY scope, generated_at DESC
    `,
    // Saved insight items — one row per "Save this point" click, the active
    // mechanism for keeping specific bullets alive across regenerations.
    sql`
      SELECT id, source_insight_id, source_title, scope, item, saved_at
      FROM saved_insight_items
      ORDER BY scope, saved_at DESC
    `,
  ]);

  const standard = {};
  for (const row of standardRows) standard[row.insight_key] = row;

  return NextResponse.json({
    period,
    filters: { since, until, rmId },
    tier1: { visit, engagement, onboarding, direct, cpFocus },
    standard,
    custom,
    pinned: pinnedList,
    savedItems,
  });
}
