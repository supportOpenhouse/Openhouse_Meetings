import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_QUESTIONS = [
  { key: 'key_topics', label: 'What was discussed' },
  { key: 'cp_requirements', label: 'CP requirements' },
  { key: 'properties_discussed', label: 'Properties / projects mentioned' },
  { key: 'budget', label: 'Budget range' },
  { key: 'objections', label: 'Objections raised', list: true },
  { key: 'commitments', label: 'Commitments made', list: true },
  { key: 'next_action', label: 'Next action' },
  { key: 'sentiment', label: 'Meeting sentiment', sentiment: true },
  { key: 'follow_up_date', label: 'Follow-up timeline' },
];

let _client;
function client() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function summarizeWithClaude(transcript, meta) {
  const qList = DEFAULT_QUESTIONS.map(
    (q, i) =>
      `${i + 1}. ${q.label} (key: "${q.key}"${q.list ? ', return as array of short strings' : ''}${
        q.sentiment ? ', must be one of: "hot", "warm", "cold"' : ''
      })`
  ).join('\n');

  const prompt = `You are analyzing a sales meeting transcript between an Openhouse Relationship Manager (RM) and a Channel Partner (CP) in the Indian real estate context.

Meeting context:
- RM: ${meta.rm_name}
- CP code: ${meta.cp_code}
- CP mobile: ${meta.cp_mobile}
- Meeting purpose: ${meta.purpose || 'Not specified'}

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
    max_tokens: 1500,
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
