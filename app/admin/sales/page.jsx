import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AppShell from '@/components/AppShell';
import { salesAdminOverview } from '@/lib/salesQueries';
import AdminSalesOverviewClient from './client';

export const dynamic = 'force-dynamic';

export default async function AdminSalesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') {
    redirect(session.user.role === 'sales_rm' ? '/sales' : '/dashboard');
  }

  const data = await salesAdminOverview();

  return (
    <AppShell user={session.user} current="sales">
      <AdminSalesOverviewClient initial={JSON.parse(JSON.stringify(data))} />
    </AppShell>
  );
}
