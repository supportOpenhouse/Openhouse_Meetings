import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { auth } from '@/auth';
import { searchInventoryCps, recentlyAddedCps, INVENTORY_TAG } from '@/lib/salesCp';
import { cpCodeVisitStats } from '@/lib/salesQueries';
import { isCpMeetingsConfigured, getNextCpCode, createBroker } from '@/lib/cpMeetingsApi';
import { captureServer } from '@/lib/posthogServer';

export const runtime = 'nodejs';

const nz = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

// GET /api/supply/cps?search=… — channel partners come from the EXTERNAL CP
// inventory DB (channel_partners), the same source the demand RM lookup uses.
// We merge our own visit counts (from sales_visits, by the real cp_code).
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const search = sp.get('search') || '';
  // ?refresh=1 → skip the 5-minute inventory cache (and the browser's SWR copy).
  // The "Refresh" button uses this so a partner registered seconds ago appears.
  const fresh = sp.get('refresh') === '1';
  // ?recent=1 → the most recently registered partners (no search term).
  const { configured, cps } =
    sp.get('recent') === '1'
      ? await recentlyAddedCps(12, { fresh })
      : await searchInventoryCps(search, 30, { fresh });
  if (!configured) {
    return NextResponse.json({ cps: [], configured: false });
  }

  const stats = await cpCodeVisitStats(cps.map((c) => c.cp_code));
  const merged = cps.map((c) => ({
    ...c,
    visit_count: stats[c.cp_code]?.visit_count || 0,
    last_visit_at: stats[c.cp_code]?.last_visit_at || null,
  }));
  return NextResponse.json(
    { cps: merged, configured: true },
    // Same-user browser cache: serve the last result instantly while it
    // revalidates, so repeating a search feels instant. Pairs with the server
    // inventory cache. A forced refresh must bypass it too.
    {
      headers: {
        'Cache-Control': fresh ? 'no-store' : 'private, max-age=0, stale-while-revalidate=60',
      },
    }
  );
}

// POST /api/supply/cps — register a NEW channel partner in Open House Core via
// the CP Meetings broker API. We allocate the next cp_code, then create the
// broker. The frontend sends the partner details; we add sales_manager_id +
// cp_code (both server-side concerns).
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isCpMeetingsConfigured()) {
    return NextResponse.json({ error: 'Partner registration is not configured yet.' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const full_name = nz(body.full_name);
  const phone_number = (body.phone_number || '').replace(/\D/g, '');
  const city = nz(body.city);
  const company_name = nz(body.company_name) || 'Individual';
  const email = nz(body.email);
  const micro_markets = Array.isArray(body.micro_markets)
    ? [...new Set(body.micro_markets.map(Number).filter(Number.isFinite))]
    : [];

  if (!full_name) return NextResponse.json({ error: 'Partner name is required.' }, { status: 400 });
  if (phone_number.length !== 10) {
    return NextResponse.json({ error: 'A valid 10-digit phone number is required.' }, { status: 400 });
  }
  if (!city) return NextResponse.json({ error: 'City is required.' }, { status: 400 });
  if (!micro_markets.length) {
    return NextResponse.json({ error: 'Select at least one micro market.' }, { status: 400 });
  }

  // Core attributes the broker to a sales manager — the rep's own Core
  // sales_manager_id, mapped from users.smid (session.salesManagerId). Required.
  const salesManagerId = Number(session.user.salesManagerId);
  if (!Number.isFinite(salesManagerId)) {
    return NextResponse.json(
      { error: 'Your account isn’t linked to a sales manager yet — ask an admin to set it.' },
      { status: 400 }
    );
  }

  try {
    const cpCode = await getNextCpCode();
    if (!cpCode) {
      return NextResponse.json({ error: 'Could not allocate a CP code. Please try again.' }, { status: 502 });
    }

    const result = await createBroker({
      sales_manager_id: salesManagerId,
      full_name,
      phone_number,
      city,
      company_name,
      cp_code: cpCode,
      micro_markets,
      ...(email ? { email } : {}),
    });

    const finalCode = result?.cpCode || cpCode;
    // Drop the cached inventory searches so the partner we just created is
    // findable straight away instead of after the 5-minute TTL.
    revalidateTag(INVENTORY_TAG);
    await captureServer(session.user.id, 'partner_registered', {
      cp_code: finalCode,
      city,
      micro_market_count: micro_markets.length,
    });

    return NextResponse.json(
      { ok: true, cp_code: finalCode, broker_id: result?.brokerId || null },
      { status: 201 }
    );
  } catch (e) {
    // Surface Core's own message (duplicate phone → 400, bad manager → 422).
    const status = e?.status === 400 || e?.status === 422 ? 400 : 502;
    return NextResponse.json({ error: e?.message || 'Could not register partner.' }, { status });
  }
}
