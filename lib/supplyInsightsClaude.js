// Supply "Ask anything" — Claude over the structured summaries + verbatim
// transcripts of channel-partner field visits. Mirrors the demand
// answerCustomQuestion path, scoped to sales_visits.
import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_VISITS = 120;
const MAX_TX = 6000;

export function isSupplyAiConfigured() {
  return !!anthropic;
}

function sinceISO(periodDays, opts) {
  if (opts?.since) return new Date(opts.since).toISOString();
  if (!periodDays || periodDays <= 0) return null;
  return new Date(Date.now() - periodDays * 86400000).toISOString();
}

async function loadCorpus(periodDays, opts = {}) {
  const since = sinceISO(periodDays, opts);
  const until = opts.until ? new Date(opts.until).toISOString() : null;
  const rmId = opts.rmId || null;
  const rows = await sql`
    SELECT id, cp_name, check_in_time, meeting_outcome, summary, transcript_text
    FROM sales_visits
    WHERE status = 'ready' AND summary IS NOT NULL
      AND (${since}::timestamptz IS NULL OR check_in_time >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR check_in_time <= ${until}::timestamptz)
      AND (${rmId}::uuid IS NULL OR sales_rm_id = ${rmId}::uuid)
    ORDER BY check_in_time DESC LIMIT ${MAX_VISITS}
  `;
  const refMap = {};
  const list = rows.map((r, i) => {
    const ref = i + 1;
    refMap[ref] = r.id;
    return {
      ref,
      cp: r.cp_name,
      date: r.check_in_time,
      outcome: r.meeting_outcome,
      data: r.summary,
      transcript: (r.transcript_text || '').slice(0, MAX_TX),
    };
  });
  return { list, refMap };
}

function extractJson(text) {
  const m = (text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function answerSupplyQuestion(question, periodDays = 90, opts = {}) {
  if (!anthropic) throw new Error('AI is not configured (ANTHROPIC_API_KEY missing).');
  const { list, refMap } = await loadCorpus(periodDays, opts);
  if (!list.length) {
    return {
      visitCount: 0,
      result: { headline: 'No data', narrative: 'No supply visits in scope to answer this.', items: [] },
    };
  }

  const prompt = `You are a field-sales analyst for Openhouse (an Indian real-estate platform). A supply manager asks:

"${question}"

DATA: ${list.length} channel-partner field visits below as JSON lines. Each has:
  - "ref": numeric id for citing (use these in refs arrays)
  - "cp": partner name, "date", "outcome"
  - "data": the structured AI summary (cp_sentiment, onboarding_stage, key_points, cp_needs, objections, commitments, competitive_intel, inventory_discussion)
  - "transcript": verbatim visit transcript (may be truncated)

How to answer well:
- Base every claim ONLY on the data below. Don't pad with generalities.
- For any specific term/name (society, competitor, platform, phrase), search the verbatim "transcript" of every visit — the structured "data" misses most named entities. Match case/spacing/punctuation-insensitively.
- For "how many" questions, count every matching visit and cite the ref of EACH.
- If the data is sparse, say so in the narrative.

Return ONLY JSON of this exact shape:
{
  "headline": "one-sentence answer",
  "narrative": "2-4 sentences grounded in the data",
  "items": [ { "title": "short label", "value": "the finding or count", "refs": [1,5,9] } ]
}

DATA (${list.length} visits, JSON lines):
${list.map((c) => JSON.stringify(c)).join('\n')}`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('');
  const result = extractJson(text) || {
    headline: 'Could not parse the answer',
    narrative: text.slice(0, 600),
    items: [],
  };
  if (Array.isArray(result.items)) {
    for (const it of result.items) {
      it.visitIds = Array.isArray(it.refs) ? it.refs.map((r) => refMap[r]).filter(Boolean) : [];
    }
  }
  return { visitCount: list.length, result };
}
