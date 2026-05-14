import { db } from '@/lib/db';
import { users, meetings } from '@/drizzle/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

export async function listMeetingsForRM(rmId) {
  return db
    .select({
      id: meetings.id,
      rm_id: meetings.rm_id,
      cp_code: meetings.cp_code,
      cp_mobile: meetings.cp_mobile,
      cp_name: meetings.cp_name,
      purpose: meetings.purpose,
      started_at: meetings.started_at,
      duration_seconds: meetings.duration_seconds,
      language: meetings.language,
      audio_url: meetings.audio_url,
      summary: meetings.summary,
      rm_name: users.name,
      rm_email: users.email,
    })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.rm_id))
    .where(eq(meetings.rm_id, rmId))
    .orderBy(desc(meetings.started_at));
}

export async function listAllMeetings({ rmFilter, since } = {}) {
  const conditions = [];
  if (rmFilter && rmFilter !== 'all') conditions.push(eq(meetings.rm_id, rmFilter));
  if (since) conditions.push(gte(meetings.started_at, since));

  return db
    .select({
      id: meetings.id,
      rm_id: meetings.rm_id,
      cp_code: meetings.cp_code,
      cp_mobile: meetings.cp_mobile,
      cp_name: meetings.cp_name,
      purpose: meetings.purpose,
      started_at: meetings.started_at,
      duration_seconds: meetings.duration_seconds,
      language: meetings.language,
      audio_url: meetings.audio_url,
      summary: meetings.summary,
      rm_name: users.name,
      rm_email: users.email,
    })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.rm_id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(meetings.started_at));
}

export async function getMeetingById(id) {
  const [m] = await db
    .select({
      id: meetings.id,
      rm_id: meetings.rm_id,
      cp_code: meetings.cp_code,
      cp_mobile: meetings.cp_mobile,
      cp_name: meetings.cp_name,
      purpose: meetings.purpose,
      started_at: meetings.started_at,
      duration_seconds: meetings.duration_seconds,
      language: meetings.language,
      audio_url: meetings.audio_url,
      transcript_text: meetings.transcript_text,
      transcript_words: meetings.transcript_words,
      summary: meetings.summary,
      rm_name: users.name,
      rm_email: users.email,
    })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.rm_id))
    .where(eq(meetings.id, id));
  return m;
}

export async function deleteMeeting(id) {
  return db.delete(meetings).where(eq(meetings.id, id));
}

export async function insertMeeting(data) {
  const [m] = await db.insert(meetings).values(data).returning();
  return m;
}

export async function listRMs() {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: users.role,
      is_active: users.is_active,
      created_at: users.created_at,
    })
    .from(users)
    .orderBy(desc(users.created_at));
}

export async function createRM({ email, name, role, created_by }) {
  const [u] = await db
    .insert(users)
    .values({
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      role: role || 'rm',
      is_active: true,
      created_by,
    })
    .returning();
  return u;
}

export async function updateRM(id, patch) {
  const [u] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return u;
}

export async function deleteRM(id) {
  return db.delete(users).where(eq(users.id, id));
}

export async function getUserByEmail(email) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return u;
}

export async function overviewStats() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  async function countSince(date) {
    const [row] = await db
      .select({
        count: sql`count(*)::int`,
        minutes: sql`coalesce(sum(${meetings.duration_seconds}), 0)::int`,
      })
      .from(meetings)
      .where(gte(meetings.started_at, date));
    return { count: row.count, minutes: Math.round(row.minutes / 60) };
  }

  const [day, week, month, ninety] = await Promise.all([
    countSince(dayAgo),
    countSince(weekAgo),
    countSince(monthAgo),
    countSince(ninetyAgo),
  ]);

  const [totalRow] = await db
    .select({
      count: sql`count(*)::int`,
      minutes: sql`coalesce(sum(${meetings.duration_seconds}), 0)::int`,
    })
    .from(meetings);

  const rmRows = await db
    .select({
      rm_id: meetings.rm_id,
      rm_name: users.name,
      rm_email: users.email,
      count: sql`count(*)::int`,
      minutes: sql`coalesce(sum(${meetings.duration_seconds}), 0)::int`,
      last_meeting: sql`max(${meetings.started_at})`,
    })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.rm_id))
    .groupBy(meetings.rm_id, users.name, users.email);

  return {
    day,
    week,
    month,
    ninety,
    total: { count: totalRow.count, minutes: Math.round(totalRow.minutes / 60) },
    per_rm: rmRows.map((r) => ({
      ...r,
      minutes: Math.round(r.minutes / 60),
    })),
  };
}
