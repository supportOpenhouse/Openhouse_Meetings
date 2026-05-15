import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { listAllMeetings, listDistinctCities, listRMs, overviewStats } from '@/lib/queries';
import AppShell from '@/components/AppShell';
import AdminOverviewClient from './client';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const [stats, meetings, rms, cities] = await Promise.all([
    overviewStats(),
    listAllMeetings(),
    listRMs(),
    listDistinctCities(),
  ]);

  return (
    <AppShell user={session.user} current="admin">
      <AdminOverviewClient
        initialStats={JSON.parse(JSON.stringify(stats))}
        initialMeetings={JSON.parse(JSON.stringify(meetings))}
        rms={JSON.parse(JSON.stringify(rms))}
        cities={cities}
      />
    </AppShell>
  );
}
