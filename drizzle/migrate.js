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
  // Field-sales executive role (separate /sales experience + own tables).
  await sql`ALTER TYPE role ADD VALUE IF NOT EXISTS 'sales_rm'`;

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

  // Original device filename for direct-RM call uploads — dedupes re-uploads.
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS source_filename text`;
  await sql`CREATE INDEX IF NOT EXISTS meetings_source_filename_idx ON meetings(rm_id, source_filename)`;

  // Salestrail call-sync: external call id (dedupe key) + fetch retry counter.
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS salestrail_call_id text`;
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS salestrail_fetch_attempts integer NOT NULL DEFAULT 0`;
  // Partial-unique so a Salestrail call is imported at most once (NULLs, i.e.
  // in-app + manual-upload rows, are unconstrained).
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS meetings_salestrail_call_uq ON meetings(salestrail_call_id) WHERE salestrail_call_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS meetings_status_idx ON meetings(status)`;

  // Visit-dropdown linkage. For meeting_type='visit' rows started by picking
  // a scheduled visit from the Google Sheet, we save the sheet row's id and
  // the relevant buyer/society/broker metadata so the dashboard + detail
  // views can show "who the visit was with" without re-querying the sheet.
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cp_visit_id text`;
  await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cp_visit_meta jsonb`;
  // Index supports the "all recordings for this scheduled visit" grouping
  // in the dashboard (multiple RM recordings of the same visit_id).
  await sql`CREATE INDEX IF NOT EXISTS meetings_cp_visit_id_idx ON meetings(cp_visit_id) WHERE cp_visit_id IS NOT NULL`;

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
  // Admin "save" feature — pinned rows persist past the next regenerate.
  await sql`ALTER TABLE insights ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS insights_pinned_idx ON insights(pinned) WHERE pinned = true`;

  // Per-item "save this point" — finer-grained than whole-row pinning.
  await sql`
    CREATE TABLE IF NOT EXISTS saved_insight_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_insight_id uuid REFERENCES insights(id) ON DELETE SET NULL,
      source_title text,
      scope text NOT NULL,
      item jsonb NOT NULL,
      saved_by uuid REFERENCES users(id) ON DELETE SET NULL,
      saved_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS saved_insight_items_scope_idx ON saved_insight_items(scope)`;
  await sql`CREATE INDEX IF NOT EXISTS saved_insight_items_saved_at_idx ON saved_insight_items(saved_at DESC)`;

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

  console.log('Creating salestrail_sync_state table...');
  await sql`
    CREATE TABLE IF NOT EXISTS salestrail_sync_state (
      id integer PRIMARY KEY,
      cursor_at timestamptz,
      last_run_at timestamptz,
      last_result jsonb,
      in_progress boolean NOT NULL DEFAULT false,
      paused boolean NOT NULL DEFAULT false
    )
  `;
  // Idempotent add for DBs created before the pause kill-switch existed.
  await sql`ALTER TABLE salestrail_sync_state ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false`;
  await sql`INSERT INTO salestrail_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  // ── Sales RM tables (separate data island from meetings) ──
  console.log('Creating sales_channel_partners table...');
  await sql`
    CREATE TABLE IF NOT EXISTS sales_channel_partners (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cp_id text NOT NULL,
      cp_name text NOT NULL,
      phone_primary text NOT NULL,
      phone_secondary text,
      email text,
      primary_business jsonb,
      team_size integer,
      monthly_deal_volume integer,
      other_platforms jsonb,
      office_address text,
      office_lat double precision,
      office_lng double precision,
      office_verification_status text,
      societies jsonb,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_cp_cp_id_uq ON sales_channel_partners(cp_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_cp_phone_idx ON sales_channel_partners(phone_primary)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_cp_created_by_idx ON sales_channel_partners(created_by)`;

  console.log('Creating sales_visits table...');
  await sql`
    CREATE TABLE IF NOT EXISTS sales_visits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sales_rm_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      sales_cp_id uuid REFERENCES sales_channel_partners(id) ON DELETE SET NULL,
      cp_code text,
      cp_name text,
      meeting_type text NOT NULL DEFAULT 'first_visit',
      check_in_time timestamptz NOT NULL,
      check_out_time timestamptz,
      duration_seconds integer NOT NULL DEFAULT 0,
      meeting_lat double precision,
      meeting_lng double precision,
      location_accuracy double precision,
      key_discussion_points text,
      cp_engagement_level text,
      competitive_update text,
      inventory_received boolean NOT NULL DEFAULT false,
      inventory_pipeline_count integer,
      next_followup_date date,
      next_action_required text,
      meeting_outcome text,
      selfie_url text,
      audio_url text,
      transcript_text text,
      transcript_words jsonb,
      summary jsonb,
      language text,
      status text NOT NULL DEFAULT 'processing',
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sales_visits_rm_idx ON sales_visits(sales_rm_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_visits_cp_idx ON sales_visits(sales_cp_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_visits_followup_idx ON sales_visits(next_followup_date)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_visits_status_idx ON sales_visits(status)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_visits_check_in_idx ON sales_visits(check_in_time)`;

  console.log('Creating sales_clock_sessions table...');
  await sql`
    CREATE TABLE IF NOT EXISTS sales_clock_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sales_rm_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clock_in_time timestamptz NOT NULL DEFAULT now(),
      clock_out_time timestamptz,
      clock_in_lat double precision,
      clock_in_lng double precision,
      clock_out_lat double precision,
      clock_out_lng double precision,
      distance_meters double precision DEFAULT 0,
      status text NOT NULL DEFAULT 'open',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sales_clock_rm_idx ON sales_clock_sessions(sales_rm_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_clock_status_idx ON sales_clock_sessions(status)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_clock_in_idx ON sales_clock_sessions(clock_in_time)`;

  console.log('Creating sales_location_pings table...');
  await sql`
    CREATE TABLE IF NOT EXISTS sales_location_pings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sales_rm_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clock_session_id uuid REFERENCES sales_clock_sessions(id) ON DELETE SET NULL,
      lat double precision NOT NULL,
      lng double precision NOT NULL,
      accuracy double precision,
      recorded_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sales_pings_rm_time_idx ON sales_location_pings(sales_rm_id, recorded_at)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_pings_session_idx ON sales_location_pings(clock_session_id)`;

  console.log('Creating sales_inventory table...');
  await sql`
    CREATE TABLE IF NOT EXISTS sales_inventory (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sales_cp_id uuid REFERENCES sales_channel_partners(id) ON DELETE SET NULL,
      sales_rm_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      cp_code text,
      cp_name text,
      city text,
      society_name text,
      configuration text,
      size_sqft integer,
      price integer,
      facing text,
      flat_status text,
      floor integer,
      unit_number text,
      furnishing text,
      comments text,
      ok_to_visit boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sales_inventory_cp_idx ON sales_inventory(sales_cp_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_inventory_rm_idx ON sales_inventory(sales_rm_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sales_inventory_created_idx ON sales_inventory(created_at)`;

  console.log('\n✓ Done. Schema is ready.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
