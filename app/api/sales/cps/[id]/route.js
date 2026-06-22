import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSalesCpById, updateSalesCp, listSalesVisits } from '@/lib/salesQueries';

export const runtime = 'nodejs';

const BUSINESS_TYPES = ['primary', 'resale', 'rental'];
const VERIFICATION = ['visible_signage', 'no_signage', 'shared_office', 'home_based'];

const nz = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const numOrNull = (v) => {
  // Number(null)/Number('') are 0 (finite) — guard so an omitted numeric
  // persists as NULL, not 0.
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// GET /api/sales/cps/[id] — full partner record plus their recent visit history.
export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cp = await getSalesCpById(id);
  if (!cp) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

  const visits = await listSalesVisits({ cpId: id, limit: 50 });
  return NextResponse.json({ cp, visits });
}

// PATCH /api/sales/cps/[id] — update editable fields. cp_id and created_by are
// immutable; only fields present in the body are touched.
export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getSalesCpById(id);
  if (!existing) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('cp_name')) {
    const v = nz(body.cp_name);
    if (!v) return NextResponse.json({ error: 'cp_name cannot be empty' }, { status: 400 });
    patch.cp_name = v;
  }
  if (has('phone_primary')) {
    const v = nz(body.phone_primary);
    if (!v) return NextResponse.json({ error: 'phone_primary cannot be empty' }, { status: 400 });
    patch.phone_primary = v;
  }
  if (has('phone_secondary')) patch.phone_secondary = nz(body.phone_secondary);
  if (has('email')) patch.email = nz(body.email);
  if (has('office_address')) patch.office_address = nz(body.office_address);
  if (has('office_lat')) patch.office_lat = numOrNull(body.office_lat);
  if (has('office_lng')) patch.office_lng = numOrNull(body.office_lng);
  if (has('team_size')) patch.team_size = numOrNull(body.team_size);
  if (has('monthly_deal_volume')) patch.monthly_deal_volume = numOrNull(body.monthly_deal_volume);

  if (has('office_verification_status')) {
    patch.office_verification_status = VERIFICATION.includes(body.office_verification_status)
      ? body.office_verification_status
      : null;
  }
  if (has('primary_business')) {
    patch.primary_business = Array.isArray(body.primary_business)
      ? body.primary_business.filter((b) => BUSINESS_TYPES.includes(b))
      : [];
  }
  if (has('other_platforms')) {
    patch.other_platforms = Array.isArray(body.other_platforms)
      ? body.other_platforms.map((p) => String(p).trim()).filter(Boolean)
      : [];
  }
  if (has('societies')) {
    patch.societies = Array.isArray(body.societies)
      ? body.societies
          .map((s) => ({
            society_name: nz(s?.society_name),
            micromarket: nz(s?.micromarket),
            is_primary: s?.is_primary === true,
          }))
          .filter((s) => s.society_name)
      : [];
  }
  if (has('is_active')) patch.is_active = body.is_active === true;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ cp: existing });
  }

  const cp = await updateSalesCp(id, patch);
  return NextResponse.json({ cp });
}
