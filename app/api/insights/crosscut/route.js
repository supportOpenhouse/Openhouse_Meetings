import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import { getCpFocusList } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The two cross-cut insights an RM / admin can see.
const CROSSCUT_KEYS = ['cross_growth', 'cross_pipeline'];

// GET /api/insights/crosscut
// Cross-cut insights for the caller. Admin → whole company. RM → scoped to
// their assigned CPs (cached separately per RM via a "<key>#<rmId>" cache key).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'rm' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rmId = session.user.role === 'rm' ? session.user.id : null;
  const sql = neon(process.env.DATABASE_URL);

  // Cache keys: plain for admin, suffixed with the RM id for an RM.
  const keys = CROSSCUT_KEYS.map((k) => (rmId ? `${k}#${rmId}` : k));

  const [cpFocus, cachedRows] = await Promise.all([
    getCpFocusList(15, rmId),
    sql`
      SELECT DISTINCT ON (insight_key)
        id, scope, insight_key, title, result, meeting_count, period_days, generated_at
      FROM insights
      WHERE insight_key = ANY(${keys}::text[])
      ORDER BY insight_key, generated_at DESC
    `,
  ]);

  // Map cached rows back to the base key the UI uses.
  const standard = {};
  for (const row of cachedRows) {
    const base = row.insight_key.split('#')[0];
    standard[base] = { ...row, insight_key: base };
  }

  return NextResponse.json({ scope: rmId ? 'rm' : 'admin', cpFocus, standard });
}
