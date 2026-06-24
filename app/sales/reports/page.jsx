import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import { listSalesVisits } from '@/lib/salesQueries';
import SalesReportsClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesReportsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'sales_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const visits = await listSalesVisits({ rmId: session.user.id, limit: 200 });

  return (
    <SalesShell user={session.user} current="reports">
      <SalesReportsClient initialVisits={JSON.parse(JSON.stringify(visits))} />
    </SalesShell>
  );
}
