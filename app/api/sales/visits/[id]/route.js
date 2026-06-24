import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSalesVisitById } from '@/lib/salesQueries';

export const runtime = 'nodejs';

// GET /api/sales/visits/[id] — full visit incl. transcript + summary. A rep may
// only read their own visits; admins may read any.
export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const visit = await getSalesVisitById(id);
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 });

  if (visit.sales_rm_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ visit });
}
