import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AppShell from '@/components/AppShell';
import { listAllSalesVisits, listSalesReps } from '@/lib/salesQueries';
import AdminSalesVisitsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AdminSalesVisitsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin' && session.user.role !== 'supply_manager') {
    redirect(session.user.role === 'supply_rm' ? '/supply' : '/dashboard');
  }

  const [visits, reps] = await Promise.all([
    listAllSalesVisits({ limit: 500 }),
    listSalesReps(),
  ]);

  return (
    <AppShell user={session.user} current="supply-visits" section="supply">
      <AdminSalesVisitsClient
        initialVisits={JSON.parse(JSON.stringify(visits))}
        reps={JSON.parse(JSON.stringify(reps.map((r) => ({ id: r.id, name: r.name, email: r.email }))))}
      />
    </AppShell>
  );
}
