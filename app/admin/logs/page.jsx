import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { listRecentActivity, listOnlineUsers } from '@/lib/activityLog';
import LogsClient from './client';

export default async function AdminLogsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const sql = neon(process.env.DATABASE_URL);
  const [activity, online, rms] = await Promise.all([
    listRecentActivity({ limit: 200 }),
    listOnlineUsers({ windowSeconds: 300 }),
    sql`SELECT id, name, email FROM users WHERE is_active = true ORDER BY name`,
  ]);

  return (
    <>
      <LogsClient
        initialActivity={JSON.parse(JSON.stringify(activity))}
        initialOnline={JSON.parse(JSON.stringify(online))}
        users={JSON.parse(JSON.stringify(rms))}
      />
    </>
  );
}
