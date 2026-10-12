// One-off backfill: process every meeting stuck in 'processing' (same logic as
// the /api/meetings/process-stuck cron). Run with:
//   node --env-file=.env.local drizzle/process_stuck.js [--dry-run] [--concurrency=3]

import { findStuckMeetings, processMeeting, claimMeeting, markGaveUp, MAX_PROCESS_ATTEMPTS } from '../lib/processMeeting.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const DRY = !!args['dry-run'];
const CONCURRENCY = Math.max(1, parseInt(args.concurrency || '3', 10));

const stuck = await findStuckMeetings({ limit: 1000 });
console.log(`Found ${stuck.length} stuck meetings${DRY ? ' (dry run)' : ''}`);
const queue = [];
for (const m of stuck) {
  if (m.attempts >= MAX_PROCESS_ATTEMPTS) {
    console.log(`  ! ${m.id} — ${m.attempts} attempts, giving up`);
    if (!DRY) await markGaveUp(m);
  } else {
    queue.push(m);
  }
}
if (DRY) {
  for (const m of queue) console.log(`  · ${m.id} ${m.meeting_type} ${m.duration_seconds}s`);
  process.exit(0);
}

let ok = 0;
let failed = 0;
async function worker() {
  while (queue.length) {
    const m = queue.shift();
    if (!(await claimMeeting(m, { source: 'backfill' }))) {
      console.log(`  - ${m.id} already being processed elsewhere, skipped`);
      continue;
    }
    const t0 = Date.now();
    const r = await processMeeting(m, { rmName: m.rm_name || 'Unknown', source: 'backfill', alreadyClaimed: true });
    if (r.ok) ok++;
    else failed++;
    console.log(`  ${r.ok ? '✓' : '✗'} ${m.id} ${m.meeting_type} ${m.duration_seconds}s — ${Date.now() - t0}ms${r.ok ? '' : ' — ' + r.error}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\nDone. ok=${ok} failed=${failed}`);
