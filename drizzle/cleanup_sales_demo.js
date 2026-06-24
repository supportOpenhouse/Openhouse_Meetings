// Removes ONLY the seeded demo data (the *.demo@openhouse.in accounts, their
// sales rows, and the SCP9xx demo partners). Real accounts (incl.
// support@openhouse.in) and real data are left untouched.
// Run: node --env-file=.env.local drizzle/cleanup_sales_demo.js
import { neon } from '@neondatabase/serverless';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const count = (rows) => rows.length;

async function run() {
  // Only the demo accounts seeded for screenshots.
  const demoUsers = await sql`SELECT id, email FROM users WHERE email LIKE '%.demo@openhouse.in'`;
  const ids = demoUsers.map((u) => u.id);
  console.log('Demo accounts targeted:', demoUsers.map((u) => u.email).join(', ') || '(none)');
  console.log('Leaving real accounts (e.g. support@openhouse.in) untouched.\n');

  const deleted = { pings: 0, sessions: 0, inventory: 0, visits: 0, activity: 0, demo_cps: 0, users: 0 };

  if (ids.length) {
    deleted.pings = count(
      await sql`DELETE FROM sales_location_pings WHERE sales_rm_id = ANY(${ids}::uuid[]) RETURNING id`
    );
    deleted.sessions = count(
      await sql`DELETE FROM sales_clock_sessions WHERE sales_rm_id = ANY(${ids}::uuid[]) RETURNING id`
    );
    deleted.inventory = count(
      await sql`DELETE FROM sales_inventory WHERE sales_rm_id = ANY(${ids}::uuid[]) RETURNING id`
    );
    deleted.visits = count(
      await sql`DELETE FROM sales_visits WHERE sales_rm_id = ANY(${ids}::uuid[]) RETURNING id`
    );
    deleted.activity = count(
      await sql`DELETE FROM activity_logs WHERE user_id = ANY(${ids}::uuid[]) RETURNING id`
    );
  }

  // Demo channel partners (SCP9xx — created by the seed; the registry table is
  // otherwise unused now that registration comes from the external inventory).
  deleted.demo_cps = count(
    await sql`DELETE FROM sales_channel_partners WHERE cp_id LIKE 'SCP9%' RETURNING id`
  );

  if (ids.length) {
    deleted.users = count(await sql`DELETE FROM users WHERE id = ANY(${ids}::uuid[]) RETURNING id`);
  }

  console.log('Deleted:');
  for (const [k, v] of Object.entries(deleted)) console.log(`  ${k.padEnd(10)} ${v}`);

  // Sanity: what real sales data remains.
  const [rv] = await sql`SELECT count(*)::int n FROM sales_visits`;
  const [rc] = await sql`SELECT count(*)::int n FROM sales_channel_partners`;
  const [ru] = await sql`SELECT count(*)::int n FROM users WHERE role = 'supply_rm'`;
  console.log(`\nRemaining → sales_visits:${rv.n}  sales_channel_partners:${rc.n}  supply_rm users:${ru.n}`);
  console.log('✓ Demo data cleaned.');
}

run().catch((e) => {
  console.error('Cleanup failed:', e.message);
  process.exit(1);
});
