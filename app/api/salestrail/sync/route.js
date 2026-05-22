import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { like } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { meetings } from '@/drizzle/schema';
import {
  isSalestrailConfigured,
  listCallsByCreated,
  fetchRecording,
  isSyncWeekday,
  extForAudio,
} from '@/lib/salestrail';
import { cpDb, isCpDbConfigured, channelPartners, normalizePhone } from '@/lib/cpDb';
import { transcribeWithElevenLabs } from '@/lib/elevenlabs';
import { summarizeWithClaude } from '@/lib/claude';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Transcription is I/O-bound (ElevenLabs, Claude) — a generous ceiling so a
// batch with a few long recordings still finishes in one run.
export const maxDuration = 800;

const DAY_MS = 86400000;
const BACKFILL_DAYS = 90; // first run reaches this far back
const WINDOW_DAYS = 14; // max createdAt span scanned per run (bounds payload)
const OVERLAP_DAYS = 2; // re-scan margin for late-arriving Salestrail records
const MAX_ATTEMPTS = 5; // give up on a call after this many failed fetches
const INSERT_CHUNK = 500; // rows per INSERT (stay under the Postgres param cap)
// Recordings transcribed per run, in parallel. Each holds an audio buffer in
// memory + one ElevenLabs + one Claude call — keep this modest.
const BATCH = parseInt(process.env.SALESTRAIL_BATCH || '8', 10) || 8;

function isCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// GET — invoked by Vercel Cron (Authorization: Bearer CRON_SECRET) or by an
// admin. POST — the admin "Sync now" button; an optional { rescanDays } rewinds
// the cursor so the next runs re-scan that range (picks up calls missed earlier,
// e.g. for an RM added after the fact).
export async function GET(request) {
  if (!isCronRequest(request)) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return runSync(request);
}

export async function POST(request) {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body = {};
  try { body = await request.json(); } catch {}
  const rescanDays = [30, 90].includes(body?.rescanDays) ? body.rescanDays : null;
  if (rescanDays) {
    const sql = neon(process.env.DATABASE_URL);
    await sql`
      UPDATE salestrail_sync_state
      SET cursor_at = now() - (${String(rescanDays)} || ' days')::interval
      WHERE id = 1
    `;
  }
  return runSync(request);
}

async function runSync(request) {
  if (!isSalestrailConfigured()) {
    return NextResponse.json(
      { error: 'Salestrail API credentials are not configured' },
      { status: 503 }
    );
  }
  const sql = neon(process.env.DATABASE_URL);

  // Self-heal the singleton row in case only the table creation ran.
  await sql`INSERT INTO salestrail_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  // Concurrency guard — but a lock older than 15 min is treated as stale (the
  // function maxDuration is 800s, so a healthy run always clears it sooner).
  const [state] = await sql`
    SELECT cursor_at, last_run_at, in_progress FROM salestrail_sync_state WHERE id = 1
  `;
  if (
    state?.in_progress &&
    state.last_run_at &&
    Date.now() - new Date(state.last_run_at).getTime() < 15 * 60 * 1000
  ) {
    return NextResponse.json({ skipped: true, reason: 'A sync is already running' });
  }
  await sql`UPDATE salestrail_sync_state SET in_progress = true, last_run_at = now() WHERE id = 1`;

  const result = {
    scanned: 0, // calls returned by Salestrail for the window
    off_day: 0, // skipped — not a Monday/Friday
    no_rm: 0, // skipped — userEmail not a known Openhouse RM
    imported: 0, // new meeting rows created (queued for a recording fetch)
    processed: 0, // recordings fetched + transcribed this run
    no_recording: 0, // calls that turned out to have no recording
    failed: 0, // recordings that errored out
    retry: 0, // transient errors — will be retried next run
    window: null,
  };

  try {
    // ---- Phase A: pull call metadata, insert "fetching" rows ----
    const now = Date.now();
    const cursorMs = state?.cursor_at ? new Date(state.cursor_at).getTime() : null;
    const startMs = cursorMs == null ? now - BACKFILL_DAYS * DAY_MS : cursorMs;
    const from = new Date(Math.max(0, startMs - OVERLAP_DAYS * DAY_MS));
    const to = new Date(Math.min(now, startMs + WINDOW_DAYS * DAY_MS));
    result.window = { from: from.toISOString(), to: to.toISOString() };

    const calls = await listCallsByCreated(from, to);
    result.scanned = calls.length;

    // Keep only Monday/Friday calls (IST).
    const onDay = calls.filter((c) => isSyncWeekday(c.startTime));
    result.off_day = calls.length - onDay.length;

    if (onDay.length > 0) {
      // Resolve userEmail → rm_id in a single query. direct_rm users are
      // excluded — Salestrail sync is for regular RMs only; direct RMs keep
      // using their own manual upload screen.
      const emails = [...new Set(onDay.map((c) => c.userEmail).filter(Boolean))];
      const rmRows = emails.length
        ? await sql`
            SELECT id, lower(email) AS email FROM users
            WHERE lower(email) = ANY(${emails}) AND role <> 'direct_rm'
          `
        : [];
      const rmByEmail = new Map(rmRows.map((r) => [r.email, r.id]));

      const seen = new Set();
      const rows = [];
      for (const c of onDay) {
        if (seen.has(c.callId)) continue;
        seen.add(c.callId);
        const rmId = c.userEmail ? rmByEmail.get(c.userEmail) : null;
        if (!rmId) {
          result.no_rm++;
          continue;
        }
        rows.push({
          rm_id: rmId,
          cp_code: null,
          cp_mobile: normalizePhone(c.contactNumber),
          cp_name: null,
          cp_city: null,
          purpose: null,
          meeting_type: 'engagement',
          started_at: new Date(c.startTime),
          duration_seconds: c.durationSeconds,
          status: 'fetching',
          salestrail_call_id: c.callId,
        });
      }

      // onConflictDoNothing makes the overlap re-scan idempotent (the unique
      // index on salestrail_call_id rejects any already-imported call).
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const inserted = await db
          .insert(meetings)
          .values(rows.slice(i, i + INSERT_CHUNK))
          .onConflictDoNothing()
          .returning({ id: meetings.id });
        result.imported += inserted.length;
      }
    }

    // Advance the cursor past this window.
    await sql`UPDATE salestrail_sync_state SET cursor_at = ${to.toISOString()} WHERE id = 1`;

    // ---- Phase B: fetch + transcribe a capped batch of queued recordings ----
    const pending = await sql`
      SELECT id, salestrail_call_id, cp_mobile, audio_url, duration_seconds
      FROM meetings
      WHERE status = 'fetching'
        AND salestrail_call_id IS NOT NULL
        AND salestrail_fetch_attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT ${BATCH}
    `;
    const outcomes = await Promise.allSettled(pending.map((m) => processOne(sql, m)));
    for (const o of outcomes) {
      const v = o.status === 'fulfilled' ? o.value : 'failed';
      if (v === 'processed') result.processed++;
      else if (v === 'no_recording') result.no_recording++;
      else if (v === 'failed') result.failed++;
      else result.retry++;
    }

    await sql`
      UPDATE salestrail_sync_state
      SET in_progress = false, last_run_at = now(), last_result = ${JSON.stringify(result)}::jsonb
      WHERE id = 1
    `;
    logActivity({ eventType: 'salestrail.sync', payload: result, request });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || 'Salestrail sync failed';
    await sql`
      UPDATE salestrail_sync_state
      SET in_progress = false, last_run_at = now(),
          last_result = ${JSON.stringify({ ...result, error: msg.slice(0, 500) })}::jsonb
      WHERE id = 1
    `.catch(() => {});
    logActivity({ eventType: 'salestrail.sync.failed', payload: { error: msg.slice(0, 500) }, request });
    return NextResponse.json({ ok: false, error: msg, ...result }, { status: 500 });
  }
}

// Resolves one queued meeting: CP lookup → recording fetch → re-host on Blob →
// transcribe → summarize. Returns 'processed' | 'no_recording' | 'failed' |
// 'retry'. Never throws (the caller treats a rejection as 'failed').
async function processOne(sql, m) {
  // Count this attempt up-front so a crash mid-processing can't loop forever.
  const [bumped] = await sql`
    UPDATE meetings SET salestrail_fetch_attempts = salestrail_fetch_attempts + 1
    WHERE id = ${m.id}
    RETURNING salestrail_fetch_attempts
  `;
  const attempts = bumped?.salestrail_fetch_attempts || 1;

  try {
    // Match the contact's phone to the CP inventory (suffix match tolerates a
    // +91 prefix on stored numbers).
    let cpCode = null;
    let cpName = null;
    const phone = normalizePhone(m.cp_mobile);
    if (phone && isCpDbConfigured()) {
      try {
        const rows = await cpDb
          .select({ cp_code: channelPartners.cp_code, name: channelPartners.name })
          .from(channelPartners)
          .where(like(channelPartners.phone, `%${phone}`))
          .limit(1);
        if (rows[0]) {
          cpCode = rows[0].cp_code || null;
          cpName = rows[0].name || null;
        }
      } catch {
        // CP lookup is a soft enrichment — never block the import on it.
      }
    }

    // Get the audio. Normally a fresh fetch from Salestrail; on a retry the
    // recording may already be re-hosted on our Blob.
    let buf;
    let mime;
    let audioUrl = m.audio_url;
    if (audioUrl) {
      const r = await fetch(audioUrl);
      if (!r.ok) throw new Error(`Re-hosted audio unavailable: ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());
      mime = r.headers.get('content-type') || 'audio/mpeg';
    } else {
      const rec = await fetchRecording(m.salestrail_call_id);
      if (!rec.ok && rec.status === 404) {
        // No recording for this call — tombstone the row (hidden everywhere;
        // the unique index keeps it from being re-imported).
        await sql`
          UPDATE meetings SET status = 'no_recording', cp_code = ${cpCode}, cp_name = ${cpName}
          WHERE id = ${m.id}
        `;
        return 'no_recording';
      }
      buf = rec.buffer;
      mime = rec.contentType;
      const blob = await put(
        `meetings/salestrail/${m.salestrail_call_id}.${extForAudio(mime)}`,
        buf,
        { access: 'public', contentType: mime, token: process.env.BLOB_READ_WRITE_TOKEN }
      );
      audioUrl = blob.url;
      await sql`
        UPDATE meetings
        SET audio_url = ${audioUrl}, cp_code = ${cpCode}, cp_name = ${cpName}
        WHERE id = ${m.id}
      `;
    }

    // Transcribe + summarize with the engagement question set.
    const transcript = await transcribeWithElevenLabs(buf, mime, process.env.ELEVENLABS_LANGUAGE || '');
    const summary = await summarizeWithClaude(
      transcript.text || '',
      {
        rm_name: null,
        cp_code: cpCode,
        cp_mobile: m.cp_mobile,
        purpose: null,
        duration_seconds: m.duration_seconds || 0,
      },
      'engagement'
    );

    await sql`
      UPDATE meetings
      SET language = ${transcript.language_code || null},
          transcript_text = ${transcript.text || ''},
          transcript_words = ${JSON.stringify(transcript.words || [])}::jsonb,
          summary = ${JSON.stringify(summary)}::jsonb,
          status = 'ready', error_message = NULL
      WHERE id = ${m.id}
    `;
    return 'processed';
  } catch (e) {
    const msg = (e?.message || 'Processing failed').slice(0, 500);
    if (attempts >= MAX_ATTEMPTS) {
      // Out of retries — surface it as a failed meeting for the admin.
      await sql`UPDATE meetings SET status = 'failed', error_message = ${msg} WHERE id = ${m.id}`;
      return 'failed';
    }
    // Leave it 'fetching' — the next run picks it up again.
    await sql`UPDATE meetings SET error_message = ${msg} WHERE id = ${m.id}`;
    return 'retry';
  }
}
