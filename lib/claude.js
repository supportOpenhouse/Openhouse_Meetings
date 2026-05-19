import Anthropic from '@anthropic-ai/sdk';
import {
  ENGAGEMENT_QUESTIONS,
  VISIT_QUESTIONS,
  getQuestionsForType,
} from '@/components/questions';

// Re-exported for callers that still import from here. The canonical source
// is components/questions.js.
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

function preamble(meta, meetingType) {
  if (meetingType === 'visit') {
    return `You are analyzing the transcript of a SITE VISIT between an Openhouse Relationship Manager (RM) and a prospective home BUYER touring an apartment / society in India. Use the Buyer Visit Assessment framework — extract the buyer's stated requirements, budget, intent, lifestyle signals, journey/urgency, and observable visit signals.

Meeting context:
- RM: ${meta.rm_name}
- CP code (referral): ${meta.cp_code}
- Buyer mobile: ${meta.cp_mobile}
- Visit purpose: ${meta.purpose || 'Not specified'}`;
  }
  return `You are analyzing a sales meeting transcript between an Openhouse Relationship Manager (RM) and a Channel Partner (CP) in the Indian real estate context.

Meeting context:
- RM: ${meta.rm_name}
- CP code: ${meta.cp_code}
- CP mobile: ${meta.cp_mobile}
- Meeting purpose: ${meta.purpose || 'Not specified'}`;
}

export async function summarizeWithClaude(transcript, meta, meetingType = 'engagement') {
  const questions = getQuestionsForType(meetingType);

  const qList = questions
    .map((q, i) => {
      const extras = [];
      if (q.list) extras.push('return as array of short strings');
      if (q.sentiment) extras.push('must be one of: "hot", "warm", "cold"');
      return `${i + 1}. ${q.label} (key: "${q.key}"${extras.length ? ', ' + extras.join(', ') : ''})`;
    })
    .join('\n');

  const prompt = `${preamble(meta, meetingType)}

Transcript:
"""
${transcript}
"""

Answer these questions based ONLY on what the transcript says. If something isn't discussed, return "Not discussed" (or [] for list fields). Be concise — one or two sentences per non-list answer.

Questions:
${qList}

Return STRICT JSON with one key per question (using the "key" shown above). No markdown, no prose around it, no code fences. Just the JSON object.`;

  const msg = await client().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: meetingType === 'visit' ? 2500 : 1500,
    messages: [{ role: 'user', content: prompt }],
  });

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
