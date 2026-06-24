// Adds 'supply_manager' to the role enum. Purely additive + non-breaking (no
// existing rows/code reference it yet), so it's safe to run any time.
//   node --env-file=.env.local drizzle/add_supply_manager_role.js          (dry run)
//   node --env-file=.env.local drizzle/add_supply_manager_role.js --apply
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes('--apply');

async function run() {
  const vals = await sql`
    SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'role' ORDER BY e.enumsortorder`;
  console.log('role enum:', vals.map((v) => v.enumlabel).join(', '));
  if (vals.some((v) => v.enumlabel === 'supply_manager')) {
    console.log("Already present — nothing to do.");
    return;
  }
  if (!APPLY) {
    console.log("(dry run) Would run: ALTER TYPE \"role\" ADD VALUE 'supply_manager';");
    return;
  }
  await sql`ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'supply_manager'`;
  console.log("✓ Added 'supply_manager' to the role enum.");
}

run().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
