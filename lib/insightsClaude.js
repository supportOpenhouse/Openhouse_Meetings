// Tier 2 analytics — Claude synthesis over the structured `summary` JSON of
// many meetings at once. Reads ONLY data already in Postgres; ElevenLabs is
// never called. Costs a few cents per run (compact summaries, not transcripts)
// and every result is cached in the `insights` table by the API layer.

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Cap the corpus so a single Claude call stays well within context + cheap.
const MAX_MEETINGS = 280;

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
    corpusType === 'all' ? ['visit', 'engagement', 'onboarding'] : [corpusType];

  const cpCodes = opts.cpCodes;
  const scoped = Array.isArray(cpCodes);
  if (scoped && cpCodes.length === 0) return { list: [], refMap: {} };

  let since = null;
  if (opts.since) since = new Date(opts.since).toISOString();
  else if (periodDays > 0) since = new Date(Date.now() - periodDays * 86400000).toISOString();
  const until = opts.until ? new Date(opts.until).toISOString() : null;
  const rmId = opts.rmId || null;
  const cpCodesArr = scoped ? cpCodes : null;

  // Single query with NULL-param guards across every filter dimension.
  const rows = await sql`
    SELECT id, meeting_type, cp_code, cp_name, started_at, summary
    FROM meetings
    WHERE meeting_type = ANY(${typeFilter}) AND status = 'ready' AND summary IS NOT NULL
      AND (${since}::timestamptz IS NULL OR started_at >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR started_at <= ${until}::timestamptz)
      AND (${rmId}::uuid IS NULL OR rm_id = ${rmId}::uuid)
      AND (${cpCodesArr}::text[] IS NULL OR cp_code = ANY(${cpCodesArr}::text[]))
    ORDER BY started_at DESC LIMIT ${MAX_MEETINGS}
  `;

  const refMap = {};
  const list = rows.map((m, i) => {
    const ref = i + 1;
    refMap[ref] = m.id;
    const s = m.summary || {};
    const body = s.visit || s.engagement || s.onboarding || s.call || s;
    return {
      ref,
      type: m.meeting_type,
      cp: m.cp_code || m.cp_name || null,
      date: m.started_at ? new Date(m.started_at).toISOString().slice(0, 10) : null,
      data: body,
      score: s.score ? { total: s.score.total, classification: s.score.classification } : undefined,
    };
  });
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

const RESULT_SHAPE = `Return STRICT JSON, no markdown, no code fences:
{
  "headline": "one punchy sentence — the single most important takeaway",
  "items": [
    {
      "label": "short name",
      "value": "count or metric, e.g. '23 mentions'",
      "note": "one concrete line",
      "refs": [ list of the numeric "ref" values of meetings that support THIS item — most relevant first, up to 25 ]
    }
  ],
  "narrative": "2-4 sentences of analysis a founder can act on"
}
"items" is a ranked list (most important first), up to 12 entries. Omit "items" only if a list genuinely doesn't apply.
"refs" MUST contain the real ref numbers from the DATA below — never invent them. Every item that represents a theme/cluster must list the meetings behind it.`;

async function runClaude(prompt) {
  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  try {
    return parseJson(msg);
  } catch (e) {
    throw new Error('Claude returned unparseable JSON for insight');
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

Base every claim ONLY on the data below. Counts are approximate — that's fine. Be concrete and specific to what the data shows.

${RESULT_SHAPE}

DATA (${list.length} meetings, JSON lines — each has a "ref" number):
${list.map((c) => JSON.stringify(c)).join('\n')}`;

  const result = await runClaude(prompt);
  attachMeetingIds(result, refMap);
  return { meetingCount: list.length, result };
}

// Answers an admin's free-text question over a corpus. opts honoured for
// custom date / RM filters from the admin Insights toolbar.
export async function answerCustomQuestion(question, scope = 'all', periodDays = 90, opts = {}) {
  const corpusType = ['visit', 'engagement', 'onboarding', 'call'].includes(scope) ? scope : 'all';
  const { list, refMap } = await loadCorpus(corpusType, periodDays, {
    since: opts.since,
    until: opts.until,
    rmId: opts.rmId,
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

Answer using ONLY the structured meeting summaries below (${list.length} ${corpusType === 'all' ? 'meetings' : corpusType + ' meetings'}). If the data can't answer it, say so honestly in the narrative. Counts are approximate.

${RESULT_SHAPE}

DATA (${list.length} meetings, JSON lines — each has a "ref" number):
${list.map((c) => JSON.stringify(c)).join('\n')}`;

  const result = await runClaude(prompt);
  attachMeetingIds(result, refMap);
  return { meetingCount: list.length, result };
}
