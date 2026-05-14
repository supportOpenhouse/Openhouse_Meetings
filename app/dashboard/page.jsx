import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { listMeetingsForRM } from '@/lib/queries';
import AppShell from '@/components/AppShell';
import RMDashboardClient from './client';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'admin') redirect('/admin');

  const meetings = await listMeetingsForRM(session.user.id);

  return (
    <AppShell user={session.user} current="dashboard">
      <RMDashboardClient
        initialMeetings={JSON.parse(JSON.stringify(meetings))}
        user={{ id: session.user.id, name: session.user.name, email: session.user.email }}
      />
    </AppShell>
  );
}
