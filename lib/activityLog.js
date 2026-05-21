import { db } from '@/lib/db';
import { activityLogs, users } from '@/drizzle/schema';
import { eq, sql, desc, and, gte, like } from 'drizzle-orm';

// Canonical event types. New events should be added here so the admin UI can
// render them with a sensible label/icon.
export const EVENT_TYPES = [
  // Auth
  'auth.login',
  'auth.logout',
  // Meeting lifecycle (server-recorded)
  'meeting.created',
  'meeting.processing.started',
  'meeting.processing.succeeded',
  'meeting.processing.failed',
  'meeting.resummarized',
  'meeting.deleted',
  // Recording lifecycle (client-recorded via /api/logs/event)
  'recording.started',
  'recording.paused',
  'recording.resumed',
  'recording.discarded',
  'recording.finalized',
  // Recording disturbances — mic cut off / app backgrounded mid-recording
  'recording.mic_muted',
  'recording.mic_unmuted',
  'recording.mic_ended',
  'recording.backgrounded',
  'recording.foregrounded',
  'recording.error',
  'recording.location_unavailable',
  // Upload lifecycle (client-recorded)
  'upload.started',
  'upload.failed',
  'upload.stalled',
  'upload.retried',
  // CP feature
  'cp.assignment_changed',
  'cp.sync_triggered',
  'cp.sync_failed',
  // Analytics
  'insight.generated',
  // Generic
  'error',
];

// Whitelist for the POST /api/logs/event endpoint — only client-recordable
// events. (Anything server-side authoritative must NOT be settable from the
// browser, otherwise an RM could spoof an admin action.)
export const CLIENT_LOGGABLE_EVENTS = new Set([
  'recording.started',
  'recording.paused',
  'recording.resumed',
  'recording.discarded',
  'recording.finalized',
  'recording.mic_muted',
  'recording.mic_unmuted',
  'recording.mic_ended',
  'recording.backgrounded',
  'recording.foregrounded',
  'recording.error',
  'recording.location_unavailable',
  'upload.started',
  'upload.failed',
  'upload.stalled',
  'upload.retried',
  'error',
]);

function extractIp(request) {
  if (!request) return null;
  const get = request.headers?.get?.bind(request.headers);
  if (!get) return null;
  const fwd = get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return get('x-real-ip') || null;
}

function extractUa(request) {
  if (!request) return null;
  return request.headers?.get?.('user-agent') || null;
}

// Best-effort logging — never throws. Primary action should not break because
// activity logging hit a problem.
export async function logActivity({
  userId = null,
  eventType,
  meetingId = null,
  cpCode = null,
  payload = null,
  request = null,
}) {
  try {
    await db.insert(activityLogs).values({
      user_id: userId,
      event_type: eventType,
      meeting_id: meetingId,
      cp_code: cpCode,
      payload,
      ip: extractIp(request),
      user_agent: extractUa(request),
    });
  } catch (e) {
    console.error('[activityLog] insert failed', { eventType, message: e?.message });
  }
}

// Touched by the heartbeat endpoint. Idempotent — last write wins.
export async function touchLastSeen(userId) {
  if (!userId) return;
  try {
    await db.update(users).set({ last_seen_at: new Date() }).where(eq(users.id, userId));
  } catch (e) {
    console.error('[touchLastSeen] failed', { userId, message: e?.message });
  }
}

// Used by the admin logs page.
export async function listRecentActivity({
  limit = 200,
  eventType = null,
  userId = null,
  since = null,
} = {}) {
  const conditions = [];
  if (eventType) conditions.push(like(activityLogs.event_type, `${eventType}%`));
  if (userId) conditions.push(eq(activityLogs.user_id, userId));
  if (since) conditions.push(gte(activityLogs.created_at, since));

  return db
    .select({
      id: activityLogs.id,
      user_id: activityLogs.user_id,
      event_type: activityLogs.event_type,
      meeting_id: activityLogs.meeting_id,
      cp_code: activityLogs.cp_code,
      payload: activityLogs.payload,
      ip: activityLogs.ip,
      user_agent: activityLogs.user_agent,
      created_at: activityLogs.created_at,
      user_name: users.name,
      user_email: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.user_id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(activityLogs.created_at))
    .limit(limit);
}

// Online = anyone whose last_seen_at is within the given window (default 5 min).
export async function listOnlineUsers({ windowSeconds = 300 } = {}) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      last_seen_at: users.last_seen_at,
    })
    .from(users)
    .where(sql`${users.last_seen_at} > now() - (${windowSeconds} || ' seconds')::interval`)
    .orderBy(desc(users.last_seen_at));
}
