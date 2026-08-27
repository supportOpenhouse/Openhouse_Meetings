import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchInsightRecords, toModalRow } from '@/lib/insightsRecords';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/insights/stat-meetings
// The recording rows behind a Tier-1 stat (drill-down modal). Shares the exact
// filter logic with the CSV export via lib/insightsRecords so they never drift.
//
// Required: type ∈ visit | engagement | onboarding | call
// Optional: temp | param | outcome | call_field+call_value | since | until | rm | limit
export async function GET(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  if (!['visit', 'engagement', 'onboarding', 'call', 'negotiation'].includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }
  const rm = searchParams.get('rm');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

  const rows = await fetchInsightRecords({
    type,
    temp: searchParams.get('temp') || null,
    param: searchParams.get('param') || null,
    outcome: searchParams.get('outcome') || null,
    callField: searchParams.get('call_field') || null,
    callValue: searchParams.get('call_value') || null,
    since: searchParams.get('since') || null,
    until: searchParams.get('until') || null,
    rmId: rm && rm !== 'all' ? rm : null,
    limit,
  });

  return NextResponse.json({ meetings: rows.map(toModalRow) });
}
