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

  console.log('\n✓ Done. Schema is ready.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
