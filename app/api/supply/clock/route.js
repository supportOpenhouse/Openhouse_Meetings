import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { openSessionFor, clockIn, clockOut } from '@/lib/salesMapQueries';

export const runtime = 'nodejs';

const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// GET /api/supply/clock — the signed-in rep's current open session (or null).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const open = await openSessionFor(session.user.id);
  return NextResponse.json({ session: open ?? null });
}

// POST /api/supply/clock { action: 'in' | 'out', lat, lng }
//  - 'in'  → open a new work session (closing any stale open one first)
//  - 'out' → close the rep's open session
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body?.action;
  const lat = numOrNull(body?.lat);
  const lng = numOrNull(body?.lng);

  if (action !== 'in' && action !== 'out') {
    return NextResponse.json({ error: "action must be 'in' or 'out'" }, { status: 400 });
  }

  try {
    if (action === 'in') {
      const row = await clockIn(session.user.id, lat, lng);
      return NextResponse.json({ session: row }, { status: 201 });
    }
    const row = await clockOut(session.user.id, lat, lng);
    if (!row) return NextResponse.json({ session: null }, { status: 200 });
    return NextResponse.json({ session: row });
  } catch (e) {
    console.error('[sales/clock] failed', { action, message: e?.message });
    return NextResponse.json({ error: 'Clock action failed' }, { status: 500 });
  }
}
