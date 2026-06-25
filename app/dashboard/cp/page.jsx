import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { getCpDashboardData } from '@/lib/cpQueries';
import CpDashboardClient from './client';

export default async function CpDashboardPage({ searchParams }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const monthsParam = searchParams?.months;
  const monthsToShow = monthsParam === 'all' ? 'all' : 4;

  const isAdmin = session.user.role === 'admin';
  const rmId = isAdmin ? null : session.user.id;

  // Admin needs the full RM list for the filter dropdown. RMs don't, so we
  // skip the query in that branch.
  const sql = neon(process.env.DATABASE_URL);
  const [data, rms] = await Promise.all([
    getCpDashboardData({ rmId, monthsToShow }),
    isAdmin
      ? sql`SELECT id, name FROM users WHERE role = 'rm' AND is_active = true ORDER BY name`
      : Promise.resolve([]),
  ]);

  return (
    <>
      <CpDashboardClient
        initialData={JSON.parse(JSON.stringify(data))}
        initialMonths={monthsToShow}
        isAdmin={isAdmin}
        user={{ id: session.user.id, name: session.user.name }}
        rms={JSON.parse(JSON.stringify(rms))}
      />
    </>
  );
}
