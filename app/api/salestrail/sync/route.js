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
export const maxDuration = 800;

const DAY_MS = 86400000;
const BACKFILL_DAYS = 90; // first run reaches this far back
const WINDOW_DAYS = 14; // max createdAt span scanned per Phase-A pass
const OVERLAP_DAYS = 2; // re-scan margin for late-arriving Salestrail records
const MAX_ATTEMPTS = 5; // give up on a call after this many failed fetches
const INSERT_CHUNK = 500; // rows per INSERT (stay under the Postgres param cap)
// Recordings transcribed per batch, in parallel. Each holds an audio buffer in
// memory + one ElevenLabs + one Claude call.
const BATCH = parseInt(process.env.SALESTRAIL_BATCH || '12', 10) || 12;
// One invocation keeps processing batches for up to this long, then self-chains
// a fresh invocation — so a single "Sync now" drains the whole backlog hands-free.
const RUN_BUDGET_MS = 450_000;
// Brief pause between batches so the continuous drain doesn't saturate Vercel
// Blob's per-store ops-per-second budget — leaves headroom for live uploads
// from RMs recording meetings in the app.
const INTER_BATCH_MS = 1500;

function isCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

// GET — Vercel Cron, or the self-chain (both carry Bearer CRON_SECRET), or an
// admin hitting the URL directly.
export async function GET(request) {
  if (!isCronRequest(request)) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return runSync(request);
}

// POST — the admin Call-sync page.
//   { action: 'pause' }  → stop the continuous drain
//   { rescanDays: 30|90 }→ rewind the cursor, then run
//   (anything else)      → resume (unpause) + run
export async function POST(request) {
  const session = await auth();
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body = {};
  try { body = await request.json(); } catch {}

  const sql = neon(process.env.DATABASE_URL);
  await sql`INSERT INTO salestrail_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  if (body?.action === 'pause') {
    await sql`UPDATE salestrail_sync_state SET paused = true WHERE id = 1`;
    return NextResponse.json({ ok: true, paused: true });
  }

  // Any other manual trigger clears the pause flag.
  await sql`UPDATE salestrail_sync_state SET paused = false WHERE id = 1`;
  if ([30, 90].includes(body?.rescanDays)) {
    await sql`
      UPDATE salestrail_sync_state
      SET cursor_at = now() - (${String(body.rescanDays)} || ' days')::interval
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
  await sql`INSERT INTO salestrail_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  // Atomic compare-and-set lock: claim the run only if not paused and not
  // already running (a lock older than 15 min is treated as stale/crashed).
  const [lock] = await sql`
    UPDATE salestrail_sync_state
    SET in_progress = true, last_run_at = now()
    WHERE id = 1
      AND paused = false
      AND (in_progress = false OR last_run_at < now() - interval '15 minutes')
    RETURNING cursor_at
  `;
  if (!lock) {
    const [s] = await sql`SELECT paused FROM salestrail_sync_state WHERE id = 1`;
    return NextResponse.json({
      skipped: true,
      reason: s?.paused ? 'Sync is paused' : 'A sync run is already in progress',
    });
  }

  const startedAt = Date.now();
  const result = {
    scanned: 0, off_day: 0, no_rm: 0, imported: 0,
    processed: 0, no_recording: 0, failed: 0, retry: 0,
    batches: 0, pending: 0, caught_up: false, window: null,
  };
  let caughtUp = false;
  let cursorMs = lock.cursor_at ? new Date(lock.cursor_at).getTime() : null;

  try {
    // Drain batches until the time budget runs out or there is nothing left.
    while (Date.now() - startedAt < RUN_BUDGET_MS) {
      // Phase A — scan one createdAt window, until the cursor catches up.
      if (!caughtUp) {
        const now = Date.now();
        const startMs = cursorMs == null ? now - BACKFILL_DAYS * DAY_MS : cursorMs;
        const from = new Date(Math.max(0, startMs - OVERLAP_DAYS * DAY_MS));
        const to = new Date(Math.min(now, startMs + WINDOW_DAYS * DAY_MS));
        await scanWindow(sql, from, to, result);
        cursorMs = to.getTime();
        result.window = { from: from.toISOString(), to: to.toISOString() };
        await sql`UPDATE salestrail_sync_state SET cursor_at = ${to.toISOString()} WHERE id = 1`;
        if (to.getTime() >= now - 60_000) caughtUp = true;
      }

      // Phase B — fetch + transcribe one batch of queued recordings.
      const picked = await processBatch(sql, result);
      result.batches++;

      // Nothing left to scan and nothing left to process → done.
      if (caughtUp && picked === 0) break;

      // Brief pause so concurrent browser uploads can use the blob store too.
      if (picked > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_MS));
    }

    const [pend] = await sql`
      SELECT count(*)::int AS n FROM meetings
      WHERE status = 'fetching' AND salestrail_call_id IS NOT NULL
        AND salestrail_fetch_attempts < ${MAX_ATTEMPTS}
    `;
    result.pending = pend?.n || 0;
    result.caught_up = caughtUp;
    const moreWork = !caughtUp || result.pending > 0;

    await sql`
      UPDATE salestrail_sync_state
      SET in_progress = false, last_run_at = now(), last_result = ${JSON.stringify(result)}::jsonb
      WHERE id = 1
    `;
    logActivity({ eventType: 'salestrail.sync', payload: result, request });

    // Self-chain: kick a fresh invocation so the backlog keeps draining
    // hands-free until the queue is empty.
    if (moreWork) await chainNextRun(request, sql);

    return NextResponse.json({ ok: true, ...result, chained: moreWork });
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

// Kicks the next invocation. The 5s window guarantees the request is delivered;
// the child runs independently (Vercel doesn't kill a function when its caller
// disconnects). Needs CRON_SECRET so the child's GET authorizes itself.
async function chainNextRun(request, sql) {
  const [s] = await sql`SELECT paused FROM salestrail_sync_state WHERE id = 1`;
  if (s?.paused || !process.env.CRON_SECRET) return;
  try {
    const origin = new URL(request.url).origin;
    await fetch(`${origin}/api/salestrail/sync`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Expected — the child won't respond within 5s, but it is now running.
  }
}

// Phase A — pull one createdAt window of call metadata and insert "fetching"
// rows for new Monday/Friday calls made by known regular RMs.
async function scanWindow(sql, from, to, result) {
  const calls = await listCallsByCreated(from, to);
  result.scanned += calls.length;

  const onDay = calls.filter((c) => isSyncWeekday(c.startTime));
  result.off_day += calls.length - onDay.length;
  if (onDay.length === 0) return;

  // Resolve userEmail → rm_id. direct_rm users are excluded — Salestrail sync
  // is for regular RMs only.
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

  // onConflictDoNothing keeps the overlap re-scan idempotent.
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const inserted = await db
      .insert(meetings)
      .values(rows.slice(i, i + INSERT_CHUNK))
      .onConflictDoNothing()
      .returning({ id: meetings.id });
    result.imported += inserted.length;
  }
}

// Phase B — fetch + transcribe one batch. Returns how many rows were picked.
async function processBatch(sql, result) {
  const pending = await sql`
    SELECT id, salestrail_call_id, cp_mobile, audio_url, duration_seconds
    FROM meetings
    WHERE status = 'fetching' AND salestrail_call_id IS NOT NULL
      AND salestrail_fetch_attempts < ${MAX_ATTEMPTS}
    ORDER BY salestrail_fetch_attempts ASC, created_at ASC
    LIMIT ${BATCH}
  `;
  if (pending.length === 0) return 0;

  const outcomes = await Promise.allSettled(pending.map((m) => processOne(sql, m)));
  for (const o of outcomes) {
    const v = o.status === 'fulfilled' ? o.value : 'failed';
    if (v === 'processed') result.processed++;
    else if (v === 'no_recording') result.no_recording++;
    else if (v === 'failed') result.failed++;
    else result.retry++;
  }
  return pending.length;
}

// Resolves one queued meeting: CP lookup → recording fetch → re-host on Blob →
// transcribe → summarize. Returns 'processed' | 'no_recording' | 'failed' |
// 'retry'. Never throws.
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
      await sql`UPDATE meetings SET status = 'failed', error_message = ${msg} WHERE id = ${m.id}`;
      return 'failed';
    }
    await sql`UPDATE meetings SET error_message = ${msg} WHERE id = ${m.id}`;
    return 'retry';
  }
}
