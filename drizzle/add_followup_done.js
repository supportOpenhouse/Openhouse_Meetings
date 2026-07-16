// Adds sales_visits.followup_done_at so a rep can mark a follow-up complete.
// Additive + nullable: existing rows get NULL (= still due), nothing is
// rewritten, and it's reversible with `ALTER TABLE sales_visits DROP COLUMN
// followup_done_at`.
//
//   node --env-file=.env.local drizzle/add_followup_done.js          (dry run)
//   node --env-file=.env.local drizzle/add_followup_done.js --apply  (execute)
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const apply = process.argv.includes('--apply');

const STATEMENTS = [
  `ALTER TABLE sales_visits ADD COLUMN IF NOT EXISTS followup_done_at timestamptz`,
  // The "follow-ups due" list filters on (rm, date, done is null) — keep it indexed.
  `CREATE INDEX IF NOT EXISTS sales_visits_followup_open_idx
     ON sales_visits (sales_rm_id, next_followup_date)
     WHERE followup_done_at IS NULL`,
];

const before = await sql`
  SELECT count(*)::int AS n FROM information_schema.columns
  WHERE table_name = 'sales_visits' AND column_name = 'followup_done_at'
`;
console.log(`followup_done_at exists already: ${before[0].n > 0 ? 'yes' : 'no'}`);

if (!apply) {
  console.log('\nDRY RUN — would execute:\n');
  for (const s of STATEMENTS) console.log('  ' + s.replace(/\s+/g, ' ').trim());
  console.log('\nRe-run with --apply to execute.');
  process.exit(0);
}

// neon's http driver only exposes the tagged-template form, so the statements
// are issued literally here (they take no parameters).
await sql`ALTER TABLE sales_visits ADD COLUMN IF NOT EXISTS followup_done_at timestamptz`;
console.log('✓ added column sales_visits.followup_done_at');
await sql`CREATE INDEX IF NOT EXISTS sales_visits_followup_open_idx
          ON sales_visits (sales_rm_id, next_followup_date)
          WHERE followup_done_at IS NULL`;
console.log('✓ created index sales_visits_followup_open_idx');

const after = await sql`
  SELECT count(*)::int AS n FROM information_schema.columns
  WHERE table_name = 'sales_visits' AND column_name = 'followup_done_at'
`;
const open = await sql`
  SELECT count(*)::int AS n FROM sales_visits
  WHERE next_followup_date IS NOT NULL AND followup_done_at IS NULL
`;
console.log(`\ncolumn present: ${after[0].n > 0 ? 'yes' : 'no'} · open follow-ups: ${open[0].n}`);
