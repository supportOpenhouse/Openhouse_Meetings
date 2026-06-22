import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import { listSalesCps } from '@/lib/salesQueries';
import SalesCpsClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesCpsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'sales_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const cps = await listSalesCps({});

  return (
    <SalesShell user={session.user} current="cps">
      <SalesCpsClient initialCps={JSON.parse(JSON.stringify(cps))} />
    </SalesShell>
  );
}
