import { db } from '@/lib/db';
import { users, meetings } from '@/drizzle/schema';
import { eq, desc, and, gte, lte, ilike, or, sql } from 'drizzle-orm';
import { normalizeCpCode } from '@/lib/utils';

export async function listMeetingsForRM(rmId) {
  return db
    .select({
      id: meetings.id,
      rm_id: meetings.rm_id,
      cp_code: meetings.cp_code,
      cp_mobile: meetings.cp_mobile,
      cp_name: meetings.cp_name,
      cp_city: meetings.cp_city,
      purpose: meetings.purpose,
      status: meetings.status,
      error_message: meetings.error_message,
      started_at: meetings.started_at,
      duration_seconds: meetings.duration_seconds,
      language: meetings.language,
      audio_url: meetings.audio_url,
      summary: meetings.summary,
      meeting_type: meetings.meeting_type,
      salestrail_call_id: meetings.salestrail_call_id,
      cp_visit_id: meetings.cp_visit_id,
      cp_visit_meta: meetings.cp_visit_meta,
      transcript_word_count: transcriptWordCount(),
      rm_name: users.name,
      rm_email: users.email,
    })
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.rm_id))
    .where(and(eq(meetings.rm_id, rmId), visibleMeeting()))
    .orderBy(desc(meetings.started_at));
}

// Salestrail-synced calls sit at 'fetching' (recording not pulled yet) or
// 'no_recording' (the call had no audio) before they become real meetings —
// neither is viewable, so list/count queries exclude them.
function visibleMeeting() {
  return sql`${meetings.status} not in ('fetching', 'no_recording')`;
}

// Word count of the transcript, computed in SQL so we never ship the full
// transcript text to the list views. Used to flag suspiciously short
// recordings (<100 words) in the meetings table.
function transcriptWordCount() {
  return sql`
    case
      when ${meetings.transcript_text} is null or btrim(${meetings.transcript_text}) = '' then 0
      else coalesce(array_length(regexp_split_to_array(btrim(${meetings.transcript_text}), '\\s+'), 1), 0)
    end
  `.mapWith(Number);
}

export async function listAllMeetings({ rmFilter, since, until, city, search, includeTranscript = false } = {}) {
  const conditions = [visibleMeeting()];
  if (rmFilter && rmFilter !== 'all') conditions.push(eq(meetings.rm_id, rmFilter));
  if (since) conditions.push(gte(meetings.started_at, since));
  if (until) conditions.push(lte(meetings.started_at, until));
  if (city) conditions.push(eq(meetings.cp_city, city));
  if (search) {
    const s = `%${search}%`;
    // CP code: normalize both sides (case-insensitive, strip spaces & hyphens) so
    // "cp 1284" finds "CP-1284" and vice versa. The other columns stay as ILIKE.
    const codeNeedle = `%${normalizeCpCode(search)}%`;
    conditions.push(
      or(
        sql`lower(regexp_replace(${meetings.cp_code}, '[\\s-]+', '', 'g')) like ${codeNeedle}`,
        ilike(meetings.cp_mobile, s),
        ilike(meetings.cp_name, s),
        ilike(users.name, s),
        ilike(users.email, s)
      )
    );
  }

  const columns = {
    id: meetings.id,
    rm_id: meetings.rm_id,
    cp_code: meetings.cp_code,
    cp_mobile: meetings.cp_mobile,
    cp_name: meetings.cp_name,
    cp_city: meetings.cp_city,
    purpose: meetings.purpose,
    started_at: meetings.started_at,
    created_at: meetings.created_at,
    duration_seconds: meetings.duration_seconds,
    language: meetings.language,
    audio_url: meetings.audio_url,
    summary: meetings.summary,
    meeting_type: meetings.meeting_type,
    salestrail_call_id: meetings.salestrail_call_id,
    cp_visit_id: meetings.cp_visit_id,
    cp_visit_meta: meetings.cp_visit_meta,
    transcript_word_count: transcriptWordCount(),
    rm_name: users.name,
    rm_email: users.email,
  };
  if (includeTranscript) {
    columns.transcript_text = meetings.transcript_text;
  }

  return db
    .select(columns)
    .from(meetings)
    .leftJoin(users, eq(users.id, meetings.rm_id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(meetings.started_at));
}

export async function listDistinctCities() {
  const rows = await db
    .selectDistinct({ city: meetings.cp_city })
    .from(meetings)
    .where(sql`${meetings.cp_city} is not null and length(${meetings.cp_city}) > 0`)
    .orderBy(meetings.cp_city);
  return rows.map((r) => r.city).filter(Boolean);
}

export async function getMeetingById(id) {
  const [m] = await db
    .select({
      id: meetings.id,
      rm_id: meetings.rm_id,
      cp_code: meetings.cp_code,
      cp_mobile: meetings.cp_mobile,
      cp_name: meetings.cp_name,
      cp_city: meetings.cp_city,
      purpose: meetings.purpose,
      status: meetings.status,
      error_message: meetings.error_message,
      started_at: meetings.started_at,
      duration_seconds: meetings.duration_seconds,
      language: meetings.language,
      audio_url: meetings.audio_url,
      transcript_text: meetings.transcript_text,
      transcript_words: meetings.transcript_words,
      summary: meetings.summary,
      meeting_type: meetings.meeting_type,
      salestrail_call_id: meetings.salestrail_call_id,
      cp_visit_id: meetings.cp_visit_id,
      cp_visit_meta: meetings.cp_visit_meta,
      location_lat: meetings.location_lat,
      location_lng: meetings.location_lng,
      location_accuracy: meetings.location_accuracy,
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

export async function updateMeeting(id, patch) {
  const [m] = await db.update(meetings).set(patch).where(eq(meetings.id, id)).returning();
  return m;
}

// Minimal projection used by the background processor — just enough to fetch the
// audio and persist the result without re-reading every column.
export async function getMeetingForProcessing(id) {
  const [m] = await db
    .select({
      id: meetings.id,
      rm_id: meetings.rm_id,
      cp_code: meetings.cp_code,
      cp_mobile: meetings.cp_mobile,
      cp_name: meetings.cp_name,
      purpose: meetings.purpose,
      audio_url: meetings.audio_url,
      status: meetings.status,
      meeting_type: meetings.meeting_type,
      transcript_text: meetings.transcript_text,
      duration_seconds: meetings.duration_seconds,
    })
    .from(meetings)
    .where(eq(meetings.id, id));
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
      .where(and(gte(meetings.started_at, date), visibleMeeting()));
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
    .from(meetings)
    .where(visibleMeeting());

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
    .where(visibleMeeting())
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
