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
//   --exclude-type=call  skip meetings of this meeting_type
//   --max-duration=N only meetings this many seconds or shorter (e.g. the
//                    content-free calls that were fabricated: --max-duration=60)
//   --limit=N       safety cap (default 1000)
//   --concurrency=N  parallel Claude calls (default 3)
//   --dry-run       fetch + log, don't write or call Claude

import { neon } from '@neondatabase/serverless';
import { summarizeMeeting } from '../lib/claude.js';
import { usageTotals } from '../lib/anthropicRequest.js';

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
const EXCLUDE_TYPE = args['exclude-type'] ? String(args['exclude-type']) : null;
const MAX_DURATION = args['max-duration'] != null ? parseInt(args['max-duration'], 10) : null;
const LIMIT = parseInt(args.limit || '1000', 10);
const CONCURRENCY = Math.max(1, parseInt(args.concurrency || '3', 10));
const DRY = !!args['dry-run'];

const sql = neon(process.env.DATABASE_URL);


async function pickMeetings() {
  // All filters pushed into SQL (NULL-guard pattern) so LIMIT applies to the
  // filtered set — e.g. --type=call gets N *calls*, not N recent meetings.
  const since = SINCE ? SINCE.toISOString() : null;
  const type = TYPE || null;
  const maxDur = Number.isFinite(MAX_DURATION) ? MAX_DURATION : null;
  // Transcripts are NOT selected here — thousands of them exceed Neon's 64 MB
  // response cap. runOne loads each meeting's transcript when it's processed.
  const rows = await sql`
    SELECT m.id, m.cp_code, m.cp_mobile, m.purpose, m.duration_seconds,
           m.meeting_type, u.name AS rm_name,
           (m.summary IS NULL OR NOT (m.summary ? 'engagement' OR m.summary ? 'visit' OR m.summary ? 'score')) AS is_legacy
    FROM meetings m
    LEFT JOIN users u ON u.id = m.rm_id
    WHERE m.status = 'ready'
      AND m.transcript_text IS NOT NULL
      AND length(m.transcript_text) > 0
      AND (${since}::timestamptz IS NULL OR m.started_at >= ${since}::timestamptz)
      AND (${type}::text IS NULL OR coalesce(m.meeting_type, 'engagement') = ${type}::text)
      AND (${EXCLUDE_TYPE}::text IS NULL OR coalesce(m.meeting_type, 'engagement') <> ${EXCLUDE_TYPE}::text)
      AND (${maxDur}::int IS NULL OR m.duration_seconds <= ${maxDur}::int)
    ORDER BY m.started_at DESC
    LIMIT ${LIMIT}
  `;
  return LEGACY_ONLY ? rows.filter((r) => r.is_legacy) : rows;
}

async function runOne(m) {
  const [{ transcript_text: transcript }] = await sql`SELECT transcript_text FROM meetings WHERE id = ${m.id}`;
  if (DRY) {
    // True dry-run: don't bother Claude, just report what WOULD be processed.
    return { ms: 0, score: '—', classification: 'dry', transcriptLen: (transcript || '').length };
  }
  const started = Date.now();
  const summary = await summarizeMeeting(
    transcript,
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
  if (usageTotals.calls) {
    // Sonnet 5.5 list price: $2 / MTok input, $10 / MTok output.
    const cost = (usageTotals.input * 2 + usageTotals.output * 10) / 1e6;
    console.log(`Tokens: ${usageTotals.input} in / ${usageTotals.output} out over ${usageTotals.calls} calls ≈ $${cost.toFixed(2)}`);
  }
}

run().catch((e) => {
  console.error('Bulk resummarize failed:', e);
  process.exit(1);
});
