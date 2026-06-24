import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { repPerformanceData, teamPerformanceData } from '@/lib/salesPerf';
import SalesPerformanceClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesPerformancePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const isAdmin = role === 'admin';
  const data = isAdmin ? await teamPerformanceData() : await repPerformanceData(session.user.id);

  return (
      <SalesPerformanceClient
        initial={JSON.parse(JSON.stringify(data))}
        isAdmin={isAdmin}
        user={{
          id: session.user.id,
          name: session.user.name || '',
          email: session.user.email,
          role,
        }}
      />
  );
}
