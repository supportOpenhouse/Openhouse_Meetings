import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { salestrailPersons } from '@/lib/salestrailRecordings';
import SalestrailClient from './client';

// Admin Call-sync page — observe + manually trigger the Salestrail sync.
export default async function AdminSalestrailPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') redirect('/dashboard');

  const sql = neon(process.env.DATABASE_URL);
  const [stateRow] = await sql`
    SELECT cursor_at, last_run_at, last_result, in_progress, paused
    FROM salestrail_sync_state WHERE id = 1
  `;
  const [counts] = await sql`
    SELECT
      count(*) FILTER (WHERE status = 'fetching')::int      AS pending,
      count(*) FILTER (WHERE status = 'ready')::int         AS ready,
      count(*) FILTER (WHERE status = 'failed')::int        AS failed,
      count(*) FILTER (WHERE status = 'no_recording')::int  AS no_recording,
      count(*)::int                                         AS total
    FROM meetings WHERE salestrail_call_id IS NOT NULL
  `;

  const configured = !!(
    process.env.SALESTRAIL_API_USERNAME && process.env.SALESTRAIL_API_PASSWORD
  );

  // The recordings list is fetched client-side (it can be thousands of rows —
  // too heavy to embed in the page HTML). Only the small person list is pre-loaded.
  const persons = await salestrailPersons();

  return (
    <>
      <SalestrailClient
        initial={JSON.parse(
          JSON.stringify({
            state: stateRow || null,
            counts: counts || {},
            configured,
            persons,
            defaultSinceDays: 14,
          })
        )}
      />
    </>
  );
}
