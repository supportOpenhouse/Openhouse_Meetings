import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertPing, openSessionFor, teamMapData, myMapData } from '@/lib/salesMapQueries';

export const runtime = 'nodejs';

const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// GET /api/sales/location?scope=team|me
//  - team (admin only) → every active rep's route + latest position today
//  - me                → the signed-in rep's pings today + open session
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = new URL(request.url).searchParams.get('scope') || 'me';

  if (scope === 'team') {
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const data = await teamMapData();
    return NextResponse.json(data);
  }

  const data = await myMapData(session.user.id);
  return NextResponse.json(data);
}

// POST /api/sales/location { lat, lng, accuracy } — drop a GPS breadcrumb for
// the rep, tied to their open clock session if one exists.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lat = numOrNull(body?.lat);
  const lng = numOrNull(body?.lng);
  if (lat == null || lng == null) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  try {
    const open = await openSessionFor(session.user.id);
    const ping = await insertPing({
      rmId: session.user.id,
      lat,
      lng,
      accuracy: numOrNull(body?.accuracy),
      sessionId: open?.id ?? null,
    });
    return NextResponse.json({ ping }, { status: 201 });
  } catch (e) {
    console.error('[sales/location] insert failed', { message: e?.message });
    return NextResponse.json({ error: 'Could not record location' }, { status: 500 });
  }
}
