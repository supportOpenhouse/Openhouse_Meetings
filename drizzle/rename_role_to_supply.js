// Renames the role enum value 'sales_rm' → 'supply_rm' in Postgres.
// RUN THIS WITH THE DEPLOY of the renamed code: the old code checks 'sales_rm'
// and the new code checks 'supply_rm', so the DB value and the live code must
// flip together. Postgres updates the label in place, so every users.role row
// that was 'sales_rm' instantly reads as 'supply_rm' (no row updates needed).
//   node --env-file=.env.local drizzle/rename_role_to_supply.js          (dry run)
//   node --env-file=.env.local drizzle/rename_role_to_supply.js --apply   (execute)
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes('--apply');

async function run() {
  const vals = await sql`
    SELECT e.enumlabel FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'role'
    ORDER BY e.enumsortorder`;
  const labels = vals.map((v) => v.enumlabel);
  console.log('role enum values:', labels.join(', ') || '(type "role" not found)');
  const [{ n }] = await sql`SELECT count(*)::int n FROM users WHERE role = 'sales_rm'`;
  console.log(`users currently 'sales_rm': ${n}`);

  if (!labels.includes('sales_rm')) {
    console.log("Nothing to do — 'sales_rm' is not a value (already renamed?).");
    return;
  }
  if (!APPLY) {
    console.log("\n(dry run) Would run: ALTER TYPE \"role\" RENAME VALUE 'sales_rm' TO 'supply_rm';");
    console.log('Pass --apply to execute — DO IT AS the renamed code deploys.');
    return;
  }
  await sql`ALTER TYPE "role" RENAME VALUE 'sales_rm' TO 'supply_rm'`;
  console.log(`✓ Renamed 'sales_rm' → 'supply_rm'. ${n} users now read as 'supply_rm'.`);
}

run().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
