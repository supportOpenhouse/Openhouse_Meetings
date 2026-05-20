// Use Claude to retro-classify each ready meeting as engagement or visit,
// based on its saved transcript. If a meeting's CURRENT type doesn't match
// the classification, this script:
//   1. flips meeting_type to the classifier's verdict
//   2. re-runs the appropriate summarizer so the saved summary matches
//
// Run with:
//   npm run db:reclassify-legacy
//
// Flags:
//   --dry-run        classify only; don't write or re-summarize
//   --limit=N        cap (default 500)
//   --concurrency=N  parallel Claude calls (default 3)
//   --since=YYYY-MM-DD  restrict to meetings started on/after this date
//
// Cost note: each row costs one tiny classify call (~$0.001) plus, if it
// needs reclassifying, one full summarize call (~$0.02-0.04). For 50 legacy
// meetings the worst case is < $2.

import { neon } from '@neondatabase/serverless';
import { classifyMeetingType, summarizeMeeting } from '../lib/claude.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not set');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (!a.startsWith('--')) return [a, true];
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  })
);

const DRY = !!args['dry-run'];
const LIMIT = parseInt(args.limit || '500', 10);
const CONCURRENCY = Math.max(1, parseInt(args.concurrency || '3', 10));
const SINCE = args.since ? new Date(args.since) : null;

const sql = neon(process.env.DATABASE_URL);

async function pickRows() {
  return SINCE
    ? sql`
        SELECT m.id, m.cp_code, m.cp_mobile, m.purpose, m.duration_seconds,
               m.transcript_text, m.summary, m.meeting_type, u.name AS rm_name
        FROM meetings m LEFT JOIN users u ON u.id = m.rm_id
        WHERE m.status = 'ready'
          AND m.transcript_text IS NOT NULL AND length(m.transcript_text) > 0
          AND m.started_at >= ${SINCE.toISOString()}
        ORDER BY m.started_at DESC
        LIMIT ${LIMIT}
      `
    : sql`
        SELECT m.id, m.cp_code, m.cp_mobile, m.purpose, m.duration_seconds,
               m.transcript_text, m.summary, m.meeting_type, u.name AS rm_name
        FROM meetings m LEFT JOIN users u ON u.id = m.rm_id
        WHERE m.status = 'ready'
          AND m.transcript_text IS NOT NULL AND length(m.transcript_text) > 0
        ORDER BY m.started_at DESC
        LIMIT ${LIMIT}
      `;
}

async function processOne(m) {
  const verdict = await classifyMeetingType(m.transcript_text, {
    rm_name: m.rm_name || 'Unknown',
    cp_code: m.cp_code,
    cp_mobile: m.cp_mobile,
    purpose: m.purpose,
  });
  const current = m.meeting_type || 'engagement';
  const changed = verdict !== current;

  if (!changed) return { verdict, changed, summarized: false };
  if (DRY) return { verdict, changed, summarized: false };

  // Reclassified — rebuild the summary against the right question set.
  const summary = await summarizeMeeting(m.transcript_text, {
    rm_name: m.rm_name || 'Unknown',
    cp_code: m.cp_code,
    cp_mobile: m.cp_mobile,
    purpose: m.purpose,
    duration_seconds: m.duration_seconds,
  }, verdict);

  await sql`
    UPDATE meetings
    SET meeting_type = ${verdict},
        summary = ${JSON.stringify(summary)}::jsonb
    WHERE id = ${m.id}
  `;
  return { verdict, changed, summarized: true };
}

async function run() {
  const rows = await pickRows();
  console.log(`Found ${rows.length} ready meetings with transcripts (limit=${LIMIT}, since=${SINCE ? SINCE.toISOString().slice(0,10) : 'all'}, concurrency=${CONCURRENCY}, dryRun=${DRY})`);
  if (rows.length === 0) return;

  let inFlight = 0;
  let cursor = 0;
  let ok = 0;
  let failed = 0;
  let flipped = 0;
  let resummarized = 0;
  const tallies = { engagement: 0, visit: 0 };

  await new Promise((resolve) => {
    function pump() {
      while (inFlight < CONCURRENCY && cursor < rows.length) {
        const m = rows[cursor++];
        inFlight++;
        processOne(m)
          .then((r) => {
            ok++;
            tallies[r.verdict]++;
            if (r.changed) flipped++;
            if (r.summarized) resummarized++;
            const tag = r.changed ? `→ ${r.verdict}` : `(${r.verdict}, no change)`;
            console.log(`  ${r.changed ? '↻' : '·'} ${m.id}  ${(m.cp_code || '').padEnd(10)}  ${(m.meeting_type || 'engagement').padEnd(10)} ${tag}  [${ok + failed}/${rows.length}]`);
          })
          .catch((e) => {
            failed++;
            console.error(`  ✗ ${m.id} (${m.cp_code}) — ${e?.message || e}`);
          })
          .finally(() => {
            inFlight--;
            if (cursor >= rows.length && inFlight === 0) resolve();
            else pump();
          });
      }
    }
    pump();
  });

  console.log(`\nDone. classified=${ok} failed=${failed} flipped=${flipped} resummarized=${resummarized}${DRY ? ' (dry run, no writes)' : ''}`);
  console.log(`Verdict distribution: engagement=${tallies.engagement}, visit=${tallies.visit}`);
}

run().catch((e) => {
  console.error('Reclassify failed:', e);
  process.exit(1);
});
