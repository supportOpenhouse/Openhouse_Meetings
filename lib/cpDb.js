import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';

// Connection to the external "CP inventory" Postgres database.
// This DB is owned by another service — we only READ channel_partners + cities.
if (!process.env.CP_INVENTORY_DB_STRING) {
  // Throw lazily on first use so dev/test environments without it can still boot.
  // (lib/db.js throws eagerly; we intentionally don't, because CP lookup is a soft feature.)
}

const sqlClient =
  process.env.CP_INVENTORY_DB_STRING && neon(process.env.CP_INVENTORY_DB_STRING);

// Mirror only the columns we need. Owned by another team — keep this minimal.
export const channelPartners = pgTable('channel_partners', {
  id: serial('id').primaryKey(),
  cp_code: varchar('cp_code', { length: 20 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 15 }).notNull(),
  company: varchar('company', { length: 200 }),
  city_id: integer('city_id'),
  micro_markets: jsonb('micro_markets'),
  is_active: boolean('is_active'),
  email: varchar('email', { length: 200 }),
});

// Assumed shape of public.cities — only `id` + `name` is needed.
// If the real column name is different, only this declaration needs to change.
export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }),
});

export const cpDb = sqlClient ? drizzle(sqlClient) : null;

export function isCpDbConfigured() {
  return !!sqlClient;
}

// India-centric: strip everything non-digit, keep last 10. Lets "98 7654 3210",
// "+91 98765 43210", and "9876543210" all match the same canonical key.
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}
