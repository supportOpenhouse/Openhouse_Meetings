import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listSalesReps } from '@/lib/salesQueries';
import AdminSalesRepsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AdminSalesRepsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin' && session.user.role !== 'supply_manager') {
    redirect(session.user.role === 'supply_rm' ? '/supply' : '/dashboard');
  }

  const reps = await listSalesReps();

  return (
    <>
      <AdminSalesRepsClient reps={JSON.parse(JSON.stringify(reps))} />
    </>
  );
}
