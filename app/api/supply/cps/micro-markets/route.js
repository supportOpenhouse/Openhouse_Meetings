import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMicroMarketsByCity } from '@/lib/cpMeetingsApi';

export const runtime = 'nodejs';

// GET /api/supply/cps/micro-markets?city=Gurgaon — micro markets for a city.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const city = new URL(request.url).searchParams.get('city');
  if (!city) return NextResponse.json({ error: 'city required' }, { status: 400 });

  try {
    const microMarkets = await getMicroMarketsByCity(city);
    return NextResponse.json(
      { microMarkets },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
    );
  } catch (e) {
    console.error('[sales/cps/micro-markets] failed', { message: e?.message });
    return NextResponse.json({ error: 'Could not load micro markets.' }, { status: 502 });
  }
}
