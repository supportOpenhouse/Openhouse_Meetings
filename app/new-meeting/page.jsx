import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import NewMeetingClient from './client';

export default async function NewMeetingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'admin') redirect('/admin');

  return (
    <AppShell user={session.user} current="new">
      <NewMeetingClient user={{ id: session.user.id, name: session.user.name, email: session.user.email }} />
    </AppShell>
  );
}
