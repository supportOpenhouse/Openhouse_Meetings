// One place for the Claude model + request settings shared by every summary
// and insight call (lib/claude.js, salesClaude.js, insightsClaude.js,
// supplyInsightsClaude.js). Relative-import safe — no @/ aliases — so the
// bulk CLI scripts can use it under plain Node.

export const CLAUDE_MODEL = 'claude-sonnet-5-5';

// Running token totals for this process — read by the bulk CLI scripts to
// report what a run actually cost.
export const usageTotals = { calls: 0, input: 0, output: 0 };

// Sonnet 5.5 always thinks before answering, so max_tokens has to cover that
// on top of the JSON. `fallbacks: 'default'` re-runs a safety-classifier
// decline on a fallback model inside the same call instead of failing.
// effort: 'low' | 'medium' | 'high' (model default) | 'xhigh' | 'max'.
export async function createMessage(client, body, { effort = 'medium' } = {}) {
  const msg = await client.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      ...body,
      output_config: { effort, ...(body.output_config || {}) },
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  usageTotals.calls++;
  usageTotals.input += msg.usage?.input_tokens || 0;
  usageTotals.output += msg.usage?.output_tokens || 0;
  if (msg.stop_reason === 'refusal') {
    throw new Error(`Claude declined the request (${msg.stop_details?.category || 'no category'})`);
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('Claude hit max_tokens before finishing');
  }
  return msg;
}

// Shared by every summary prompt. Dashboards are only useful if each answer is
// something that was actually said — a plausible guess (e.g. a budget bracket
// picked from the projects the RM pitched) is worse than "Not discussed".
export const GROUNDING_RULES = `GROUNDING RULES — these override every other instruction:
- Every answer must be directly supported by something actually said in the transcript. Do NOT infer, estimate, assume, or fill gaps from context, tone, or general real-estate knowledge.
- Attribute correctly: what the RM says (pitches, prices or rents they quote, projects they suggest) is NOT the other person's budget, preference, or decision — unless that person clearly states or agrees to it.
- Numbers (budget, price, size, dates, counts) must come from the transcript. Mapping a number someone stated to its matching option is fine; deriving one from project names, the RM's quotes, or the person's profile is not.
- If something was not clearly discussed, answer "Not discussed" (or [] for list fields). "Not discussed" is a correct, useful answer; a plausible guess is an error.
- Summaries, personas and recommendations may combine facts that were said, but must not add facts that weren't.`;
