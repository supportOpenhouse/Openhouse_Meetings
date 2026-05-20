import Anthropic from '@anthropic-ai/sdk';
// Relative paths (not @/) so this module also works when imported by the
// bulk-resummarize CLI script — plain Node doesn't honor jsconfig path aliases.
import { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS, ONBOARDING_QUESTIONS } from '../components/questions.js';
import { LLM_SIGNAL_KEYS, SCORE_PARAMETERS, computeScore } from './scoring.js';

// Legacy re-exports for callers that still import question sets from here.
export { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS, ONBOARDING_QUESTIONS };
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

// Public entry point used by /process, /resummarize, and the bulk CLI.
export async function summarizeMeeting(transcript, meta, meetingType = 'engagement') {
  if (meetingType === 'visit') return summarizeVisit(transcript, meta);
  if (meetingType === 'onboarding') return summarizeOnboarding(transcript, meta);
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
