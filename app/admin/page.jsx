import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { listAllMeetings, listDistinctCities, listRMs } from '@/lib/queries';
import AdminOverviewClient from './client';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const [meetings, rms, cities] = await Promise.all([
    listAllMeetings(),
    listRMs(),
    listDistinctCities(),
  ]);

  return (
    <>
      <AdminOverviewClient
        initialMeetings={JSON.parse(JSON.stringify(meetings))}
        rms={JSON.parse(JSON.stringify(rms))}
        cities={cities}
      />
    </>
  );
}
