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
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'rm']);

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
