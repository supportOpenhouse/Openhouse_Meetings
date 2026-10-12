import Anthropic from '@anthropic-ai/sdk';
// Relative paths (not @/) so this module also works when imported by the
// bulk-resummarize CLI script — plain Node doesn't honor jsconfig path aliases.
import {
  ENGAGEMENT_QUESTIONS,
  VISIT_QUESTIONS,
  ONBOARDING_QUESTIONS,
  CALL_QUESTIONS,
  NEGOTIATION_QUESTIONS,
} from '../components/questions.js';
import {
  LLM_SIGNAL_KEYS,
  SCORE_PARAMETERS,
  computeScore,
  NEGOTIATION_LLM_SIGNAL_KEYS,
  NEGOTIATION_SCORE_PARAMETERS,
  computeNegotiationScore,
} from './scoring.js';

// Legacy re-exports for callers that still import question sets from here.
export { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS, ONBOARDING_QUESTIONS, CALL_QUESTIONS, NEGOTIATION_QUESTIONS };
export const DEFAULT_QUESTIONS = ENGAGEMENT_QUESTIONS;

const MODEL = 'claude-sonnet-5-5';

let _client;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Every summary/classification request goes through here. Sonnet 5.5 always
// thinks before answering, so max_tokens leaves room for that on top of the
// JSON. `fallbacks: 'default'` re-runs a safety-classifier decline on a
// fallback model inside the same call instead of failing the meeting.
async function ask(prompt, { effort = 'medium', maxTokens = 16000 } = {}) {
  const msg = await client().messages.create(
    {
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  if (msg.stop_reason === 'refusal') {
    throw new Error(`Claude declined to summarize (${msg.stop_details?.category || 'no category'})`);
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('Claude hit max_tokens before finishing the summary');
  }
  return msg;
}

// Shared by every summary prompt. The dashboard is only useful if each
// answer is something that was actually said — a plausible guess (e.g. a
// budget bracket picked from the projects the RM pitched) is worse than
// "Not discussed".
const GROUNDING_RULES = `GROUNDING RULES — these override every other instruction:
- Every answer must be directly supported by something actually said in the transcript. Do NOT infer, estimate, assume, or fill gaps from context, tone, or general real-estate knowledge.
- Attribute correctly: what the RM says (pitches, prices or rents they quote, projects they suggest) is NOT the other person's budget, preference, or decision — unless that person clearly states or agrees to it.
- Numbers (budget, price, size, dates, counts) must come from the transcript. Mapping a number someone stated to its matching option is fine; deriving one from project names, the RM's quotes, or the person's profile is not.
- If something was not clearly discussed, answer "Not discussed" (or [] for list fields). "Not discussed" is a correct, useful answer; a plausible guess is an error.
- Summaries, personas and recommendations may combine facts that were said, but must not add facts that weren't.`;

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

function signalLines(params = SCORE_PARAMETERS) {
  return params
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
// allowed options inline (plus "Not discussed") so Claude picks from the
// fixed list.
function callQuestionLines(questions) {
  return questions
    .map((q, i) => {
      if (q.sentiment) {
        return `${i + 1}. ${q.label} (key: "${q.key}") — answer with exactly one of: "hot", "warm", "cold".`;
      }
      if (q.options) {
        const opts = q.options.map((o) => `"${o}"`).join('; ');
        const how = q.list
          ? 'return a JSON array of the exact option strings the buyer actually said — [] if none were discussed'
          : 'return exactly ONE option string, or "Not discussed" if the buyer did not say it';
        const allowed = q.list ? opts : `${opts}; "Not discussed"`;
        return `${i + 1}. ${q.label} (key: "${q.key}") — ${how}.\n   Options: [${allowed}]`;
      }
      return `${i + 1}. ${q.label} (key: "${q.key}") — free text, 1–2 concise sentences.`;
    })
    .join('\n');
}

// Coerces Claude's call-survey output into the expected shape: list questions
// always become arrays, missing keys are backfilled, and any answer that isn't
// one of the question's options becomes "Not discussed" / is dropped — so a
// paraphrased or invented option can't reach the dashboard.
function normalizeCall(parsed) {
  const out = normalize(parsed, CALL_QUESTIONS);
  for (const q of CALL_QUESTIONS) {
    if (q.list && !Array.isArray(out[q.key])) {
      const v = out[q.key];
      out[q.key] = v && v !== 'Not discussed' ? [String(v)] : [];
    }
    if (!q.options) continue;
    if (q.list) {
      out[q.key] = out[q.key].filter((v) => q.options.includes(v));
    } else if (!q.options.includes(out[q.key])) {
      out[q.key] = 'Not discussed';
    }
  }
  // Buyer temperature must be exactly hot/warm/cold — default unknowns to cold.
  const s = String(out.sentiment || '').toLowerCase().trim();
  out.sentiment = ['hot', 'warm', 'cold'].includes(s) ? s : 'cold';
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

${GROUNDING_RULES}

Answer these questions based ONLY on what the transcript says. If something isn't discussed, return "Not discussed" (or [] for list fields). Be concise — one or two sentences per non-list answer.

Questions:
${questionLines(ENGAGEMENT_QUESTIONS)}

Sentiment classification (only for the "sentiment" key) — judge the Channel Partner's engagement level with Openhouse based on what they actually said in this conversation:
- "hot" — the CP made a concrete commitment (e.g. promised to send leads within a stated window, named specific buyers/projects they will bring, asked transactional specifics like commission %, payment terms, inventory availability). Active proactive interest.
- "warm" — the CP showed clear interest and asked at least 2-3 substantive questions about Openhouse / inventory / process, but did NOT commit to a next step. Phrases like "I'll think about it", "let me check with my buyers", "send me details" without a specific timeline are warm at best.
- "cold" — the CP was non-committal, made excuses, or there was insufficient signal to judge confidently. ALWAYS use "cold" when the transcript has fewer than ~80 substantive words, is mostly pleasantries / call-setup / silence, or doesn't actually contain a real CP-engagement conversation (e.g. very short clip, RM monologue, technical test).

When the signal is weak, default to "cold". Do NOT default to "warm".

Return STRICT JSON with one key per question (using the "key" shown above). No markdown, no prose around it, no code fences.`;

  const msg = await ask(prompt);
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

${GROUNDING_RULES}

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

  const msg = await ask(prompt);
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

${GROUNDING_RULES}

Answer these questions based ONLY on the transcript. If something didn't come up, return "Not discussed" (or [] for list fields). Be concise.

Questions:
${questionLines(ONBOARDING_QUESTIONS)}

Be conservative: if the transcript is short, mostly call-setup, or doesn't contain real onboarding-pitch content, return "Not discussed" rather than inventing answers from generic real-estate knowledge. The dashboard treats "Not discussed" as a useful signal — don't paper over thin recordings.

Return STRICT JSON with one key per question (using the "key" shown above). No markdown, no code fences.`;

  const msg = await ask(prompt);
  const parsed = parseJson(msg);
  const onboarding = normalize(parsed, ONBOARDING_QUESTIONS);
  return {
    meeting_type: 'onboarding',
    onboarding,
    generated_at: new Date().toISOString(),
  };
}

// Direct-RM phone call — a buyer-discovery survey. Choice questions are
// answered from the fixed option list, but ONLY when the buyer actually said
// it; everything else is "Not discussed". (This used to tell Claude to infer
// the most likely option, which filled in budgets nobody mentioned.)
async function summarizeCall(transcript, meta) {
  const prompt = `You are analyzing the transcript of a phone call between an Openhouse sales representative and a prospective HOME BUYER in the Gurgaon / Haryana market. Openhouse helps buyers purchase government-regulated affordable housing transparently (fixed prices, no cash demands, a fair draw-of-lots process).

Your job: fill in the buyer-discovery survey below from this one call — recording only what the buyer actually said.

${GROUNDING_RULES}

Survey rules:
- For each choice question, pick the option that matches what the BUYER said in this call. If the buyer didn't say it, the answer is "Not discussed" (or [] for multi-choice) — even if an option seems likely.
- Never pick an option because the rep suggested or pitched it; only if the buyer stated it or clearly agreed.
- Never invent an option that isn't listed. If the buyer said something that doesn't fit any option, answer "Not discussed" and put it in "open_feedback" in their words.
- If the call has no real buyer conversation (wrong number, call back later, mostly greetings, off-topic), every choice question is "Not discussed" / [].

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
- "sentiment": the buyer's temperature.
  * "hot" — buyer expressed concrete intent (asked for specific project visits, named a unit/society they want, committed to a callback at a specific time, or discussed budget+timeline with clear urgency to transact soon).
  * "warm" — buyer engaged genuinely with questions about inventory / pricing / process but did NOT commit to a specific next step. "Let me think about it" or "I'll discuss with family" with no timeline is warm at best.
  * "cold" — buyer was dismissive, asked to be removed, hung up early, OR the call was too short / sparse to confidently judge (e.g. under ~60 seconds of real conversation, voicemail, mostly pleasantries / call-setup, no real buyer-discovery happened).
  When the signal is weak (short call, no real buyer-discovery content), default to "cold" — do NOT default to "warm".
- "open_feedback": notable context or quotes in the buyer's own words, or "Nothing notable".
- "persona_summary": a crisp 1–2 sentence profile of this buyer, using only facts stated in the call.
- "sales_recommendation": the single most useful next step for the rep, based on what was said.`;

  const msg = await ask(prompt);
  const parsed = parseJson(msg);
  const call = normalizeCall(parsed);
  return {
    meeting_type: 'call',
    call,
    generated_at: new Date().toISOString(),
  };
}

// Negotiation summarization — deal-closing conversation with a buyer. Produces
// the negotiation answers AND the boolean signals feeding the 100-pt deal score.
async function summarizeNegotiation(transcript, meta) {
  const durationSeconds = Number(meta?.duration_seconds || 0);

  const prompt = `You are analyzing the transcript of a NEGOTIATION / DEAL-CLOSING meeting between an Openhouse Relationship Manager (RM) and a prospective home BUYER in India. The RM is working to close the purchase — negotiating price, payment terms, and the next steps toward booking.

Meeting context:
- RM: ${meta.rm_name || 'Unknown'}
- CP / referral code: ${meta.cp_code || 'n/a'}
- Buyer mobile: ${meta.cp_mobile || 'n/a'}
- Purpose: ${meta.purpose || 'Not specified'}

Transcript:
"""
${transcript}
"""

${GROUNDING_RULES}

Produce STRICT JSON with two top-level keys:

1. "negotiation" — answers to the questions below. Base every answer ONLY on the transcript. Use "Not discussed" (or [] for list fields) when something didn't come up — never invent prices, terms, or timelines. Be concise.
${questionLines(NEGOTIATION_QUESTIONS)}

2. "signals" — boolean true/false for each signal below, judged from the transcript alone. Be conservative — only mark true if the transcript clearly supports it.
${signalLines(NEGOTIATION_SCORE_PARAMETERS)}

Output rules:
- One JSON object with exactly the two keys above.
- No markdown, no code fences, no commentary.
- Every "negotiation" key from the list must be present.
- Every "signals" key from the list must be present, strictly true or false.`;

  const msg = await ask(prompt);
  const parsed = parseJson(msg);
  const negotiation = normalize(parsed.negotiation || {}, NEGOTIATION_QUESTIONS);
  const signals = parsed.signals || {};
  for (const k of NEGOTIATION_LLM_SIGNAL_KEYS) signals[k] = signals[k] === true;
  const score = computeNegotiationScore({ llmSignals: signals, durationSeconds });
  return {
    meeting_type: 'negotiation',
    negotiation,
    signals,
    score,
    generated_at: new Date().toISOString(),
  };
}

// Public entry point used by /process, /resummarize, and the bulk CLI.
export async function summarizeMeeting(transcript, meta, meetingType = 'engagement') {
  if (meetingType === 'visit') return summarizeVisit(transcript, meta);
  if (meetingType === 'onboarding') return summarizeOnboarding(transcript, meta);
  if (meetingType === 'call') return summarizeCall(transcript, meta);
  if (meetingType === 'negotiation') return summarizeNegotiation(transcript, meta);
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

  const msg = await ask(prompt, { effort: 'low', maxTokens: 4000 });
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
