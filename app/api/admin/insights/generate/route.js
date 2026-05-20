import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import { generateStandardInsight, STANDARD_INSIGHTS } from '@/lib/insightsClaude';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST /api/admin/insights/generate
// Body: { insight_key, period }
// Runs one standard Claude insight over the corpus, caches it, returns it.
export async function POST(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const insightKey = body?.insight_key;
  const period = parseInt(body?.period || '90', 10) || 90;

  const def = STANDARD_INSIGHTS[insightKey];
  if (!def) {
    return NextResponse.json({ error: 'Unknown insight_key' }, { status: 400 });
  }

  try {
    const { result, meetingCount } = await generateStandardInsight(insightKey, period);
    const sql = neon(process.env.DATABASE_URL);
    const [row] = await sql`
      INSERT INTO insights (scope, insight_key, title, result, meeting_count, period_days, generated_by)
      VALUES (${def.scope}, ${insightKey}, ${def.title}, ${JSON.stringify(result)}::jsonb,
              ${meetingCount}, ${period}, ${session.user.id}::uuid)
      RETURNING id, scope, insight_key, title, result, meeting_count, period_days, generated_at
    `;
    logActivity({
      userId: session.user.id,
      eventType: 'insight.generated',
      payload: { insight_key: insightKey, title: def.title, meeting_count: meetingCount },
      request,
    });
    return NextResponse.json({ ok: true, insight: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Insight generation failed' },
      { status: 500 }
    );
  }
}
