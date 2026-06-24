import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isCpMeetingsConfigured, getCities } from '@/lib/cpMeetingsApi';

export const runtime = 'nodejs';

// GET /api/supply/cps/cities — proxies the Core get-cities API (the API key is
// held server-side, never exposed to the browser).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isCpMeetingsConfigured()) return NextResponse.json({ cities: [], configured: false });

  try {
    const cities = await getCities();
    return NextResponse.json(
      { cities, configured: true },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
    );
  } catch (e) {
    console.error('[sales/cps/cities] failed', { message: e?.message });
    return NextResponse.json({ error: 'Could not load cities.' }, { status: 502 });
  }
}
