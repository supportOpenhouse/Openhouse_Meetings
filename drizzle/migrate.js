// Run with: node drizzle/migrate.js
// Bootstraps the schema directly. For incremental migrations later, use drizzle-kit generate.

// Loads env via Node's --env-file flag. Run with: npm run db:migrate
// (npm script passes --env-file=.env.local)

import { neon } from '@neondatabase/serverless';
import dns from 'node:dns';

// Many ISPs (common in India) have flaky IPv6 routing to AWS — Node's fetch
// tries IPv6 first and the TCP connect times out before falling back. Force
// IPv4-first DNS resolution so connections to Neon are reliable.
dns.setDefaultResultOrder('ipv4first');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Did you copy .env.example to .env.local?');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('Connecting to Neon...');
  console.log('Creating role enum...');
  try {
    await sql`CREATE TYPE role AS ENUM ('admin', 'rm', 'direct_rm')`;
  } catch (e) {
    if (!e.message.includes('already exists')) throw e;
    console.log('  enum already exists, skipping');
  }
  // Idempotently ensure the direct_rm value exists on an older enum.
  await sql`ALTER TYPE role ADD VALUE IF NOT EXISTS 'direct_rm'`;

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

  // For the admin activity feed: an append-only event log + a per-user
  // last_seen timestamp powering the "online now" view.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz`;

  // Onboarding meetings don't have a cp_code (the CP isn't onboarded yet) and
  // phone is optional. Drop NOT NULL on both — existing rows are unaffected.
  await sql`ALTER TABLE meetings ALTER COLUMN cp_code DROP NOT NULL`;
  await sql`ALTER TABLE meetings ALTER COLUMN cp_mobile DROP NOT NULL`;

  // Device geolocation captured when recording starts.
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_lat double precision`;
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_lng double precision`;
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_accuracy double precision`;

  console.log('Creating activity_logs table...');
  await sql`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      event_type text NOT NULL,
      meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
      cp_code text,
      payload jsonb,
      ip text,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON activity_logs(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS activity_logs_event_idx ON activity_logs(event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS activity_logs_meeting_idx ON activity_logs(meeting_id)`;

  console.log('Creating insights table...');
  await sql`
    CREATE TABLE IF NOT EXISTS insights (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scope text NOT NULL,
      insight_key text NOT NULL,
      title text,
      question text,
      result jsonb,
      meeting_count integer,
      period_days integer,
      generated_at timestamptz NOT NULL DEFAULT now(),
      generated_by uuid REFERENCES users(id) ON DELETE SET NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS insights_scope_key_idx ON insights(scope, insight_key)`;
  await sql`CREATE INDEX IF NOT EXISTS insights_generated_at_idx ON insights(generated_at DESC)`;

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
