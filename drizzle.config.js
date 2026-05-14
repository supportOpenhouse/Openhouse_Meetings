import 'dotenv/config';

/** @type {import('drizzle-kit').Config} */
export default {
  schema: './drizzle/schema.js',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
};
