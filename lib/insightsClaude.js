// Tier 2 analytics — Claude synthesis over the structured `summary` JSON of
// many meetings at once. Reads ONLY data already in Postgres; ElevenLabs is
// never called. Costs a few cents per run (compact summaries, not transcripts)
// and every result is cached in the `insights` table by the API layer.

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Cap the corpus so a single Claude call stays well within context + cheap.
// Summary-only insights (the cached cards): up to 280 meetings — short JSON
// per meeting, tokens stay bounded.
const MAX_MEETINGS = 280;
// Ask-anything pulls full transcript text per meeting so keyword/quote
// questions ("how many mentions of 99acres") actually find matches. That
// costs roughly 10x more tokens per meeting, so we cap the corpus tighter.
const MAX_MEETINGS_WITH_TRANSCRIPTS = 100;
// Hard cap per-meeting transcript size so a handful of pathological 90-min
// recordings can't blow the context budget. ~6000 chars ≈ 1500 tokens ≈
// ~12 minutes of dense speech — enough to catch most keyword mentions.
const MAX_TRANSCRIPT_CHARS = 6000;

let _client;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// The standard, pre-defined insights. Each is one Claude call over the corpus
// of one meeting type (or a mix, for cross-cut).
export const STANDARD_INSIGHTS = {
  visit_societies: {
    scope: 'visit',
    corpus: 'visit',
    title: 'Top societies buyers want',
    task: 'Rank the residential societies/projects buyers are most interested in. Pull from societies_of_interest, most_liked_society and societies_explored. For each, give an approximate mention count and a one-line note on why buyers like or compare it.',
  },
  visit_config_budget: {
    scope: 'visit',
    corpus: 'visit',
    title: 'Configuration & budget demand',
    task: 'Summarise demand by BHK configuration and by budget band. Bucket the configuration field (2/3/4 BHK / penthouse) and the budget_range field into clear bands, each with an approximate count.',
  },
  visit_blockers: {
    scope: 'visit',
    corpus: 'visit',
    title: 'Why buyers are not closing',
    task: 'Identify the recurring reasons buyers have not closed. Pull from stopping_factor, objections and budget_flexibility. Rank the blockers, each with an approximate count and a concrete suggestion to address it.',
  },
  visit_objections: {
    scope: 'visit',
    corpus: 'visit',
    title: 'Top objections during visits',
    task: 'Cluster the objections and concerns raised during site visits into themes. Rank by frequency with an approximate count and a one-line note each.',
  },
  negotiation_blockers: {
    scope: 'negotiation',
    corpus: 'negotiation',
    title: 'What blocks deals from closing',
    task: 'Identify the recurring reasons negotiations stall or fail to close. Pull from main_blocker, objections, price_discussion and decision_makers. Rank the blockers, each with an approximate count and a concrete way for the RM to overcome it.',
  },
  negotiation_concessions: {
    scope: 'negotiation',
    corpus: 'negotiation',
    title: 'Concessions buyers push for',
    task: 'Cluster the concessions buyers request and the concessions RMs offer (from concessions_requested and concessions_offered) into themes. Rank by frequency with an approximate count and a one-line note on which ones actually move deals toward closing.',
  },
  engagement_cp_issues: {
    scope: 'engagement',
    corpus: 'engagement',
    title: 'Issues CPs raise about Openhouse',
    task: 'Identify the recurring complaints, friction points and issues channel partners raise about working with Openhouse (payouts, inventory, pricing, support, process). Cluster into themes ranked by frequency, each with an approximate count and a concrete fix.',
  },
  engagement_cp_asks: {
    scope: 'engagement',
    corpus: 'engagement',
    title: 'What CPs are asking for',
    task: 'Summarise what channel partners are requesting or need — from cp_requirements, key_topics and commitments. Rank the recurring asks with approximate counts.',
  },
  onboarding_objections: {
    scope: 'onboarding',
    corpus: 'onboarding',
    title: 'Objections that block onboarding',
    task: 'Identify the recurring objections prospective CPs raise that prevent them onboarding. Rank by frequency with an approximate count and a suggested counter for each.',
  },
  onboarding_competitors: {
    scope: 'onboarding',
    corpus: 'onboarding',
    title: 'Competitors prospective CPs already use',
    task: 'List the competing platforms / developers / channels prospective CPs already work with. Rank by mention count and note for each whether Openhouse tends to win or lose against it.',
  },
  direct_demand: {
    scope: 'direct',
    corpus: 'call',
    title: 'What buyers want',
    task: 'Summarise what home buyers want from these phone calls — budget bands, BHK configuration, location priorities and any societies/areas named. Rank each dimension with approximate counts.',
  },
  direct_blockers: {
    scope: 'direct',
    corpus: 'call',
    title: "Why buyers aren't booking",
    task: 'Identify the recurring reasons buyers have not booked — pull from booking_blocker and frustrations. Rank the blockers with an approximate count and a concrete way the sales rep can address each.',
  },
  direct_pipeline: {
    scope: 'direct',
    corpus: 'call',
    title: 'Hot-buyer pipeline read',
    task: 'Assess the buyers most likely to convert soon. How many show strong intent (hot/warm sentiment, "ready to book", near-term move-in timeline), what do they have in common (budget, configuration, timeline), and the single best next step to convert them.',
  },
  direct_awareness: {
    scope: 'direct',
    corpus: 'call',
    title: 'Affordable-housing awareness gaps',
    task: 'Assess how well buyers understand Haryana affordable housing and the draw-of-lots process (from affordable_housing_familiarity and frustrations). Identify what buyers are confused or worried about and where reps should educate them, ranked by how often it comes up.',
  },
  cross_growth: {
    scope: 'cross_cut',
    corpus: 'all',
    title: 'How to increase visits & buyers',
    task: 'Acting as a growth advisor for Openhouse, synthesise across all meeting types the highest-leverage actions to (a) increase CP-driven client visits and (b) move more buyers into negotiation. Be specific and prioritised.',
  },
  cross_pipeline: {
    scope: 'cross_cut',
    corpus: 'visit',
    title: 'Immediate-buyer pipeline read',
    task: 'Assess the pipeline of buyers likely to close soon. Identify how many buyers show immediate / near-term closure intent, what they have in common (society, budget, configuration), and what would most help convert them.',
  },
};

// Loads a compact corpus for Claude. Each meeting gets a short numeric `ref`
// the LLM can cite (cheaper + safer than full UUIDs); refMap translates those
// refs back to real meeting ids so each insight item can link to its source
// recordings. Returns { list, refMap }.
//
// opts:
//   since/until → custom date window (overrides periodDays)
//   rmId        → filter to meetings made BY that RM (admin "RM filter")
//   cpCodes     → filter to meetings WITH those CP codes (RM cross-cut path)
async function loadCorpus(corpusType, periodDays, opts = {}) {
  const typeFilter =
    corpusType === 'all' ? ['visit', 'engagement', 'onboarding', 'negotiation'] : [corpusType];

  const cpCodes = opts.cpCodes;
  const scoped = Array.isArray(cpCodes);
  if (scoped && cpCodes.length === 0) return { list: [], refMap: {} };

  let since = null;
  if (opts.since) since = new Date(opts.since).toISOString();
  else if (periodDays > 0) since = new Date(Date.now() - periodDays * 86400000).toISOString();
  const until = opts.until ? new Date(opts.until).toISOString() : null;
  const rmId = opts.rmId || null;
  const cpCodesArr = scoped ? cpCodes : null;
  const withTranscripts = !!opts.includeTranscripts;
  const limit = withTranscripts ? MAX_MEETINGS_WITH_TRANSCRIPTS : MAX_MEETINGS;

  // Single query with NULL-param guards across every filter dimension. We
  // always include transcript_text in the projection now; the request flag
  // decides whether to attach it to the Claude payload — the SELECT cost is
  // negligible compared to the round-trip.
  const rows = await sql`
    SELECT id, meeting_type, cp_code, cp_name, started_at, summary, transcript_text
    FROM meetings
    WHERE meeting_type = ANY(${typeFilter}) AND status = 'ready' AND summary IS NOT NULL
      AND (${since}::timestamptz IS NULL OR started_at >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR started_at <= ${until}::timestamptz)
      AND (${rmId}::uuid IS NULL OR rm_id = ${rmId}::uuid)
      AND (${cpCodesArr}::text[] IS NULL OR cp_code = ANY(${cpCodesArr}::text[]))
    ORDER BY started_at DESC LIMIT ${limit}
  `;

  // Total-size budget: the per-meeting count/transcript caps don't bound the
  // whole prompt (summary sizes vary a lot), so accumulate serialized size and
  // stop before the corpus could push the prompt past the 200k context window.
  // The Hindi/Hinglish transcripts tokenize densely (~2.2 chars/token observed),
  // so 300k chars ≈ 135k tokens — comfortably under 200k with the instructions
  // + response accounted for.
  const CORPUS_CHAR_BUDGET = 300000;
  const refMap = {};
  const list = [];
  let used = 0;
  for (const m of rows) {
    const ref = list.length + 1;
    const s = m.summary || {};
    const body = s.visit || s.engagement || s.onboarding || s.call || s.negotiation || s;
    const entry = {
      ref,
      type: m.meeting_type,
      cp: m.cp_code || m.cp_name || null,
      date: m.started_at ? new Date(m.started_at).toISOString().slice(0, 10) : null,
      data: body,
      score: s.score ? { total: s.score.total, classification: s.score.classification } : undefined,
    };
    if (withTranscripts && m.transcript_text) {
      // Strip excess whitespace and clip to the configured budget. Truncation
      // is per-meeting so one outlier 90-min recording can't crowd out the
      // tail of the corpus.
      const t = String(m.transcript_text).replace(/\s+/g, ' ').trim();
      entry.transcript = t.length > MAX_TRANSCRIPT_CHARS
        ? t.slice(0, MAX_TRANSCRIPT_CHARS) + '… [transcript truncated]'
        : t;
    }
    const size = JSON.stringify(entry).length;
    if (list.length > 0 && used + size > CORPUS_CHAR_BUDGET) break; // keep the most-recent within budget
    used += size;
    refMap[ref] = m.id;
    list.push(entry);
  }
  return { list, refMap };
}

// Translates the `refs` Claude attached to each item into real meeting ids,
// so the dashboard can let admins open & listen to the source recordings.
function attachMeetingIds(result, refMap) {
  if (!result || !Array.isArray(result.items)) return;
  for (const it of result.items) {
    const refs = Array.isArray(it.refs) ? it.refs : [];
    it.meeting_ids = [...new Set(refs.map((r) => refMap[r]).filter(Boolean))];
    delete it.refs;
  }
}

function parseJson(msg) {
  let text = msg.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];
  return JSON.parse(text);
}

const RESULT_SHAPE = `Use the submit_insight tool to return the answer. Set:
- "headline" to one punchy sentence — the single most important takeaway.
- "items" to a ranked list (most important first), up to 12 entries. Each item has a short label, a value (count or metric e.g. "23 mentions"), a one-line note, and refs.
- "refs" MUST contain the real numeric "ref" values from the DATA below — never invent them. Every item that represents a theme/cluster must list the meetings behind it (most relevant first, up to 25).
- "narrative" to 2-4 sentences of analysis a founder can act on.
Use an empty items array only if a list genuinely doesn't apply.`;

// Tool-use schema is the load-bearing piece here: it forces Claude to return
// the exact structure rather than free-text JSON we have to regex out of a
// blob. parseJson stays around as a fallback for the unlikely edge case where
// the model emits a text block alongside (or instead of) the tool call.
const INSIGHT_TOOL = {
  name: 'submit_insight',
  description: 'Return the structured insight result for the admin dashboard.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'One punchy sentence — the single most important takeaway.',
      },
      items: {
        type: 'array',
        description: 'Ranked list of supporting findings, up to 12 entries (most important first).',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short name for the finding.' },
            value: { type: 'string', description: 'Count or metric, e.g. "23 mentions".' },
            note: { type: 'string', description: 'One concrete line of context.' },
            refs: {
              type: 'array',
              description: 'Numeric ref values from DATA that support THIS item (real refs only, never invent).',
              items: { type: 'number' },
            },
          },
          required: ['label', 'value', 'note', 'refs'],
        },
      },
      narrative: {
        type: 'string',
        description: '2-4 sentences of analysis a founder can act on.',
      },
    },
    required: ['headline', 'items', 'narrative'],
  },
};

async function runClaude(prompt) {
  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    // Generous budget: the tool_use response can be long when many refs need
    // to be cited (e.g. "list every meeting where X was mentioned"). 4000 is
    // ~3000 words of text but the tool output is dense JSON, so usually plenty.
    max_tokens: 4000,
    tools: [INSIGHT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_insight' },
    messages: [{ role: 'user', content: prompt }],
  });
  const toolUse = msg.content.find((c) => c.type === 'tool_use' && c.name === 'submit_insight');
  if (toolUse?.input) return toolUse.input;
  // Fallback: model returned a text block instead of (or alongside) the tool
  // call. parseJson tolerates the usual markdown-wrapped JSON.
  try {
    return parseJson(msg);
  } catch (e) {
    throw new Error('Claude did not return a valid insight (no tool call and no parseable text).');
  }
}

// Generates one standard insight. Returns { result, meetingCount }.
// opts:
//   since/until      → custom date window
//   rmId             → admin "filter by meeting RM"
//   assignedToRmId   → RM cross-cut path (scope to that RM's assigned CPs)
export async function generateStandardInsight(insightKey, periodDays = 90, opts = {}) {
  const def = STANDARD_INSIGHTS[insightKey];
  if (!def) throw new Error(`Unknown insight: ${insightKey}`);

  let cpCodes = null;
  if (opts.assignedToRmId) {
    const assigned = await sql`SELECT cp_code FROM cp_assignments WHERE rm_id = ${opts.assignedToRmId}`;
    cpCodes = assigned.map((r) => r.cp_code);
  }

  const { list, refMap } = await loadCorpus(def.corpus, periodDays, {
    since: opts.since,
    until: opts.until,
    rmId: opts.rmId,
    cpCodes,
  });
  if (list.length === 0) {
    return {
      meetingCount: 0,
      result: {
        headline: 'Not enough data yet',
        items: [],
        narrative: 'No meetings of this type in the selected period. Record some, then regenerate.',
      },
    };
  }

  const prompt = `You are a real-estate sales analyst for Openhouse (an Indian property platform). You are looking at structured summaries of ${list.length} ${def.corpus === 'all' ? 'meetings' : def.corpus + ' meetings'}.

TASK: ${def.task}

How to do this well:
- Base every claim ONLY on the data below. Don't pad with industry generalities.
- The data is structured summaries (no verbatim transcripts on this path) — themes should come from the summary fields, not invented.
- When you cluster items into themes, make sure each cluster has ≥2 supporting meetings unless the single meeting is genuinely the most important data point. Single-meeting "themes" should be merged into adjacent themes or dropped.
- For every item, the refs array MUST list the real refs that support it — and the count claim in "value" must equal len(refs). If you say "12 mentions", you must list 12 refs.
- If the data is sparse (few meetings, missing fields), say so in the narrative rather than over-extrapolating.

${RESULT_SHAPE}

DATA (${list.length} meetings, JSON lines — each has a "ref" number):
${list.map((c) => JSON.stringify(c)).join('\n')}`;

  const result = await runClaude(prompt);
  attachMeetingIds(result, refMap);
  return { meetingCount: list.length, result };
}

// Answers an admin's free-text question over a corpus. opts honoured for
// custom date / RM filters from the admin Insights toolbar.
//
// IMPORTANT: this path pulls full transcript text per meeting (truncated to
// MAX_TRANSCRIPT_CHARS), unlike the cached standard insights which run on
// summaries only. Keyword / quote / count questions like "how many mentions
// of 99acres" need the verbatim text — summaries alone miss most occurrences
// because the structured templates don't have a slot for every named entity.
export async function answerCustomQuestion(question, scope = 'all', periodDays = 90, opts = {}) {
  const corpusType = ['visit', 'engagement', 'onboarding', 'call'].includes(scope) ? scope : 'all';
  const { list, refMap } = await loadCorpus(corpusType, periodDays, {
    since: opts.since,
    until: opts.until,
    rmId: opts.rmId,
    includeTranscripts: true,
  });
  if (list.length === 0) {
    return {
      meetingCount: 0,
      result: {
        headline: 'No data',
        items: [],
        narrative: 'No meetings in scope to answer this question.',
      },
    };
  }

  const prompt = `You are a real-estate sales analyst for Openhouse. An admin asks:

"${question}"

DATA: ${list.length} ${corpusType === 'all' ? 'meetings' : corpusType + ' meetings'} below — JSON lines, one per meeting. Each line has:
  - "ref": numeric id for citing (use these in your refs arrays).
  - "data": the structured summary the LLM extracted from the transcript.
  - "transcript": the actual verbatim transcript text (may be truncated).
  - "cp", "date", "type": meeting metadata.

How to answer this question:
1. READ THE TRANSCRIPTS, not just the summaries. The structured "data" misses most named entities (tool names, society names, company names, specific phrases) because the extraction template has fixed slots. For any question that mentions a specific term, name, or phrase, you MUST search the verbatim "transcript" field across every meeting.
2. Be case-insensitive AND match common variants. "99acres" should also match "99 acres", "99-acres", "ninety-nine acres". "WhatsApp" matches "whatsap", "whats app", etc. Treat spaces, punctuation and capitalization as noise.
3. For "how many mentions of X" questions, count every meeting whose transcript contains X (any variant). Cite the ref of EVERY matching meeting — do not stop at a few.
4. For thematic questions ("what are CPs complaining about?"), use both transcripts and summaries. The summary is a good starting point; the transcript is for grounding and quoting.
5. If you state a count, the refs you list must equal that count. Never claim "5 meetings mention X" while only citing 2 refs.
6. If the data legitimately doesn't answer the question, say so honestly in the narrative. Don't pad.

${RESULT_SHAPE}

DATA:
${list.map((c) => JSON.stringify(c)).join('\n')}`;

  const result = await runClaude(prompt);
  attachMeetingIds(result, refMap);
  return { meetingCount: list.length, result };
}
