import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  pgEnum,
  index,
  date,
  uniqueIndex,
  doublePrecision,
} from 'drizzle-orm/pg-core';

// 'direct_rm' — a lightweight RM who only uploads phone call recordings
// (MP3s) and sees a stripped-down dashboard. No live recording, no CP tools.
export const roleEnum = pgEnum('role', ['admin', 'rm', 'direct_rm']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name'),
    image: text('image'),
    role: roleEnum('role').notNull().default('rm'),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    created_by: uuid('created_by'),
    // Touched by the heartbeat endpoint. "Online" = last_seen_at within the
    // recent window (see admin logs page). Nullable for users who have never
    // signed in.
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: index('users_email_idx').on(t.email),
    roleIdx: index('users_role_idx').on(t.role),
  })
);

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rm_id: uuid('rm_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Nullable to accommodate onboarding meetings — a prospective CP doesn't
    // have a cp_code yet, and their phone is optional.
    cp_code: text('cp_code'),
    cp_mobile: text('cp_mobile'),
    cp_name: text('cp_name'),
    cp_city: text('cp_city'),
    purpose: text('purpose'),
    // 'engagement' (default — original meeting style) or 'visit' (site visit
    // assessment, drives a different summarization question set).
    meeting_type: text('meeting_type').notNull().default('engagement'),
    // Captured from the device when recording starts (alongside the mic
    // permission). Nullable — geolocation can be denied or unavailable.
    location_lat: doublePrecision('location_lat'),
    location_lng: doublePrecision('location_lng'),
    location_accuracy: doublePrecision('location_accuracy'),
    // Original device filename for direct-RM call uploads — used to dedupe
    // re-uploads of the same recording. Null for in-app recordings.
    source_filename: text('source_filename'),
    // Salestrail integration: the external call id. Set on phone-call
    // recordings pulled automatically from Salestrail — the dedupe key so the
    // same call is never imported twice. Null for in-app + manual-upload rows.
    salestrail_call_id: text('salestrail_call_id'),
    // Retry counter for the Salestrail recording fetch + transcription. Caps
    // runaway retries on a permanently broken call (see the sync route).
    salestrail_fetch_attempts: integer('salestrail_fetch_attempts').notNull().default(0),
    // Visit-dropdown linkage. cp_visit_id is the sheet row's id column —
    // multiple meetings sharing the same id are different recordings of the
    // same scheduled visit. cp_visit_meta snapshots the buyer/society/broker
    // fields from the sheet at the moment the meeting was started.
    cp_visit_id: text('cp_visit_id'),
    cp_visit_meta: jsonb('cp_visit_meta'),
    started_at: timestamp('started_at', { withTimezone: true }).notNull(),
    duration_seconds: integer('duration_seconds').notNull().default(0),
    language: text('language'),
    audio_url: text('audio_url'),
    transcript_text: text('transcript_text'),
    transcript_words: jsonb('transcript_words'),
    summary: jsonb('summary'),
    // Lifecycle: 'processing' (audio uploaded, transcription in flight),
    // 'ready' (transcript + summary persisted), 'failed' (background job errored).
    status: text('status').notNull().default('processing'),
    error_message: text('error_message'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    rmIdx: index('meetings_rm_idx').on(t.rm_id),
    startedAtIdx: index('meetings_started_at_idx').on(t.started_at),
    cpCodeIdx: index('meetings_cp_code_idx').on(t.cp_code),
    statusIdx: index('meetings_status_idx').on(t.status),
    salestrailCallIdx: index('meetings_salestrail_call_idx').on(t.salestrail_call_id),
    cpVisitIdx: index('meetings_cp_visit_id_idx').on(t.cp_visit_id),
  })
);

// Channel-partner ownership. Authoritative within our app — seeded once from
// the RM portfolio paste, then maintained via the admin UI. The sheet sync may
// fill blanks (rm_id is null) but never overrides a row with is_admin_override.
export const cpAssignments = pgTable(
  'cp_assignments',
  {
    cp_code: text('cp_code').primaryKey(),
    rm_id: uuid('rm_id').references(() => users.id, { onDelete: 'set null' }),
    is_admin_override: boolean('is_admin_override').notNull().default(false),
    source: text('source').notNull().default('seed'), // 'seed' | 'sheet' | 'admin'
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updated_by: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    rmIdx: index('cp_assignments_rm_idx').on(t.rm_id),
  })
);

// One row per visit from the source gsheet. source_row_id is the sheet's `id`
// column — unique so re-runs of the sync idempotently upsert.
export const cpVisits = pgTable(
  'cp_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source_row_id: text('source_row_id').notNull(),
    cp_code: text('cp_code').notNull(),
    visited_at: date('visited_at').notNull(),
    status_raw: text('status_raw'),
    broker_contact: text('broker_contact'),
    raw: jsonb('raw'),
    synced_at: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceRowUnique: uniqueIndex('cp_visits_source_row_uq').on(t.source_row_id),
    cpCodeIdx: index('cp_visits_cp_code_idx').on(t.cp_code),
    visitedAtIdx: index('cp_visits_visited_at_idx').on(t.visited_at),
  })
);

// Singleton row (id = 1) tracking last successful sheet pull. Used by the
// lazy-TTL cache so dashboard requests only trigger a fresh sync when needed.
export const cpSyncState = pgTable('cp_sync_state', {
  id: integer('id').primaryKey(),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
  last_row_count: integer('last_row_count'),
  last_error: text('last_error'),
  in_progress: boolean('in_progress').notNull().default(false),
});

// Singleton row (id = 1) tracking the Salestrail call-recording sync.
// cursor_at is the high-water mark on Salestrail's "createdAt" axis — the next
// run pulls calls created after it. last_result holds the most recent run's
// per-phase counts (shown on the admin Call-sync page).
export const salestrailSyncState = pgTable('salestrail_sync_state', {
  id: integer('id').primaryKey(),
  cursor_at: timestamp('cursor_at', { withTimezone: true }),
  last_run_at: timestamp('last_run_at', { withTimezone: true }),
  last_result: jsonb('last_result'),
  in_progress: boolean('in_progress').notNull().default(false),
  // Admin kill-switch for the continuous self-chaining drain.
  paused: boolean('paused').notNull().default(false),
});

// Cached Claude-synthesized insights for the admin analytics dashboard. Each
// row is one generated insight; the dashboard shows the most recent row per
// (scope, insight_key). Custom questions are stored with insight_key='custom'.
// Generation is on-demand (a button) — re-viewing a cached row costs nothing.
export const insights = pgTable(
  'insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull(), // 'visit' | 'engagement' | 'onboarding' | 'cross_cut'
    insight_key: text('insight_key').notNull(), // stable id, or 'custom'
    title: text('title'),
    question: text('question'), // the user's text for custom questions
    result: jsonb('result'), // { headline, items:[{label,value,note}], narrative }
    meeting_count: integer('meeting_count'),
    period_days: integer('period_days'), // window the corpus was drawn from (0 = all time)
    generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    generated_by: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    // Admin "Save" button — pinned rows are kept around as named snapshots even
    // after a fresh Refresh overwrites the displayed-latest for that key.
    pinned: boolean('pinned').notNull().default(false),
  },
  (t) => ({
    scopeKeyIdx: index('insights_scope_key_idx').on(t.scope, t.insight_key),
    generatedAtIdx: index('insights_generated_at_idx').on(t.generated_at),
    pinnedIdx: index('insights_pinned_idx').on(t.pinned),
  })
);

// Admin "Save this point" — one row per pinned bullet from inside an AI
// insight's items list. Lets admins keep specific takeaways alive even when
// the parent insight is regenerated and that exact phrasing changes.
export const savedInsightItems = pgTable(
  'saved_insight_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Null when the parent insight gets deleted (we keep the saved item as a
    // standalone snapshot — `source_title` is denormalised for that case).
    source_insight_id: uuid('source_insight_id').references(() => insights.id, {
      onDelete: 'set null',
    }),
    source_title: text('source_title'),
    scope: text('scope').notNull(), // 'visit' | 'engagement' | 'onboarding' | 'direct' | 'cross_cut'
    item: jsonb('item').notNull(), // { label, value, note, meeting_ids }
    saved_by: uuid('saved_by').references(() => users.id, { onDelete: 'set null' }),
    saved_at: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    scopeIdx: index('saved_insight_items_scope_idx').on(t.scope),
    savedAtIdx: index('saved_insight_items_saved_at_idx').on(t.saved_at),
  })
);

// Append-only activity feed visible to admins. Records auth events, recording
// lifecycle, uploads, processing, CP assignment changes, and errors. Heartbeat
// pings do NOT land here — they only touch users.last_seen_at to avoid spam.
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    event_type: text('event_type').notNull(),
    meeting_id: uuid('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
    cp_code: text('cp_code'),
    payload: jsonb('payload'),
    ip: text('ip'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('activity_logs_user_idx').on(t.user_id),
    eventIdx: index('activity_logs_event_idx').on(t.event_type),
    createdAtIdx: index('activity_logs_created_at_idx').on(t.created_at),
    meetingIdx: index('activity_logs_meeting_idx').on(t.meeting_id),
  })
);
