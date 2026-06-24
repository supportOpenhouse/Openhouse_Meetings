import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import { recentVisitedCpCodes } from '@/lib/salesQueries';
import SalesCpsClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesCpsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'sales_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  // Default view = partners this rep has recently visited. Search hits the shared
  // CP inventory (external) via /api/sales/cps?search=.
  const recent = await recentVisitedCpCodes(session.user.id, 12);
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
    <SalesShell user={session.user} current="cps">
      <SalesCpsClient initialCps={JSON.parse(JSON.stringify(initialCps))} />
    </SalesShell>
  );
}
