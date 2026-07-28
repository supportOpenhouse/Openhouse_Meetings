import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { salestrailRecordings } from '@/lib/salestrailRecordings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/salestrail/recordings?since&until&rm&division
// The pulled call recordings for a filter window. Admin only.
export async function GET(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const rm = sp.get('rm');
  const recordings = await salestrailRecordings({
    since: sp.get('since') || null,
    until: sp.get('until') || null,
    rmId: rm && rm !== 'all' ? rm : null,
    division: sp.get('division') || 'all',
  });
  return NextResponse.json({ recordings });
}
