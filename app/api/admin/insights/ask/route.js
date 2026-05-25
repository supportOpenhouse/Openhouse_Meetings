import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';
import { answerCustomQuestion } from '@/lib/insightsClaude';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST /api/admin/insights/ask
// Body: { question, scope, period }
// Answers a free-text question over the meeting corpus, caches it.
export async function POST(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const question = String(body?.question || '').trim();
  const scope = body?.scope || 'all';
  const period = parseInt(body?.period || '90', 10) || 90;
  const since = body?.since || null;
  const until = body?.until || null;
  const rmId = body?.rmId && body.rmId !== 'all' ? body.rmId : null;

  if (!question || question.length < 5) {
    return NextResponse.json({ error: 'Question is too short' }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: 'Question is too long (max 500 chars)' }, { status: 400 });
  }

  try {
    const { result, meetingCount } = await answerCustomQuestion(question, scope, period, { since, until, rmId });
    const sql = neon(process.env.DATABASE_URL);
    const [row] = await sql`
      INSERT INTO insights (scope, insight_key, title, question, result, meeting_count, period_days, generated_by)
      VALUES (${scope}, 'custom', ${question.slice(0, 120)}, ${question},
              ${JSON.stringify(result)}::jsonb, ${meetingCount}, ${period}, ${session.user.id}::uuid)
      RETURNING id, scope, insight_key, title, question, result, meeting_count, period_days, generated_at
    `;
    logActivity({
      userId: session.user.id,
      eventType: 'insight.generated',
      payload: { kind: 'custom_question', question: question.slice(0, 120), meeting_count: meetingCount },
      request,
    });
    return NextResponse.json({ ok: true, insight: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Question failed' },
      { status: 500 }
    );
  }
}
