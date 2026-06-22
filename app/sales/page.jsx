import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import { salesDashboardData } from '@/lib/salesQueries';
import SalesDashboardClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesHomePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'sales_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const data = await salesDashboardData(session.user.id);

  return (
    <SalesShell user={session.user} current="home">
      <SalesDashboardClient
        initialData={JSON.parse(JSON.stringify(data))}
        user={{ name: session.user.name || '', email: session.user.email }}
      />
    </SalesShell>
  );
}
