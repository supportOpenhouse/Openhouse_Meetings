// Audio → transcript → summary → persist, for one meeting row in status
// 'processing'. Shared by:
//   - POST /api/meetings/[id]/process  (fired by the RM's browser after upload)
//   - GET  /api/meetings/process-stuck (cron sweeper for rows whose browser
//     trigger never arrived — app closed, network drop, WebView killed)
//   - drizzle/process_stuck.js          (one-off backfill CLI)
//
// Relative imports + plain neon SQL (no @/ aliases, no drizzle db) so the CLI
// can import it under plain Node, like lib/claude.js.

import { neon } from '@neondatabase/serverless';
import { transcribeWithElevenLabs } from './elevenlabs.js';
import { summarizeWithClaude } from './claude.js';

let _sql;
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

// Default event logger: a bare activity_logs insert. The API route passes its
// own (lib/activityLog's, which also records IP / user agent).
async function insertEvent({ userId, eventType, meetingId, cpCode, payload }) {
  try {
    await sql()`
      INSERT INTO activity_logs (user_id, event_type, meeting_id, cp_code, payload)
      VALUES (${userId || null}, ${eventType}, ${meetingId || null}, ${cpCode || null},
              ${payload ? JSON.stringify(payload) : null}::jsonb)
    `;
  } catch {}
}

// meeting: { id, rm_id, cp_code, cp_mobile, purpose, audio_url, meeting_type,
//            duration_seconds }. Returns { ok: true } or { ok: false, error }.
// Never throws. On failure the row is marked 'failed' but the audio is KEPT,
// so the meeting can be reprocessed once the cause (e.g. an ElevenLabs
// outage) is fixed.
// alreadyClaimed: the caller wrote the 'started' event itself via
// claimMeeting (the sweeper), so don't log it again.
export async function processMeeting(
  meeting,
  { rmName = 'Unknown', log = insertEvent, source = 'browser', alreadyClaimed = false } = {}
) {
  const type = meeting.meeting_type || 'engagement';
  const base = { userId: meeting.rm_id, meetingId: meeting.id, cpCode: meeting.cp_code };
  if (!alreadyClaimed) {
    await log({ ...base, eventType: 'meeting.processing.started', payload: { meeting_type: type, source } });
  }

  try {
    if (!meeting.audio_url) throw new Error('Meeting has no audio_url');
    const audioRes = await fetch(meeting.audio_url);
    if (!audioRes.ok) throw new Error(`Could not fetch uploaded audio: ${audioRes.status}`);
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const mime = audioRes.headers.get('content-type') || 'audio/webm';

    const transcript = await transcribeWithElevenLabs(buf, mime, process.env.ELEVENLABS_LANGUAGE || '');

    // Every meeting type gets a smart summary — including 'call' (direct-RM
    // phone calls), which use the buyer-discovery survey question set.
    const summary = await summarizeWithClaude(
      transcript.text || '',
      {
        rm_name: rmName,
        cp_code: meeting.cp_code,
        cp_mobile: meeting.cp_mobile,
        purpose: meeting.purpose,
        duration_seconds: meeting.duration_seconds,
      },
      type
    );

    await sql()`
      UPDATE meetings SET
        language = ${transcript.language_code || null},
        transcript_text = ${transcript.text || ''},
        transcript_words = ${JSON.stringify(transcript.words || [])}::jsonb,
        summary = ${JSON.stringify(summary)}::jsonb,
        status = 'ready',
        error_message = NULL
      WHERE id = ${meeting.id}
    `;

    await log({
      ...base,
      eventType: 'meeting.processing.succeeded',
      payload: {
        meeting_type: type,
        source,
        transcript_length: (transcript.text || '').length,
        score: summary?.score?.total ?? null,
        classification: summary?.score?.classification || summary?.engagement?.sentiment || null,
      },
    });
    return { ok: true };
  } catch (e) {
    const error = (e?.message || 'Processing failed').slice(0, 500);
    console.error('[processMeeting] failed', { id: meeting.id, error });
    await log({ ...base, eventType: 'meeting.processing.failed', payload: { error, source } });
    try {
      await sql()`UPDATE meetings SET status = 'failed', error_message = ${error} WHERE id = ${meeting.id}`;
    } catch {}
    return { ok: false, error };
  }
}

// Meetings stuck in 'processing': created over `olderThanMinutes` ago and not
// picked up by any processor in the last `inFlightMinutes` (a run can take up
// to the route's 800s limit). `attempts` counts earlier processing starts.
export async function findStuckMeetings({ olderThanMinutes = 10, inFlightMinutes = 20, limit = 50 } = {}) {
  return sql()`
    SELECT m.id, m.rm_id, m.cp_code, m.cp_mobile, m.purpose, m.audio_url,
           m.meeting_type, m.duration_seconds, u.name AS rm_name,
           (SELECT count(*)::int FROM activity_logs a
             WHERE a.meeting_id = m.id AND a.event_type = 'meeting.processing.started') AS attempts
    FROM meetings m
    LEFT JOIN users u ON u.id = m.rm_id
    WHERE m.status = 'processing'
      AND m.created_at < now() - (${String(olderThanMinutes)} || ' minutes')::interval
      AND NOT EXISTS (
        SELECT 1 FROM activity_logs a
        WHERE a.meeting_id = m.id AND a.event_type = 'meeting.processing.started'
          AND a.created_at > now() - (${String(inFlightMinutes)} || ' minutes')::interval
      )
    ORDER BY m.created_at
    LIMIT ${limit}
  `;
}

// Claims one stuck meeting for this sweeper run: writes its 'started' event
// only if the meeting is still 'processing' and nobody started it in the last
// `inFlightMinutes`, in a single statement. findStuckMeetings picks a whole
// batch up front, so without this two overlapping runs (a manual trigger
// during a cron run) both processed the same meetings.
export async function claimMeeting(meeting, { source = 'sweeper', inFlightMinutes = 20 } = {}) {
  const payload = JSON.stringify({ meeting_type: meeting.meeting_type || 'engagement', source });
  const rows = await sql()`
    INSERT INTO activity_logs (user_id, event_type, meeting_id, cp_code, payload)
    SELECT ${meeting.rm_id || null}, 'meeting.processing.started', ${meeting.id}, ${meeting.cp_code || null}, ${payload}::jsonb
    WHERE EXISTS (SELECT 1 FROM meetings WHERE id = ${meeting.id} AND status = 'processing')
      AND NOT EXISTS (
        SELECT 1 FROM activity_logs
        WHERE meeting_id = ${meeting.id} AND event_type = 'meeting.processing.started'
          AND created_at > now() - (${String(inFlightMinutes)} || ' minutes')::interval
      )
    RETURNING id
  `;
  return rows.length > 0;
}

export const MAX_PROCESS_ATTEMPTS = 3;

export async function markGaveUp(meeting) {
  const error = `Gave up after ${MAX_PROCESS_ATTEMPTS} processing attempts`;
  await sql()`UPDATE meetings SET status = 'failed', error_message = ${error} WHERE id = ${meeting.id}`;
  await insertEvent({
    userId: meeting.rm_id,
    eventType: 'meeting.processing.failed',
    meetingId: meeting.id,
    cpCode: meeting.cp_code,
    payload: { error, source: 'sweeper' },
  });
}
