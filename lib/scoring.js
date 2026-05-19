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
