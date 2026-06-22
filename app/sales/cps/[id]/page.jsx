import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import { getSalesCpById, listSalesVisits } from '@/lib/salesQueries';
import SalesCpDetailClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesCpDetailPage({ params }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'sales_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const { id } = await params;
  const cp = await getSalesCpById(id);
  if (!cp) notFound();

  const visits = await listSalesVisits({ cpId: id, limit: 50 });

  return (
    <SalesShell user={session.user} current="cps">
      <SalesCpDetailClient
        cp={JSON.parse(JSON.stringify(cp))}
        visits={JSON.parse(JSON.stringify(visits))}
      />
    </SalesShell>
  );
}
