// One-shot cleanup: removes cp_visits rows whose status_raw is not 'completed'.
// Run after deploying the sync change that filters by status='completed'.
//   npm run db:cleanup-non-completed-visits

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
  const before = await sql`SELECT count(*)::int AS n FROM cp_visits`;
  console.log(`Before: ${before[0].n} rows in cp_visits`);

  const breakdown = await sql`
    SELECT lower(coalesce(status_raw, '(null)')) AS status, count(*)::int AS n
    FROM cp_visits GROUP BY 1 ORDER BY n DESC
  `;
  console.log('Status breakdown:');
  for (const r of breakdown) console.log(`  ${r.status.padEnd(20)} ${r.n}`);

  const deleted = await sql`
    DELETE FROM cp_visits
    WHERE lower(coalesce(status_raw, '')) <> 'completed'
    RETURNING 1
  `;
  console.log(`✓ deleted ${deleted.length} non-completed rows`);

  // Reset sync state so the next dashboard load triggers a fresh re-pull —
  // ensures the table is rebuilt cleanly with the new filter applied.
  await sql`UPDATE cp_sync_state SET last_synced_at = NULL, last_error = NULL WHERE id = 1`;
  console.log('✓ cleared cp_sync_state.last_synced_at — next dashboard load will resync');

  const after = await sql`SELECT count(*)::int AS n FROM cp_visits`;
  console.log(`After:  ${after[0].n} rows in cp_visits`);
}

run().catch((e) => {
  console.error('Cleanup failed:', e);
  process.exit(1);
});
