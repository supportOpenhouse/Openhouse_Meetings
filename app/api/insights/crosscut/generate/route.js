import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import { generateStandardInsight, STANDARD_INSIGHTS } from '@/lib/insightsClaude';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CROSSCUT_KEYS = new Set(['cross_growth', 'cross_pipeline']);

// POST /api/insights/crosscut/generate
// Body: { insight_key, period }
// Generates one cross-cut insight for the caller. Admin → company-wide. RM →
// scoped to their assigned CPs, cached under "<key>#<rmId>".
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'rm' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const insightKey = body?.insight_key;
  const period = parseInt(body?.period || '90', 10) || 90;
  if (!CROSSCUT_KEYS.has(insightKey)) {
    return NextResponse.json({ error: 'Unknown insight_key' }, { status: 400 });
  }

  const def = STANDARD_INSIGHTS[insightKey];
  const rmId = session.user.role === 'rm' ? session.user.id : null;
  const storedKey = rmId ? `${insightKey}#${rmId}` : insightKey;

  try {
    const { result, meetingCount } = await generateStandardInsight(insightKey, period, rmId);
    const sql = neon(process.env.DATABASE_URL);
    const [row] = await sql`
      INSERT INTO insights (scope, insight_key, title, result, meeting_count, period_days, generated_by)
      VALUES (${def.scope}, ${storedKey}, ${def.title}, ${JSON.stringify(result)}::jsonb,
              ${meetingCount}, ${period}, ${session.user.id}::uuid)
      RETURNING id, scope, insight_key, title, result, meeting_count, period_days, generated_at
    `;
    logActivity({
      userId: session.user.id,
      eventType: 'insight.generated',
      payload: { insight_key: insightKey, scoped: !!rmId, meeting_count: meetingCount },
      request,
    });
    return NextResponse.json({ ok: true, insight: { ...row, insight_key: insightKey } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Insight generation failed' },
      { status: 500 }
    );
  }
}
