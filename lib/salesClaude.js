import Anthropic from '@anthropic-ai/sdk';

// Standalone summarizer for SALES field visits — an Openhouse field-sales RM
// meeting a channel partner (broker) in person at their office/site. Kept apart
// from lib/claude.js (the demand/direct-RM summarizers) so the two products can
// evolve independently. Same plain-prompt + parseJson approach, not tool-use.

const MODEL = 'claude-sonnet-4-5-20250929';

let _client;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
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
  } catch {
    throw new Error(`Claude returned unparseable JSON: ${text.slice(0, 200)}`);
  }
}

const STR_KEYS = [
  'headline',
  'discussion_summary',
  'competitive_intel',
  'inventory_discussion',
];
const LIST_KEYS = ['key_points', 'cp_needs', 'objections', 'commitments', 'next_steps'];

// Coerce Claude's output into a stable shape so the UI never has to guard.
function normalize(parsed) {
  const out = parsed && typeof parsed === 'object' ? parsed : {};

  for (const k of STR_KEYS) {
    if (typeof out[k] !== 'string' || !out[k].trim()) out[k] = 'Not discussed';
  }
  for (const k of LIST_KEYS) {
    if (!Array.isArray(out[k])) out[k] = out[k] ? [String(out[k])] : [];
    else out[k] = out[k].map((x) => String(x)).filter(Boolean);
  }

  const sentiment = String(out.cp_sentiment || '').toLowerCase().trim();
  out.cp_sentiment = ['positive', 'neutral', 'disengaged'].includes(sentiment)
    ? sentiment
    : 'neutral';

  const stage = String(out.onboarding_stage || '').toLowerCase().trim();
  out.onboarding_stage = [
    'not_interested',
    'evaluating',
    'ready_to_onboard',
    'onboarded',
  ].includes(stage)
    ? stage
    : 'evaluating';

  return out;
}

// transcript: the diarized text. meta carries the RM's own form context so the
// model can ground its read of the conversation.
export async function summarizeSalesVisit(transcript, meta = {}) {
  const prompt = `You are analyzing the transcript of an in-person FIELD SALES VISIT in the Indian real-estate market. An Openhouse field-sales Relationship Manager (RM) has visited a CHANNEL PARTNER (CP) — a property broker / dealer — at their office or site. The RM is building the relationship: onboarding the CP onto Openhouse, understanding their inventory and buyer pipeline, and moving them toward sending Openhouse live deals.

Visit context (the RM's own notes — useful grounding, but the transcript is the source of truth):
- RM: ${meta.rm_name || 'Unknown'}
- Channel partner: ${meta.cp_name || 'n/a'}${meta.cp_code ? ` (${meta.cp_code})` : ''}
- Visit type: ${meta.meeting_type === 'repeat_visit' ? 'Repeat visit' : 'First visit'}
- RM's discussion notes: ${meta.key_discussion_points ? String(meta.key_discussion_points).slice(0, 1500) : 'None recorded'}

Transcript:
"""
${transcript}
"""

Produce STRICT JSON with EXACTLY these keys. Base every answer ONLY on the transcript. If something didn't come up, use "Not discussed" for text fields or [] for list fields. Be concise and concrete — quote specifics (society names, project names, numbers, competitor names) when the CP states them.

- "headline": one crisp sentence (max ~15 words) capturing the single most important takeaway from this visit.
- "discussion_summary": 2–4 sentences narrating what actually happened in the conversation.
- "key_points": array of short strings — the concrete things discussed.
- "cp_needs": array of short strings — what this CP wants or needs from Openhouse (inventory, payouts, leads, support). [] if none surfaced.
- "objections": array of short strings — concerns, hesitations, or blockers the CP raised. [] if none.
- "commitments": array of short strings — specific things the CP committed to do (e.g. "will share 3 resale listings this week"). [] if none.
- "competitive_intel": other platforms / competitors the CP mentioned using and any context, or "Not discussed".
- "inventory_discussion": any talk of the CP's current inventory, listings, or deal pipeline, or "Not discussed".
- "next_steps": array of short strings — the most useful follow-up actions for the RM.
- "cp_sentiment": the CP's engagement level in THIS visit — exactly one of:
  * "positive" — genuinely interested, asked substantive questions, and/or made a concrete commitment.
  * "neutral" — polite and engaged but non-committal; no clear forward motion.
  * "disengaged" — uninterested, dismissive, distracted, or the transcript is too thin to show real engagement. When the signal is weak, default to "disengaged", not "neutral".
- "onboarding_stage": the CP's position in the Openhouse onboarding journey — exactly one of: "not_interested", "evaluating", "ready_to_onboard", "onboarded". When unclear, use "evaluating".

Return ONLY the JSON object — no markdown, no code fences, no commentary.`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const summary = normalize(parseJson(msg));
  summary.generated_at = new Date().toISOString();
  return summary;
}
