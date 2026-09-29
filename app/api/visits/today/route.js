import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchVisitsForCpOnDate } from '@/lib/sheetsSync';
import { fetchCrmVisitsAfter } from '@/lib/crmVisits';

export const runtime = 'nodejs';

// Today in IST as YYYY-MM-DD. The Google Sheet stores selected_date in IST,
// and Vercel functions run in UTC — without the shift we'd ask the sheet
// for the wrong day after 6:30 PM IST.
function todayIstIso() {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return istNow.toISOString().slice(0, 10);
}

// GET /api/visits/today?cp_code=CP00670[&date=2026-06-02]
// Visits matching the given CP code on the given date (defaults to today,
// IST). Hybrid source:
//   - Google Sheet: every visit up to the sheet's highest id (lags ~15 min)
//   - CRM all-visits API: only visits newer than that id, i.e. ones booked
//     since the last sheet refresh
// Either source failing still returns what the other found; only both
// failing is an error.
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

  let sheet = null;
  let sheetError = null;
  try {
    sheet = await fetchVisitsForCpOnDate(cpCode, date);
  } catch (e) {
    sheetError = e?.message || 'Sheet read failed';
  }

  let crm = [];
  let crmError = null;
  try {
    crm = await fetchCrmVisitsAfter({
      sinceId: sheet?.maxId ?? null,
      offsetGuess: sheet?.rowCount ?? null,
    });
  } catch (e) {
    crmError = e?.message || 'CRM read failed';
  }

  if (sheetError && crmError) {
    console.error('[visits/today] both sources failed', { sheetError, crmError });
    return NextResponse.json(
      { ok: false, error: `Could not load visits (sheet: ${sheetError}; CRM: ${crmError})` },
      { status: 502 }
    );
  }
  if (sheetError) console.warn('[visits/today] sheet failed, CRM only', sheetError);
  if (crmError) console.warn('[visits/today] CRM failed, sheet only', crmError);

  // CRM rows are fresher, so they replace a sheet row with the same id.
  const wantCp = cpCode.toLowerCase();
  const byId = new Map();
  for (const v of sheet?.visits || []) byId.set(v.id, { ...v, source: 'sheet' });
  for (const v of crm) {
    byId.delete(v.id);
    if (String(v.cp_code || '').toLowerCase() === wantCp && v.selected_date === date) {
      byId.set(v.id, { ...v, source: 'crm' });
    }
  }
  const visits = [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));

  return NextResponse.json({
    ok: true,
    visits,
    date,
    // Lets the picker say "list may be incomplete" when a source was down.
    partial: !!(sheetError || crmError),
  });
}
