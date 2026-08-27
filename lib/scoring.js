// Lead-temperature scoring rubric. Applied to BOTH engagement and visit
// meetings — the same 12 parameters drive a single classification.
//
// Two of the parameters come from data we already have:
//   time_15_plus → from meetings.duration_seconds (server-computed)
// The other 11 are boolean signals Claude must judge from the transcript.
//
// We deliberately keep these flat (no nesting) so the LLM call is cheap and
// the score can be recomputed locally without re-running Claude.

export const SCORE_PARAMETERS = [
  { key: 'time_15_plus', label: 'Time spent 15+ mins', points: 10, computed: 'duration' },
  { key: 'society_tour', label: 'Society tour taken', points: 5 },
  { key: 'clubhouse_tour', label: 'Clubhouse tour taken', points: 5 },
  { key: 'deep_buying_questions', label: 'Asked deep buying questions', points: 10 },
  { key: 'loan_payment_discussion', label: 'Discussed loan / payment', points: 10 },
  { key: 'revisit_mention', label: 'Mentioned revisit', points: 10 },
  { key: 'immediate_closure', label: 'Immediate closure intent', points: 15 },
  { key: 'shared_requirement', label: 'Shared exact requirement', points: 5 },
  { key: 'family_involvement', label: 'Family involvement discussed', points: 5 },
  { key: 'compared_societies', label: 'Compared with other societies', points: 5 },
  { key: 'negotiation', label: 'Negotiation discussion', points: 10 },
  { key: 'positive_unit_feedback', label: 'Positive unit feedback', points: 10 },
];

export const SCORE_TOTAL_POSSIBLE = SCORE_PARAMETERS.reduce((s, p) => s + p.points, 0); // 100

// Signals Claude is asked about (everything except the duration-driven one).
export const LLM_SIGNAL_KEYS = SCORE_PARAMETERS
  .filter((p) => !p.computed)
  .map((p) => p.key);

export const CLASSIFICATION_THRESHOLDS = { hot: 70, warm: 40 };

export function classifyScore(total) {
  if (total >= CLASSIFICATION_THRESHOLDS.hot) return 'hot';
  if (total >= CLASSIFICATION_THRESHOLDS.warm) return 'warm';
  return 'cold';
}

// `llmSignals` is an object like { society_tour: true, clubhouse_tour: false, ... }
// `durationSeconds` lets us evaluate the time-spent parameter without bothering the LLM.
export function computeScore({ llmSignals = {}, durationSeconds = 0 }) {
  const parameters = {};
  let total = 0;
  for (const p of SCORE_PARAMETERS) {
    let met = false;
    if (p.computed === 'duration') {
      met = durationSeconds >= 15 * 60;
    } else {
      met = !!llmSignals[p.key];
    }
    parameters[p.key] = { label: p.label, points: p.points, met };
    if (met) total += p.points;
  }
  return {
    parameters,
    total,
    out_of: SCORE_TOTAL_POSSIBLE,
    classification: classifyScore(total),
  };
}

// ── Negotiation "deal / close" rubric ───────────────────────────────────────
// A separate 100-pt scale for negotiation (deal-closing) meetings. Kept apart
// from the visit funnel so it never pollutes the visit analytics. Same shape as
// SCORE_PARAMETERS: `computed: 'duration'` is server-derived, the rest are LLM
// booleans. Thresholds are lower than the visit rubric because a strong
// negotiation (token intent + timeline) should read "hot" without a full sweep.
export const NEGOTIATION_SCORE_PARAMETERS = [
  { key: 'substantial_discussion', label: '15+ min of real negotiation', points: 10, computed: 'duration' },
  { key: 'price_negotiated', label: 'Price actively negotiated', points: 10 },
  { key: 'price_aligned', label: 'Price aligned / near agreement', points: 15 },
  { key: 'payment_plan_discussed', label: 'Payment / financing plan worked out', points: 10 },
  { key: 'decision_maker_present', label: 'Decision-maker on the call', points: 10 },
  { key: 'concrete_timeline', label: 'Concrete close timeline given', points: 15 },
  { key: 'token_or_booking_intent', label: 'Token / booking / immediate-close intent', points: 20 },
  { key: 'objections_resolved', label: 'Key objections resolved', points: 10 },
];

export const NEGOTIATION_TOTAL_POSSIBLE = NEGOTIATION_SCORE_PARAMETERS.reduce((s, p) => s + p.points, 0); // 100
export const NEGOTIATION_LLM_SIGNAL_KEYS = NEGOTIATION_SCORE_PARAMETERS.filter((p) => !p.computed).map((p) => p.key);
const NEGOTIATION_THRESHOLDS = { hot: 60, warm: 30 };

export function computeNegotiationScore({ llmSignals = {}, durationSeconds = 0 }) {
  const parameters = {};
  let total = 0;
  for (const p of NEGOTIATION_SCORE_PARAMETERS) {
    const met = p.computed === 'duration' ? durationSeconds >= 15 * 60 : !!llmSignals[p.key];
    parameters[p.key] = { label: p.label, points: p.points, met };
    if (met) total += p.points;
  }
  const classification =
    total >= NEGOTIATION_THRESHOLDS.hot ? 'hot' : total >= NEGOTIATION_THRESHOLDS.warm ? 'warm' : 'cold';
  return { parameters, total, out_of: NEGOTIATION_TOTAL_POSSIBLE, classification };
}
