// Two summary modes:
//   engagement → original RM↔CP working-relationship conversation
//   visit      → buyer site-visit assessment (qualification sheet)
//
// Each entry shape:
//   key           — stable identifier persisted in `meetings.summary` JSON
//   label         — human-facing label rendered in the UI
//   list          — true → Claude returns an array of short strings
//   sentiment     — true → Claude must return one of: 'hot' | 'warm' | 'cold'
//   group         — optional UI grouping label (visits only)
//
// Add new keys at the END to keep older saved summaries renderable.

// Sentiment-style judgment lives only on engagement (Claude's gut call).
// Visit meetings derive hot/warm/cold from the lib/scoring.js rubric instead.

export const ENGAGEMENT_QUESTIONS = [
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

export const VISIT_QUESTIONS = [
  // Requirement
  { key: 'societies_of_interest', label: 'Societies of interest', group: 'Requirement' },
  { key: 'configuration', label: 'Configuration (BHK)', group: 'Requirement' },
  { key: 'size_range', label: 'Size range (sq ft)', group: 'Requirement' },
  { key: 'floor_preference', label: 'Floor preference', group: 'Requirement' },
  { key: 'facing_preference', label: 'Facing / view preference', group: 'Requirement' },
  { key: 'tower_layout_preference', label: 'Tower / layout preference', group: 'Requirement' },

  // Budget
  { key: 'budget_range', label: 'Budget range', group: 'Budget' },
  { key: 'budget_flexibility', label: 'Budget flexibility' , group: 'Budget' },
  { key: 'funding_type', label: 'Loan vs self-funding', group: 'Budget' },
  { key: 'down_payment', label: 'Down payment range', group: 'Budget' },

  // Intent
  { key: 'buying_purpose', label: 'Buying purpose (self-use / investment / rental)', group: 'Intent' },
  { key: 'rental_importance', label: 'Rental return importance', group: 'Intent' },
  { key: 'possession_preference', label: 'Possession (immediate / appreciation / both)', group: 'Intent' },
  { key: 'resale_importance', label: 'Resale importance', group: 'Intent' },

  // Lifestyle
  { key: 'vastu_importance', label: 'Vastu importance', group: 'Lifestyle' },
  { key: 'amenities_important', label: 'Important amenities', list: true, group: 'Lifestyle' },
  { key: 'lifestyle_factor', label: 'School / family lifestyle factor', group: 'Lifestyle' },
  { key: 'rtm_uc_preference', label: 'Ready-to-move vs under-construction', group: 'Lifestyle' },

  // Journey & urgency
  { key: 'closure_timeline', label: 'Closure timeline', group: 'Journey' },
  { key: 'search_duration', label: 'How long they have been searching', group: 'Journey' },
  { key: 'societies_explored', label: 'Societies already explored', list: true, group: 'Journey' },
  { key: 'most_liked_society', label: 'Most liked society + why', group: 'Journey' },
  { key: 'stopping_factor', label: 'What is stopping them from closing', group: 'Journey' },
  { key: 'decision_makers', label: 'Decision makers involved', group: 'Journey' },

  // Visit signals (inferred from transcript)
  { key: 'buying_intent_signals', label: 'Buying-intent questions raised', list: true, group: 'Visit signals' },
  { key: 'objections', label: 'Objections / concerns raised', list: true, group: 'Visit signals' },
  { key: 'positive_signals', label: 'Positive signals observed', list: true, group: 'Visit signals' },
  { key: 'unit_feedback', label: 'Unit / society feedback', group: 'Visit signals' },
  { key: 'revisit_plan', label: 'Revisit / family visit plan', group: 'Visit signals' },

  // Outcome
  { key: 'next_action', label: 'Next action', group: 'Outcome' },
];

// CP onboarding pitch — used when the RM is talking to a prospective channel
// partner who is NOT yet onboarded. Optimised around capturing pitch quality,
// CP profile, objections, and onboarding likelihood. No score rubric (the
// 100-pt visit rubric doesn't apply); sentiment is Claude's gut call.
export const ONBOARDING_QUESTIONS = [
  { key: 'cp_profile', label: 'CP profile (business size, location, years in industry)' },
  { key: 'existing_partnerships', label: 'Platforms / developers the CP already works with', list: true },
  { key: 'pitch_points_covered', label: 'Openhouse pitch points the RM covered', list: true },
  { key: 'cp_interest_signals', label: 'Signals of CP interest', list: true },
  { key: 'objections_raised', label: 'Objections or concerns raised by the CP', list: true },
  { key: 'competitor_mentions', label: 'Competitors / alternative platforms the CP mentioned', list: true },
  { key: 'commercials_discussed', label: 'Commercials discussed (commission split, payout terms)' },
  { key: 'commitments_made', label: 'Commitments made by the CP', list: true },
  { key: 'onboarding_status', label: 'Onboarding status (will join / undecided / declined)' },
  { key: 'next_action', label: 'Next action the RM committed to' },
  { key: 'sentiment', label: 'Likelihood the CP will onboard', sentiment: true },
  { key: 'follow_up_date', label: 'Follow-up timeline' },
];

// Direct-RM phone-call summary — a buyer-discovery survey. Direct RMs upload
// recordings of calls with prospective home BUYERS (Gurgaon / Haryana
// affordable-housing market). Every choice question is answered by Claude
// picking from the fixed `options` — when the buyer doesn't say it outright,
// Claude infers the single most likely option from the rest of the call.
//
// Extra entry fields used only by this set:
//   options — the allowed answers; Claude must pick from these verbatim
//   list    — true → multi-select (Claude returns an array of options)
//   (no `options` and no `list`) → free-text synthesis field
export const CALL_QUESTIONS = [
  {
    key: 'journey_stage',
    label: 'Where the buyer is in their home-buying journey',
    options: [
      'Just exploring — getting a sense of options',
      'Actively searching — visiting sites, comparing',
      'Have a shortlist — deciding between 2–3 options',
      'Ready to book — waiting for the right project',
    ],
  },
  {
    key: 'purchase_intent',
    label: 'Buying to live in or to invest',
    options: [
      'For the family to live in',
      'Primarily as an investment',
      'Both — live in now, sell later',
    ],
  },
  {
    key: 'budget',
    label: 'All-in budget (flat price + GST + registration)',
    options: ['Under ₹50 lacs', '₹50–65 lacs', '₹65–75 lacs'],
  },
  {
    key: 'configuration',
    label: 'Configuration preferred',
    list: true,
    options: ['1 BHK', '2 BHK', '3 BHK (compact)', 'Flexible'],
  },
  {
    key: 'location_priorities',
    label: 'What matters most about the location (up to 3)',
    list: true,
    options: [
      'Close to metro / good road connectivity',
      'Near workplace (Cyber City / Sohna / NH-48)',
      'Good schools and hospitals nearby',
      'Has a specific sector in mind',
      'Open to Sohna / New Gurgaon for a better deal',
    ],
  },
  {
    key: 'affordable_housing_familiarity',
    label: 'Familiarity with how affordable housing works in Haryana',
    options: [
      "Not really — has heard the term but doesn't know the rules",
      "Somewhat — knows it's government-regulated and price-capped",
      'Pretty well — knows AHP, the draw process, DDJAY, lock-in etc.',
    ],
  },
  {
    key: 'frustrations',
    label: 'Biggest frustrations in the home search so far',
    list: true,
    options: [
      'Builders asking for cash / undisclosed charges over the fixed price',
      'Worried about possession delays in under-construction projects',
      'Broker misinformation or pressure to close quickly',
      'The draw-of-lots process feels opaque or unfair',
      'Confusion about home-loan eligibility or down payment',
      'Hard to compare quality and amenities across societies',
      'Concerned about resale restrictions / lock-in period',
    ],
  },
  {
    key: 'booking_blocker',
    label: 'The single thing stopping them from booking today',
    options: [
      'Still sorting out the home loan / down payment',
      "Hasn't found the right project yet",
      'Family / spouse not aligned yet',
      "Doesn't fully trust any builder yet",
      'Waiting for a specific launch or policy update',
      'Nothing — just needs the right nudge',
    ],
  },
  {
    key: 'move_in_timeline',
    label: 'When they hope to move in / close',
    options: ['As soon as possible', 'Within 6 months', 'Within a year', '2+ years away'],
  },
  {
    key: 'sentiment',
    label: 'Buyer temperature — how likely they are to convert soon',
    sentiment: true,
  },
  { key: 'open_feedback', label: 'Anything else notable the buyer said' },
  { key: 'persona_summary', label: 'Buyer persona' },
  { key: 'sales_recommendation', label: 'Recommended next step for the rep' },
];

// Legacy export — defaults to the engagement set so any old import keeps
// working without behavioural change.
export const DEFAULT_QUESTIONS = ENGAGEMENT_QUESTIONS;

export function getQuestionsForType(type) {
  if (type === 'visit') return VISIT_QUESTIONS;
  if (type === 'onboarding') return ONBOARDING_QUESTIONS;
  if (type === 'call') return CALL_QUESTIONS;
  return ENGAGEMENT_QUESTIONS;
}

export const MEETING_TYPES = [
  { value: 'engagement', label: 'Engagement meeting', description: 'CP working-relationship conversation' },
  { value: 'visit', label: 'Site visit assessment', description: 'Buyer at-site qualification (BVA)' },
  { value: 'onboarding', label: 'CP onboarding pitch', description: 'Pitch to a prospective CP (not yet onboarded)' },
];
