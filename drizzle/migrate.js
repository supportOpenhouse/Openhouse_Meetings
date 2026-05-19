// Run with: node drizzle/migrate.js
// Bootstraps the schema directly. For incremental migrations later, use drizzle-kit generate.

// Loads env via Node's --env-file flag. Run with: npm run db:migrate
// (npm script passes --env-file=.env.local)

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Did you copy .env.example to .env.local?');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('Connecting to Neon...');
  console.log('Creating role enum...');
  try {
    await sql`CREATE TYPE role AS ENUM ('admin', 'rm')`;
  } catch (e) {
    if (!e.message.includes('already exists')) throw e;
    console.log('  enum already exists, skipping');
  }

  console.log('Creating users table...');
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      name text,
      image text,
      role role NOT NULL DEFAULT 'rm',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)`;
  await sql`CREATE INDEX IF NOT EXISTS users_role_idx ON users(role)`;

  console.log('Creating meetings table...');
  await sql`
    CREATE TABLE IF NOT EXISTS meetings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rm_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      cp_code text NOT NULL,
      cp_mobile text NOT NULL,
      cp_name text,
      purpose text,
      started_at timestamptz NOT NULL,
      duration_seconds integer NOT NULL DEFAULT 0,
      language text,
      audio_url text,
      transcript_text text,
      transcript_words jsonb,
      summary jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS meetings_rm_idx ON meetings(rm_id)`;
  await sql`CREATE INDEX IF NOT EXISTS meetings_started_at_idx ON meetings(started_at)`;
  await sql`CREATE INDEX IF NOT EXISTS meetings_cp_code_idx ON meetings(cp_code)`;

  // Idempotent add for the engagement-vs-visit classification. Existing rows
  // back-fill to 'engagement' (their summaries were generated against the
  // original question set).
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_type text NOT NULL DEFAULT 'engagement'`;

  console.log('Creating cp_assignments table...');
  await sql`
    CREATE TABLE IF NOT EXISTS cp_assignments (
      cp_code text PRIMARY KEY,
      rm_id uuid REFERENCES users(id) ON DELETE SET NULL,
      is_admin_override boolean NOT NULL DEFAULT false,
      source text NOT NULL DEFAULT 'seed',
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS cp_assignments_rm_idx ON cp_assignments(rm_id)`;

  console.log('Creating cp_visits table...');
  await sql`
    CREATE TABLE IF NOT EXISTS cp_visits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_row_id text NOT NULL,
      cp_code text NOT NULL,
      visited_at date NOT NULL,
      status_raw text,
      broker_contact text,
      raw jsonb,
      synced_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS cp_visits_source_row_uq ON cp_visits(source_row_id)`;
  await sql`CREATE INDEX IF NOT EXISTS cp_visits_cp_code_idx ON cp_visits(cp_code)`;
  await sql`CREATE INDEX IF NOT EXISTS cp_visits_visited_at_idx ON cp_visits(visited_at)`;

  console.log('Creating cp_sync_state table...');
  await sql`
    CREATE TABLE IF NOT EXISTS cp_sync_state (
      id integer PRIMARY KEY,
      last_synced_at timestamptz,
      last_row_count integer,
      last_error text,
      in_progress boolean NOT NULL DEFAULT false
    )
  `;
  // Ensure the singleton row exists so UPSERTs in the sync code can target id=1.
  await sql`INSERT INTO cp_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  console.log('\n✓ Done. Schema is ready.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
