import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  findStuckMeetings,
  processMeeting,
  claimMeeting,
  markGaveUp,
  MAX_PROCESS_ATTEMPTS,
} from '@/lib/processMeeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Belt and braces with lib/processMeeting's no-store: never serve this route's
// database reads from the Next.js fetch cache.
export const fetchCache = 'force-no-store';
export const maxDuration = 800;

// Stop picking up new meetings after this long so the run (and the meetings
// in flight) finishes well inside maxDuration and before the next cron tick.
const RUN_BUDGET_MS = 540_000;
const CONCURRENCY = 3;

function isCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

// GET /api/meetings/process-stuck — Vercel Cron (Bearer CRON_SECRET) or an
// admin. Processes meetings stuck in 'processing' because the browser's
// fire-and-forget /process request never reached the server (app closed,
// network drop, WebView killed). Gives up after MAX_PROCESS_ATTEMPTS starts.
export async function GET(request) {
  if (!isCronRequest(request)) {
    const session = await auth();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const stuck = await findStuckMeetings();
  const result = { found: stuck.length, processed: 0, failed: 0, skipped: 0, gave_up: 0, deferred: 0 };

  const queue = [];
  for (const m of stuck) {
    if (m.attempts >= MAX_PROCESS_ATTEMPTS) {
      await markGaveUp(m);
      result.gave_up++;
    } else {
      queue.push(m);
    }
  }

  async function worker() {
    while (queue.length) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) {
        result.deferred += queue.length;
        queue.length = 0;
        return;
      }
      const m = queue.shift();
      // Another run (or the browser trigger) got to it first.
      if (!(await claimMeeting(m, { source: 'sweeper' }))) {
        result.skipped++;
        continue;
      }
      const r = await processMeeting(m, { rmName: m.rm_name || 'Unknown', source: 'sweeper', alreadyClaimed: true });
      if (r.ok) result.processed++;
      else result.failed++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return NextResponse.json({ ok: true, ...result });
}
