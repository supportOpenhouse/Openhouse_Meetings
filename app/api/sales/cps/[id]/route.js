import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getInventoryCpByCode } from '@/lib/salesCp';
import { listSalesVisitsByCpCode, listInventoryByCpCode } from '@/lib/salesQueries';

export const runtime = 'nodejs';

// GET /api/sales/cps/<cp_code> — the partner from the external inventory plus
// the sales visits + inventory we hold against that real cp_code.
export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params; // the dynamic segment is the real cp_code
  const code = decodeURIComponent(id || '');
  const cp = await getInventoryCpByCode(code);
  if (!cp) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

  const [visits, inventory] = await Promise.all([
    listSalesVisitsByCpCode(cp.cp_code, 50),
    listInventoryByCpCode(cp.cp_code, 50),
  ]);
  return NextResponse.json({ cp, visits, inventory });
}

// Editing the inventory record is owned by the external system (coming soon).
export async function PATCH() {
  return NextResponse.json(
    { error: 'Editing partners is coming soon.', coming_soon: true },
    { status: 501 }
  );
}
