import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { listRMs } from '@/lib/queries';
import AppShell from '@/components/AppShell';
import RMsClient from './client';

export default async function RMsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const rms = await listRMs();

  return (
    <AppShell user={session.user} current="rms">
      <RMsClient
        initialRMs={JSON.parse(JSON.stringify(rms))}
        currentUserId={session.user.id}
      />
    </AppShell>
  );
}
