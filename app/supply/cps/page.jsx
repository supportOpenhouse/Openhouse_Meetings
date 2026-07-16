import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { recentVisitedCpCodes } from '@/lib/salesQueries';
import { recentlyAddedCps } from '@/lib/salesCp';
import SalesCpsClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesCpsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  // Default view = partners this rep has recently visited + the newest partners
  // in the shared inventory (so one just registered is visible without a search).
  // Search hits the shared CP inventory (external) via /api/supply/cps?search=.
  const [recent, added] = await Promise.all([
    recentVisitedCpCodes(session.user.id, 12),
    recentlyAddedCps(12),
  ]);
  const initialCps = recent.map((r) => ({
    id: r.cp_code,
    cp_id: r.cp_code,
    cp_name: r.cp_name,
    phone_primary: null,
    primary_business: [],
    societies: [],
    visit_count: r.visit_count,
    last_visit_at: r.last_visit_at,
  }));

  return (
    <SalesCpsClient
      initialCps={JSON.parse(JSON.stringify(initialCps))}
      recentlyAdded={JSON.parse(JSON.stringify(added.cps || []))}
    />
  );
}
