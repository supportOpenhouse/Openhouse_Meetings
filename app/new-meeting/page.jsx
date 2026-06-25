import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import NewMeetingClient from './client';

export default async function NewMeetingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'admin') redirect('/admin');

  return (
    <>
      <NewMeetingClient user={{ id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role }} />
    </>
  );
}
