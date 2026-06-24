import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { salesDashboardData } from '@/lib/salesQueries';
import { salesHomeExtras } from '@/lib/salesDashboard';
import SalesDashboardClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesHomePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const [data, extras] = await Promise.all([
    salesDashboardData(session.user.id),
    salesHomeExtras(session.user.id),
  ]);

  const initialData = { ...data, ...extras };

  return (
      <SalesDashboardClient
        initialData={JSON.parse(JSON.stringify(initialData))}
        user={{
          id: session.user.id,
          name: session.user.name || '',
          email: session.user.email,
          role,
        }}
      />
  );
}
