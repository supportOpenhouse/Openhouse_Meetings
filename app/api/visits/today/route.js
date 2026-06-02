import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchVisitsForCpOnDate } from '@/lib/sheetsSync';

export const runtime = 'nodejs';

// Today in IST as YYYY-MM-DD. The Google Sheet stores selected_date in IST,
// and Vercel functions run in UTC — without the shift we'd ask the sheet
// for the wrong day after 6:30 PM IST.
function todayIstIso() {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return istNow.toISOString().slice(0, 10);
}

// GET /api/visits/today?cp_code=CP00670[&date=2026-06-02]
// Live-reads the configured Google Sheet for visits matching the given CP
// code on the given date (defaults to today, IST). Returns up to a handful
// of rows — typically zero, one, or two scheduled visits per CP per day.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const cpCode = (searchParams.get('cp_code') || '').trim();
  if (!cpCode) {
    return NextResponse.json({ ok: false, error: 'cp_code is required' }, { status: 400 });
  }
  const date = (searchParams.get('date') || '').trim() || todayIstIso();
  try {
    const visits = await fetchVisitsForCpOnDate(cpCode, date);
    return NextResponse.json({ ok: true, visits, date });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || 'Sheet read failed' }, { status: 500 });
  }
}
