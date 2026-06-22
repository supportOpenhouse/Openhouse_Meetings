import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listSalesCps, insertSalesCp, nextCpId } from '@/lib/salesQueries';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';

const BUSINESS_TYPES = ['primary', 'resale', 'rental'];
const VERIFICATION = ['visible_signage', 'no_signage', 'shared_office', 'home_based'];

const nz = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const numOrNull = (v) => {
  // Number(null) and Number('') are both 0 (finite) — guard so an omitted
  // numeric (e.g. uncaptured geolocation) persists as NULL, not 0.
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// GET /api/sales/cps?search=... — the shared CP registry (lean projection).
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const search = new URL(request.url).searchParams.get('search') || '';
  const cps = await listSalesCps({ search });
  return NextResponse.json({ cps });
}

// POST /api/sales/cps — register a new channel partner. cp_id (SCP001…) is
// generated server-side; the unique index is the real guard, so we retry once
// on the rare collision.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cp_name = nz(body.cp_name);
  const phone_primary = nz(body.phone_primary);
  if (!cp_name) return NextResponse.json({ error: 'cp_name required' }, { status: 400 });
  if (!phone_primary) {
    return NextResponse.json({ error: 'phone_primary required' }, { status: 400 });
  }

  const primary_business = Array.isArray(body.primary_business)
    ? body.primary_business.filter((b) => BUSINESS_TYPES.includes(b))
    : [];

  const other_platforms = Array.isArray(body.other_platforms)
    ? body.other_platforms.map((p) => String(p).trim()).filter(Boolean)
    : [];

  const societies = Array.isArray(body.societies)
    ? body.societies
        .map((s) => ({
          society_name: nz(s?.society_name),
          micromarket: nz(s?.micromarket),
          is_primary: s?.is_primary === true,
        }))
        .filter((s) => s.society_name)
    : [];

  const office_verification_status = VERIFICATION.includes(body.office_verification_status)
    ? body.office_verification_status
    : null;

  const base = {
    cp_name,
    phone_primary,
    phone_secondary: nz(body.phone_secondary),
    email: nz(body.email),
    primary_business,
    team_size: numOrNull(body.team_size),
    monthly_deal_volume: numOrNull(body.monthly_deal_volume),
    other_platforms,
    office_address: nz(body.office_address),
    office_lat: numOrNull(body.office_lat),
    office_lng: numOrNull(body.office_lng),
    office_verification_status,
    societies,
    created_by: session.user.id,
    is_active: true,
  };

  let cp;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cp_id = await nextCpId();
      cp = await insertSalesCp({ ...base, cp_id });
      break;
    } catch (e) {
      // 23505 = unique_violation on cp_id — another rep registered concurrently.
      const isDup = e?.code === '23505' || /duplicate key|unique/i.test(e?.message || '');
      if (isDup && attempt < 2) continue;
      console.error('[sales/cps] insert failed', { message: e?.message });
      return NextResponse.json({ error: 'Could not register partner' }, { status: 500 });
    }
  }

  logActivity({
    userId: session.user.id,
    eventType: 'cp.assignment_changed',
    cpCode: cp.cp_id,
    payload: { action: 'sales_cp.registered', cp_name: cp.cp_name },
    request,
  });

  return NextResponse.json({ cp }, { status: 201 });
}
