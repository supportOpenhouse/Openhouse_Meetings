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

// Loads a compact corpus for Claude: one tiny object per meeting carrying only
// the relevant summary sub-object. Keeps tokens low.
async function loadCorpus(corpusType, periodDays) {
  const since =
    periodDays && periodDays > 0
      ? new Date(Date.now() - periodDays * 86400000).toISOString()
      : null;

  const typeFilter =
    corpusType === 'all' ? ['visit', 'engagement', 'onboarding'] : [corpusType];

  const rows = since
    ? await sql`
        SELECT meeting_type, cp_code, cp_name, started_at, summary
        FROM meetings
        WHERE meeting_type = ANY(${typeFilter}) AND status = 'ready' AND summary IS NOT NULL
          AND started_at >= ${since}
        ORDER BY started_at DESC
        LIMIT ${MAX_MEETINGS}`
    : await sql`
        SELECT meeting_type, cp_code, cp_name, started_at, summary
        FROM meetings
        WHERE meeting_type = ANY(${typeFilter}) AND status = 'ready' AND summary IS NOT NULL
        ORDER BY started_at DESC
        LIMIT ${MAX_MEETINGS}`;

  // Reduce each row to the meaningful sub-object so the prompt stays compact.
  return rows.map((m) => {
    const s = m.summary || {};
    const body = s.visit || s.engagement || s.onboarding || s;
    return {
      type: m.meeting_type,
      cp: m.cp_code || m.cp_name || null,
      date: m.started_at ? new Date(m.started_at).toISOString().slice(0, 10) : null,
      data: body,
      score: s.score ? { total: s.score.total, classification: s.score.classification } : undefined,
    };
  });
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
  "items": [ { "label": "short name", "value": "count or metric, e.g. '23 mentions'", "note": "one concrete line" } ],
  "narrative": "2-4 sentences of analysis a founder can act on"
}
"items" is a ranked list (most important first), up to 12 entries. Omit "items" only if a list genuinely doesn't apply.`;

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
export async function generateStandardInsight(insightKey, periodDays = 90) {
  const def = STANDARD_INSIGHTS[insightKey];
  if (!def) throw new Error(`Unknown insight: ${insightKey}`);

  const corpus = await loadCorpus(def.corpus, periodDays);
  if (corpus.length === 0) {
    return {
      meetingCount: 0,
      result: {
        headline: 'Not enough data yet',
        items: [],
        narrative: 'No meetings of this type in the selected period. Record some, then regenerate.',
      },
    };
  }

  const prompt = `You are a real-estate sales analyst for Openhouse (an Indian property platform). You are looking at structured summaries of ${corpus.length} ${def.corpus === 'all' ? 'meetings' : def.corpus + ' meetings'}.

TASK: ${def.task}

Base every claim ONLY on the data below. Counts are approximate — that's fine. Be concrete and specific to what the data shows.

${RESULT_SHAPE}

DATA (${corpus.length} meetings, JSON lines):
${corpus.map((c) => JSON.stringify(c)).join('\n')}`;

  const result = await runClaude(prompt);
  return { meetingCount: corpus.length, result };
}

// Answers an admin's free-text question over a corpus.
export async function answerCustomQuestion(question, scope = 'all', periodDays = 90) {
  const corpusType = ['visit', 'engagement', 'onboarding'].includes(scope) ? scope : 'all';
  const corpus = await loadCorpus(corpusType, periodDays);
  if (corpus.length === 0) {
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

Answer using ONLY the structured meeting summaries below (${corpus.length} ${corpusType === 'all' ? 'meetings' : corpusType + ' meetings'}). If the data can't answer it, say so honestly in the narrative. Counts are approximate.

${RESULT_SHAPE}

DATA (JSON lines):
${corpus.map((c) => JSON.stringify(c)).join('\n')}`;

  const result = await runClaude(prompt);
  return { meetingCount: corpus.length, result };
}
