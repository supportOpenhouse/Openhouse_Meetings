import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listInventoryForRm, insertInventory } from '@/lib/salesInventoryQueries';
import { getSalesCpById } from '@/lib/salesQueries';

export const runtime = 'nodejs';

const CONFIGURATIONS = ['1BHK', '2BHK', '3BHK', '4BHK', 'Villa', 'Plot'];
const FACINGS = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
const FLAT_STATUS = ['vacant', 'tenant', 'owner'];
const FURNISHING = ['unfurnished', 'semi', 'full'];

const nz = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const intOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const oneOf = (v, list) => (list.includes(v) ? v : null);

// GET /api/sales/inventory — the signed-in rep's submitted inventory.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const inventory = await listInventoryForRm(session.user.id);
  return NextResponse.json({ inventory });
}

// POST /api/sales/inventory — add an inventory entry. cp_code / cp_name are
// snapshotted from the chosen CP so the row stays readable even if the CP
// record later changes.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sales_cp_id = nz(body.sales_cp_id);
  const society_name = nz(body.society_name);
  if (!sales_cp_id) {
    return NextResponse.json({ error: 'sales_cp_id required' }, { status: 400 });
  }
  if (!society_name) {
    return NextResponse.json({ error: 'society_name required' }, { status: 400 });
  }

  const cp = await getSalesCpById(sales_cp_id);
  if (!cp) {
    return NextResponse.json({ error: 'Channel partner not found' }, { status: 404 });
  }

  const data = {
    sales_cp_id,
    sales_rm_id: session.user.id,
    cp_code: cp.cp_id,
    cp_name: cp.cp_name,
    city: nz(body.city),
    society_name,
    configuration: oneOf(body.configuration, CONFIGURATIONS),
    size_sqft: intOrNull(body.size_sqft),
    price: intOrNull(body.price),
    facing: oneOf(body.facing, FACINGS),
    flat_status: oneOf(body.flat_status, FLAT_STATUS),
    floor: intOrNull(body.floor),
    unit_number: nz(body.unit_number),
    furnishing: oneOf(body.furnishing, FURNISHING),
    comments: nz(body.comments),
    ok_to_visit: body.ok_to_visit !== false,
  };

  let row;
  try {
    row = await insertInventory(data);
  } catch (e) {
    console.error('[sales/inventory] insert failed', { message: e?.message });
    return NextResponse.json({ error: 'Could not save inventory' }, { status: 500 });
  }

  return NextResponse.json({ inventory: row }, { status: 201 });
}
