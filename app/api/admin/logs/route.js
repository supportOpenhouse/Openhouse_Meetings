import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listRecentActivity, listOnlineUsers } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/logs?event=cp.&user=<uuid>&since=2026-05-01&limit=200
// All filters optional. Returns { activity, online }.
export async function GET(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventPrefix = searchParams.get('event') || null;
  const userId = searchParams.get('user') || null;
  const sinceRaw = searchParams.get('since');
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000);

  const [activity, online] = await Promise.all([
    listRecentActivity({ limit, eventType: eventPrefix, userId, since }),
    listOnlineUsers({ windowSeconds: 300 }),
  ]);

  return NextResponse.json({ activity, online });
}
