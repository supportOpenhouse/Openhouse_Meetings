import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { getCpDashboardData } from '@/lib/cpQueries';
import CpDashboardClient from './client';

export default async function CpDashboardPage({ searchParams }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const monthsParam = searchParams?.months;
  const monthsToShow = monthsParam === 'all' ? 'all' : 4;

  const isAdmin = session.user.role === 'admin';
  const rmId = isAdmin ? null : session.user.id;

  const data = await getCpDashboardData({ rmId, monthsToShow });

  return (
    <AppShell user={session.user} current="cp">
      <CpDashboardClient
        initialData={JSON.parse(JSON.stringify(data))}
        initialMonths={monthsToShow}
        isAdmin={isAdmin}
        user={{ id: session.user.id, name: session.user.name }}
      />
    </AppShell>
  );
}
