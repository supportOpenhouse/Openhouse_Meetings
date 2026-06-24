import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AppShell from '@/components/AppShell';
import { listSalesCps } from '@/lib/salesQueries';
import AdminSalesCpsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AdminSalesCpsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin' && session.user.role !== 'supply_manager') {
    redirect(session.user.role === 'supply_rm' ? '/supply' : '/dashboard');
  }

  const cps = await listSalesCps({});

  return (
    <AppShell user={session.user} current="supply-cps" section="supply">
      <AdminSalesCpsClient initialCps={JSON.parse(JSON.stringify(cps))} />
    </AppShell>
  );
}
