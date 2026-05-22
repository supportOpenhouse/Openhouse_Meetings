import Anthropic from '@anthropic-ai/sdk';
// Relative paths (not @/) so this module also works when imported by the
// bulk-resummarize CLI script — plain Node doesn't honor jsconfig path aliases.
import {
  ENGAGEMENT_QUESTIONS,
  VISIT_QUESTIONS,
  ONBOARDING_QUESTIONS,
  CALL_QUESTIONS,
} from '../components/questions.js';
import { LLM_SIGNAL_KEYS, SCORE_PARAMETERS, computeScore } from './scoring.js';

// Legacy re-exports for callers that still import question sets from here.
export { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS, ONBOARDING_QUESTIONS, CALL_QUESTIONS };
export const DEFAULT_QUESTIONS = ENGAGEMENT_QUESTIONS;

let _client;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function questionLines(questions) {
  return questions
    .map((q, i) => {
      const extras = [];
      if (q.list) extras.push('return as array of short strings');
      if (q.sentiment) extras.push('must be one of: "hot", "warm", "cold"');
      return `${i + 1}. ${q.label} (key: "${q.key}"${extras.length ? ', ' + extras.join(', ') : ''})`;
    })
    .join('\n');
}

function signalLines() {
  return SCORE_PARAMETERS
    .filter((p) => !p.computed)
    .map((p) => `- ${p.key}: did the transcript indicate "${p.label}"? (true/false)`)
    .join('\n');
}

function normalize(parsed, questions) {
  const out = parsed || {};
  for (const q of questions) {
    if (!(q.key in out)) out[q.key] = q.list ? [] : 'Not discussed';
  }
  return out;
}

// Renders the call survey for the prompt — each choice question carries its
// allowed options inline so Claude picks from the fixed list.
function callQuestionLines(questions) {
  return questions
    .map((q, i) => {
      if (q.options) {
        const opts = q.options.map((o) => `"${o}"`).join('; ');
        const how = q.list
          ? 'pick ALL that apply — return a JSON array of the exact option strings ([] only if genuinely none apply)'
          : 'pick exactly ONE — return the exact option string';
        return `${i + 1}. ${q.label} (key: "${q.key}") — ${how}.\n   Options: [${opts}]`;
      }
      return `${i + 1}. ${q.label} (key: "${q.key}") — free text, 1–2 concise sentences.`;
    })
    .join('\n');
}

// Coerces Claude's call-survey output into the expected shape: list questions
// always become arrays, missing keys are backfilled.
function normalizeCall(parsed) {
  const out = normalize(parsed, CALL_QUESTIONS);
  for (const q of CALL_QUESTIONS) {
    if (q.list && !Array.isArray(out[q.key])) {
      const v = out[q.key];
      out[q.key] = v && v !== 'Not discussed' ? [String(v)] : [];
    }
  }
  return out;
}

// Engagement summarization — old simple flow. Claude returns the question
// answers including a "sentiment" hot/warm/cold based on its own judgment.
async function summarizeEngagement(transcript, meta) {
  const prompt = `You are analyzing a sales meeting transcript between an Openhouse Relationship Manager (RM) and a Channel Partner (CP) in the Indian real estate context.

Meeting context:
- RM: ${meta.rm_name || 'Unknown'}
- CP code: ${meta.cp_code || 'n/a'}
- CP mobile: ${meta.cp_mobile || 'n/a'}
- Meeting purpose: ${meta.purpose || 'Not specified'}

Transcript:
"""
${transcript}
"""

Answer these questions based ONLY on what the transcript says. If something isn't discussed, return "Not discussed" (or [] for list fields). Be concise — one or two sentences per non-list answer.

Questions:
${questionLines(ENGAGEMENT_QUESTIONS)}

Return STRICT JSON with one key per question (using the "key" shown above). No markdown, no prose around it, no code fences.`;

  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = parseJson(msg);
  const engagement = normalize(parsed, ENGAGEMENT_QUESTIONS);
  return {
    meeting_type: 'engagement',
    engagement,
    generated_at: new Date().toISOString(),
  };
}

// Visit summarization — produces the visit answers AND the boolean signals
// that feed the 100-pt lead-score rubric. time_15_plus is derived from the
// recording duration server-side, not asked of the LLM.
async function summarizeVisit(transcript, meta) {
  const durationSeconds = Number(meta?.duration_seconds || 0);

  const prompt = `You are analyzing the transcript of a SITE VISIT between an Openhouse Relationship Manager (RM) and a prospective home BUYER touring an apartment / society in India. Use the Buyer Visit Assessment framework.

Meeting context:
- RM: ${meta.rm_name || 'Unknown'}
- CP / referral code: ${meta.cp_code || 'n/a'}
- Buyer mobile: ${meta.cp_mobile || 'n/a'}
- Visit purpose: ${meta.purpose || 'Not specified'}

Transcript:
"""
${transcript}
"""

Produce STRICT JSON with two top-level keys:

1. "visit" — answers to the visit-assessment questions. Use "Not discussed" (or [] for list fields) when something didn't come up. Be concise.
${questionLines(VISIT_QUESTIONS)}

2. "signals" — boolean true/false for each signal below, judged from the transcript alone. Be conservative — only mark true if the transcript clearly supports it.
${signalLines()}

Output rules:
- One JSON object with exactly the two keys above.
- No markdown, no code fences, no commentary.
- Every "visit" key from the list must be present.
- Every "signals" key from the list must be present, strictly true or false.`;

  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = parseJson(msg);
  const visit = normalize(parsed.visit || {}, VISIT_QUESTIONS);
  const signals = parsed.signals || {};
  for (const k of LLM_SIGNAL_KEYS) signals[k] = signals[k] === true;
  const score = computeScore({ llmSignals: signals, durationSeconds });
  return {
    meeting_type: 'visit',
    visit,
    signals,
    score,
    generated_at: new Date().toISOString(),
  };
}

function parseJson(msg) {
  let text = msg.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('')
    .trim();
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Claude returned unparseable JSON: ${text.slice(0, 200)}`);
  }
}

// CP onboarding pitch — RM is pitching Openhouse to a prospective CP who is
// not yet onboarded. No score rubric; just answers + Claude-judged sentiment.
async function summarizeOnboarding(transcript, meta) {
  const prompt = `You are analyzing a transcript of an Openhouse Relationship Manager (RM) PITCHING the Openhouse platform to a prospective Channel Partner (CP) — a real-estate broker who is NOT yet onboarded with Openhouse. The RM is trying to convince them to sign up.

Meeting context:
- RM: ${meta.rm_name || 'Unknown'}
- Prospective CP name: ${meta.cp_name || 'Not captured'}
- Prospective CP mobile: ${meta.cp_mobile || 'Not captured'}

Transcript:
"""
${transcript}
"""

Answer these questions based ONLY on the transcript. If something didn't come up, return "Not discussed" (or [] for list fields). Be concise.

Questions:
${questionLines(ONBOARDING_QUESTIONS)}

Return STRICT JSON with one key per question (using the "key" shown above). No markdown, no code fences.`;

  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1800,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = parseJson(msg);
  const onboarding = normalize(parsed, ONBOARDING_QUESTIONS);
  return {
    meeting_type: 'onboarding',
    onboarding,
    generated_at: new Date().toISOString(),
  };
}

// Direct-RM phone call — a buyer-discovery survey. Every choice question is
// answered from the fixed option list; when the buyer didn't say something
// outright, Claude infers the most likely option from the rest of the call.
async function summarizeCall(transcript, meta) {
  const prompt = `You are analyzing the transcript of a phone call between an Openhouse sales representative and a prospective HOME BUYER in the Gurgaon / Haryana market. Openhouse helps buyers purchase government-regulated affordable housing transparently (fixed prices, no cash demands, a fair draw-of-lots process).

Your job: fill in the buyer-discovery survey below from this one call.

CRITICAL RULE: for every multiple-choice question you MUST choose from the given options. Choose the option the transcript best supports. If the buyer did not state it outright, INFER the single most likely option from everything else in the call — their budget, urgency, the questions they asked, their tone and circumstances. Never skip a choice question, never answer "Not discussed" for one, and never invent an option that isn't listed.

Buyer mobile: ${meta.cp_mobile || 'n/a'}

Transcript:
"""
${transcript}
"""

Questions:
${callQuestionLines(CALL_QUESTIONS)}

Output rules:
- Return STRICT JSON — one key per question, using the "key" shown above. No markdown, no code fences, no commentary.
- Single-choice answers: the EXACT option string, copied verbatim.
- Multi-choice answers: a JSON array of exact option strings.
- "open_feedback": notable context or quotes in the buyer's own words, or "Nothing notable".
- "persona_summary": a crisp 1–2 sentence profile of this buyer.
- "sales_recommendation": the single most useful next step for the rep to move this buyer forward.`;

  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });
  const parsed = parseJson(msg);
  const call = normalizeCall(parsed);
  return {
    meeting_type: 'call',
    call,
    generated_at: new Date().toISOString(),
  };
}

// Public entry point used by /process, /resummarize, and the bulk CLI.
export async function summarizeMeeting(transcript, meta, meetingType = 'engagement') {
  if (meetingType === 'visit') return summarizeVisit(transcript, meta);
  if (meetingType === 'onboarding') return summarizeOnboarding(transcript, meta);
  if (meetingType === 'call') return summarizeCall(transcript, meta);
  return summarizeEngagement(transcript, meta);
}

// Cheap classifier — used to retro-assign meeting_type for legacy rows that
// were created before the engagement/visit split existed. Single word output
// so the call is small and parses trivially.
export async function classifyMeetingType(transcript, meta = {}) {
  const safeTranscript = String(transcript || '').slice(0, 12000);
  if (!safeTranscript.trim()) return 'engagement'; // nothing to read; default

  const prompt = `Classify the following Indian real-estate sales transcript into ONE of two categories:

ENGAGEMENT — a phone-call or office conversation between an Openhouse RM and a channel partner (CP / broker). Topics: lead handover, deal progress, inventory updates, payouts, relationship chit-chat. The CP is the audience.

VISIT — a SITE VISIT where the RM is walking a prospective home BUYER through an apartment or society in person. Topics: touring rooms, pointing out finishes, amenities walkthrough, discussing the unit/floor in front of them, immediate buying intent for that specific property. The buyer is the audience.

Heuristics:
- Mentions of touring, walking, "this room", "this floor", clubhouse/amenities being viewed live, "do you like this?", floor plans → VISIT.
- Phone-call language ("haan bolo", "kya update hai", talking about a CP's other CPs, payouts, listing prices) → ENGAGEMENT.
- When ambiguous, choose ENGAGEMENT.

Meeting context:
- RM: ${meta.rm_name || 'Unknown'}
- CP / referral code: ${meta.cp_code || 'n/a'}
- Buyer / CP mobile: ${meta.cp_mobile || 'n/a'}
- Stated purpose: ${meta.purpose || 'Not specified'}

Transcript:
"""
${safeTranscript}
"""

Reply with EXACTLY ONE WORD — either "engagement" or "visit". No punctuation, no quotes, no explanation.`;

  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8,
    messages: [{ role: 'user', content: prompt }],
  });
  const raw = msg.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return raw === 'visit' ? 'visit' : 'engagement';
}

// Back-compat shim. Older callers pass (transcript, meta, meetingType).
export async function summarizeWithClaude(transcript, meta, meetingType = 'engagement') {
  return summarizeMeeting(transcript, meta, meetingType);
}
