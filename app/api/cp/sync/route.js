import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { syncSheetToDb } from '@/lib/sheetsSync';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sheet pulls can be slow on a cold start — give the route up to a minute.
export const maxDuration = 60;

export async function POST(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const result = await syncSheetToDb({ logger: console });
    logActivity({
      userId: session.user.id,
      eventType: 'cp.sync_triggered',
      payload: { rowCount: result.rowCount, durationMs: result.durationMs },
      request,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logActivity({
      userId: session.user.id,
      eventType: 'cp.sync_failed',
      payload: { error: String(e?.message || e).slice(0, 500) },
      request,
    });
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Convenience for admins: report current sync state.
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`SELECT * FROM cp_sync_state WHERE id = 1`;
  return NextResponse.json(rows[0] || null);
}
