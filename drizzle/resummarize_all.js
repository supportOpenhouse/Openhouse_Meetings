// Bulk-regenerate every meeting summary against the current question sets +
// scoring rubric. Useful after changing the question lists or the scoring
// logic. Reads the saved transcript_text — no re-transcription happens.
//
// Run with:
//   npm run db:resummarize-all
//
// Flags:
//   --legacy-only   only meetings whose summary is the old flat shape
//   --since=YYYY-MM-DD   only meetings started on/after this date
//   --type=call     only meetings of this meeting_type (call|engagement|visit|onboarding)
//   --limit=N       safety cap (default 1000)
//   --concurrency=N  parallel Claude calls (default 3)
//   --dry-run       fetch + log, don't write or call Claude

import { neon } from '@neondatabase/serverless';
import { summarizeMeeting } from '../lib/claude.js';

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

const LEGACY_ONLY = !!args['legacy-only'];
const SINCE = args.since ? new Date(args.since) : null;
const TYPE = args.type ? String(args.type) : null;
const LIMIT = parseInt(args.limit || '1000', 10);
const CONCURRENCY = Math.max(1, parseInt(args.concurrency || '3', 10));
const DRY = !!args['dry-run'];

const sql = neon(process.env.DATABASE_URL);

function isLegacyShape(summary) {
  if (!summary) return true;
  return !(summary.engagement || summary.visit || summary.score);
}

async function pickMeetings() {
  const sinceClause = SINCE ? sql`AND m.started_at >= ${SINCE.toISOString()}` : sql``;
  // We can't conditionally splice SQL with the neon HTTP driver cleanly, so
  // branch in JS.
  const rows = SINCE
    ? await sql`
        SELECT m.id, m.cp_code, m.cp_mobile, m.purpose, m.duration_seconds,
               m.transcript_text, m.summary, m.meeting_type, u.name AS rm_name
        FROM meetings m
        LEFT JOIN users u ON u.id = m.rm_id
        WHERE m.status = 'ready'
          AND m.transcript_text IS NOT NULL
          AND length(m.transcript_text) > 0
          AND m.started_at >= ${SINCE.toISOString()}
        ORDER BY m.started_at DESC
        LIMIT ${LIMIT}
      `
    : await sql`
        SELECT m.id, m.cp_code, m.cp_mobile, m.purpose, m.duration_seconds,
               m.transcript_text, m.summary, m.meeting_type, u.name AS rm_name
        FROM meetings m
        LEFT JOIN users u ON u.id = m.rm_id
        WHERE m.status = 'ready'
          AND m.transcript_text IS NOT NULL
          AND length(m.transcript_text) > 0
        ORDER BY m.started_at DESC
        LIMIT ${LIMIT}
      `;
  let result = LEGACY_ONLY ? rows.filter((r) => isLegacyShape(r.summary)) : rows;
  if (TYPE) result = result.filter((r) => (r.meeting_type || 'engagement') === TYPE);
  return result;
}

async function runOne(m) {
  if (DRY) {
    // True dry-run: don't bother Claude, just report what WOULD be processed.
    const transcriptLen = (m.transcript_text || '').length;
    return { ms: 0, score: '—', classification: 'dry', transcriptLen };
  }
  const started = Date.now();
  const summary = await summarizeMeeting(
    m.transcript_text,
    {
      rm_name: m.rm_name || 'Unknown',
      cp_code: m.cp_code,
      cp_mobile: m.cp_mobile,
      purpose: m.purpose,
      duration_seconds: m.duration_seconds,
    },
    m.meeting_type || 'engagement'
  );
  await sql`UPDATE meetings SET summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${m.id}`;
  const ms = Date.now() - started;
  const label = summary.score
    ? `${summary.score.classification} ${summary.score.total}/100`
    : summary.meeting_type || 'done';
  return { ms, label };
}

async function run() {
  const meetings = await pickMeetings();
  console.log(`Found ${meetings.length} meetings to re-summarize`);
  console.log(`Mode: ${LEGACY_ONLY ? 'legacy-only' : 'all-ready'}, type=${TYPE || 'all'}, since=${SINCE ? SINCE.toISOString().slice(0, 10) : 'all'}, concurrency=${CONCURRENCY}, dryRun=${DRY}`);
  if (meetings.length === 0) return;

  let done = 0;
  let failed = 0;
  let inFlight = 0;
  let cursor = 0;

  await new Promise((resolve) => {
    function pump() {
      while (inFlight < CONCURRENCY && cursor < meetings.length) {
        const m = meetings[cursor++];
        inFlight++;
        runOne(m)
          .then((r) => {
            done++;
            if (DRY) {
              console.log(`  · ${m.id} (${m.cp_code}) — would process (${r.transcriptLen} chars)  [${done}/${meetings.length}]`);
            } else {
              console.log(`  ✓ ${m.id} (${m.cp_code || m.cp_mobile || '—'}) — ${r.ms}ms — ${r.label}  [${done}/${meetings.length}]`);
            }
          })
          .catch((e) => {
            failed++;
            console.error(`  ✗ ${m.id} (${m.cp_code}) — ${e?.message || e}`);
          })
          .finally(() => {
            inFlight--;
            if (cursor >= meetings.length && inFlight === 0) resolve();
            else pump();
          });
      }
    }
    pump();
  });

  console.log(`\nDone. ok=${done} failed=${failed}${DRY ? ' (dry run, no writes)' : ''}`);
}

run().catch((e) => {
  console.error('Bulk resummarize failed:', e);
  process.exit(1);
});
