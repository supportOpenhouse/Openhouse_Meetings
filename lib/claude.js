import Anthropic from '@anthropic-ai/sdk';
// Relative paths (not @/) so this module also works when imported by the
// bulk-resummarize CLI script — plain Node doesn't honor jsconfig path aliases.
import { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS } from '../components/questions.js';
import { LLM_SIGNAL_KEYS, SCORE_PARAMETERS, computeScore } from './scoring.js';

// Legacy re-exports for callers that still import question sets from here.
export { ENGAGEMENT_QUESTIONS, VISIT_QUESTIONS };
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

// Single Claude call returning everything we need:
//   engagement: { ... }   answers to ENGAGEMENT_QUESTIONS
//   visit: { ... }        answers to VISIT_QUESTIONS
//   signals: { ... }      booleans for the score rubric (excluding time-spent
//                         which we compute from duration_seconds locally)
//
// Returns the parsed summary object with an additional `.score` block filled
// in here using the duration_seconds caller passed in `meta`.
export async function summarizeMeeting(transcript, meta) {
  const durationSeconds = Number(meta?.duration_seconds || 0);

  const prompt = `You are analyzing a sales-meeting transcript between an Openhouse Relationship Manager (RM) and either a Channel Partner (CP) or a prospective home BUYER touring a property in India. You will produce TWO complementary summaries plus a set of yes/no signals used to score the lead.

Meeting context:
- RM: ${meta.rm_name || 'Unknown'}
- CP / referral code: ${meta.cp_code || 'n/a'}
- Buyer mobile: ${meta.cp_mobile || 'n/a'}
- Stated purpose: ${meta.purpose || 'Not specified'}

Transcript:
"""
${transcript}
"""

Produce a STRICT JSON object with three top-level keys:

1. "engagement" — answers to the questions below treating this as an RM↔CP working-relationship conversation. Use "Not discussed" (or [] for list fields) when something didn't come up.
${questionLines(ENGAGEMENT_QUESTIONS)}

2. "visit" — answers to the questions below treating this as a buyer site visit / qualification assessment. Same rules for missing data.
${questionLines(VISIT_QUESTIONS)}

3. "signals" — boolean true/false for each signal below, judged from the transcript alone. Be conservative: only mark true if the transcript clearly supports it.
${signalLines()}

Output rules:
- Return ONE JSON object with exactly the three keys above.
- No markdown, no code fences, no commentary.
- Every "engagement" key from the list must be present.
- Every "visit" key from the list must be present.
- Every "signals" key from the list must be present, value strictly true or false.`;

  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = msg.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('')
    .trim();

  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) text = m[0];

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Claude returned unparseable JSON: ${text.slice(0, 200)}`);
  }

  // Normalize: ensure every required key exists so the renderer doesn't break.
  const engagement = parsed.engagement || {};
  const visit = parsed.visit || {};
  const signals = parsed.signals || {};
  for (const q of ENGAGEMENT_QUESTIONS) {
    if (!(q.key in engagement)) engagement[q.key] = q.list ? [] : 'Not discussed';
  }
  for (const q of VISIT_QUESTIONS) {
    if (!(q.key in visit)) visit[q.key] = q.list ? [] : 'Not discussed';
  }
  for (const k of LLM_SIGNAL_KEYS) {
    signals[k] = signals[k] === true;
  }

  const score = computeScore({ llmSignals: signals, durationSeconds });

  return {
    engagement,
    visit,
    signals,
    score,
    generated_at: new Date().toISOString(),
  };
}

// Back-compat shim. Older callers in this codebase pass a meetingType arg.
// We now ignore that — we always generate the full combined summary.
export async function summarizeWithClaude(transcript, meta, _meetingType) {
  return summarizeMeeting(transcript, meta);
}
