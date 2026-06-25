import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supplyInsightsData } from '@/lib/supplyInsights';
import { answerSupplyQuestion, isSupplyAiConfigured } from '@/lib/supplyInsightsClaude';

export const runtime = 'nodejs';
export const maxDuration = 120;

const allowed = (role) => role === 'admin' || role === 'supply_manager';

// GET — tier-1 metrics for a period (re-fetched when the range changes).
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!allowed(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const period = parseInt(sp.get('period') || '90', 10);
  const data = await supplyInsightsData(Number.isFinite(period) ? period : 90, {
    since: sp.get('since') || undefined,
    until: sp.get('until') || undefined,
    rmId: sp.get('rm_id') || undefined,
  });
  return NextResponse.json(data);
}

// POST — Ask anything (Claude over the supply-visit corpus).
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!allowed(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isSupplyAiConfigured()) {
    return NextResponse.json({ error: 'AI is not configured (ANTHROPIC_API_KEY missing).' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const question = (body.question || '').trim();
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });
  const period = Number.isFinite(body.period) ? body.period : 90;

  try {
    const out = await answerSupplyQuestion(question, period, {
      since: body.since,
      until: body.until,
      rmId: body.rm_id,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Could not answer the question.' }, { status: 502 });
  }
}
