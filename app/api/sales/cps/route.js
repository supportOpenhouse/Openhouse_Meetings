import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { searchInventoryCps } from '@/lib/salesCp';
import { cpCodeVisitStats } from '@/lib/salesQueries';

export const runtime = 'nodejs';

// GET /api/sales/cps?search=… — channel partners come from the EXTERNAL CP
// inventory DB (channel_partners), the same source the demand RM lookup uses.
// We merge our own visit counts (from sales_visits, by the real cp_code).
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const search = new URL(request.url).searchParams.get('search') || '';
  const { configured, cps } = await searchInventoryCps(search, 30);
  if (!configured) {
    return NextResponse.json({ cps: [], configured: false });
  }

  const stats = await cpCodeVisitStats(cps.map((c) => c.cp_code));
  const merged = cps.map((c) => ({
    ...c,
    visit_count: stats[c.cp_code]?.visit_count || 0,
    last_visit_at: stats[c.cp_code]?.last_visit_at || null,
  }));
  return NextResponse.json({ cps: merged, configured: true });
}

// POST — registering a NEW partner will hand off to an external system. Not
// wired yet, so the UI surfaces a "coming soon" state.
export async function POST() {
  return NextResponse.json(
    { error: 'Partner registration is coming soon.', coming_soon: true },
    { status: 501 }
  );
}
