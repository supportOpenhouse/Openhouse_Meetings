import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AppShell from '@/components/AppShell';
import { listSalesReps } from '@/lib/salesQueries';
import AdminSalesRepsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AdminSalesRepsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') {
    redirect(session.user.role === 'supply_rm' ? '/supply' : '/dashboard');
  }

  const reps = await listSalesReps();

  return (
    <AppShell user={session.user} current="sales">
      <AdminSalesRepsClient reps={JSON.parse(JSON.stringify(reps))} />
    </AppShell>
  );
}
