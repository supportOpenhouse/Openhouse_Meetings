import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import AppShell from '@/components/AppShell';
import { teamPerformanceData } from '@/lib/salesPerf';
import SalesPerformanceClient from '@/app/supply/performance/client';

export const dynamic = 'force-dynamic';

// Supply oversight: all-reps performance leaderboard. Admins + supply managers.
export default async function AdminSupplyPerformancePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = session.user.role;
  if (role !== 'admin' && role !== 'supply_manager') {
    redirect(role === 'supply_rm' ? '/supply' : '/dashboard');
  }

  const data = await teamPerformanceData();

  return (
    <AppShell user={session.user} current="supply-performance" section="supply">
      <SalesPerformanceClient
        initial={JSON.parse(JSON.stringify(data))}
        isAdmin
        user={{ id: session.user.id, name: session.user.name || '', email: session.user.email, role }}
      />
    </AppShell>
  );
}
