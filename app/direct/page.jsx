import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { listMeetingsForRM } from '@/lib/queries';
import AppShell from '@/components/AppShell';
import DirectClient from './client';

// Home for the direct-RM role: upload phone call recordings + see their list.
export default async function DirectPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  // Only direct RMs (and admins, for support) use this area.
  if (session.user.role !== 'direct_rm' && session.user.role !== 'admin') {
    redirect('/dashboard');
  }

  const meetings = await listMeetingsForRM(session.user.id);

  return (
    <AppShell user={session.user} current="direct">
      <DirectClient
        initialMeetings={JSON.parse(JSON.stringify(meetings))}
        user={{ id: session.user.id, name: session.user.name }}
      />
    </AppShell>
  );
}
