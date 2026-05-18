import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getCpDashboardData } from '@/lib/cpQueries';

export const runtime = 'nodejs';
// Dashboard reads are not cached at the framework level — the cpQueries layer
// does its own 1-hour TTL against the sheet, and per-request work is cheap.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const monthsParam = searchParams.get('months');
  const monthsToShow = monthsParam === 'all' ? 'all' : Math.max(3, Math.min(parseInt(monthsParam || '4', 10) || 4, 24));

  // RMs see only their own CPs. Admin can pass ?rm=<userId> to filter, or omit to see all.
  const rmIdParam = searchParams.get('rm');
  let rmId = null;
  if (session.user.role === 'admin') {
    if (rmIdParam && rmIdParam !== 'all') rmId = rmIdParam;
  } else {
    rmId = session.user.id;
  }

  const data = await getCpDashboardData({ rmId, monthsToShow });
  return NextResponse.json(data);
}
