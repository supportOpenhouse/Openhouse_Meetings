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
    cp_code: text('cp_code').notNull(),
    cp_mobile: text('cp_mobile').notNull(),
    cp_name: text('cp_name'),
    cp_city: text('cp_city'),
    purpose: text('purpose'),
    started_at: timestamp('started_at', { withTimezone: true }).notNull(),
    duration_seconds: integer('duration_seconds').notNull().default(0),
    language: text('language'),
    audio_url: text('audio_url'),
    transcript_text: text('transcript_text'),
    transcript_words: jsonb('transcript_words'),
    summary: jsonb('summary'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    rmIdx: index('meetings_rm_idx').on(t.rm_id),
    startedAtIdx: index('meetings_started_at_idx').on(t.started_at),
    cpCodeIdx: index('meetings_cp_code_idx').on(t.cp_code),
  })
);
