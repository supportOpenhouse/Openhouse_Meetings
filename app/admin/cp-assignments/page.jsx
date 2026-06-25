import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { listAssignmentsForAdmin } from '@/lib/cpQueries';
import CpAssignmentsClient from './client';

export default async function CpAssignmentsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const sql = neon(process.env.DATABASE_URL);
  const [assignments, rms] = await Promise.all([
    listAssignmentsForAdmin({ search: '', rmFilter: null }),
    sql`SELECT id, name, email FROM users WHERE role = 'rm' AND is_active = true ORDER BY name`,
  ]);

  return (
    <>
      <CpAssignmentsClient
        initialAssignments={JSON.parse(JSON.stringify(assignments))}
        rms={JSON.parse(JSON.stringify(rms))}
      />
    </>
  );
}
