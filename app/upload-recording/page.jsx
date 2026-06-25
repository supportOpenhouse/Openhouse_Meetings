import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import UploadRecordingClient from './client';

export default async function UploadRecordingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  // RMs (and admins) only. Direct RMs have their own /direct uploader.
  if (session.user.role === 'direct_rm') redirect('/direct');

  return (
    <>
      <UploadRecordingClient user={{ id: session.user.id, name: session.user.name }} />
    </>
  );
}
