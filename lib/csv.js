// Shared CSV helpers + row mappers for exports (admin meetings export + the
// insights "download CSV" buttons). Keeps escaping/encoding identical everywhere.
import { fmtDuration } from '@/lib/utils';

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Quote anything with a delimiter, quote, or newline; double internal quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function listOrString(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join(' | ');
  if (v === null || v === undefined) return '';
  return String(v);
}

export function toIsoDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '';
  return dt.toISOString();
}

// Build a downloadable CSV Response. UTF-8 BOM so Excel renders Devanagari etc.
export function csvResponse(filename, headerRow, dataRows) {
  const lines = [headerRow.map(csvCell).join(',')];
  for (const r of dataRows) lines.push(r.map(csvCell).join(','));
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ── Demand meetings (one row per meeting) ───────────────────────────────────
// The 12 on-site visit funnel steps (mirrors SCORE_PARAMS in lib/analytics.js).
export const FUNNEL_STEPS = [
  { key: 'time_15_plus', label: 'Spent 15+ min' },
  { key: 'shared_requirement', label: 'Shared requirement' },
  { key: 'deep_buying_questions', label: 'Deep buying questions' },
  { key: 'society_tour', label: 'Society tour' },
  { key: 'clubhouse_tour', label: 'Clubhouse tour' },
  { key: 'positive_unit_feedback', label: 'Positive unit feedback' },
  { key: 'compared_societies', label: 'Compared societies' },
  { key: 'family_involvement', label: 'Family involvement' },
  { key: 'loan_payment_discussion', label: 'Loan / payment discussed' },
  { key: 'revisit_mention', label: 'Revisit mentioned' },
  { key: 'negotiation', label: 'Negotiation discussed' },
  { key: 'immediate_closure', label: 'Immediate closure intent' },
];

const MEETING_BASE_HEADERS = [
  'Meeting Date', 'CP Code', 'CP Name', 'CP Number', 'City', 'RM', 'RM Email',
  'Duration', 'Duration (s)', 'Meeting Type', 'Status', 'Sentiment', 'Lead Score',
  'AI Summary', 'Key Topics', 'CP Requirements', 'Properties Discussed', 'Budget',
  'Objections', 'Commitments', 'Next Action', 'Follow-up Date', 'Audio URL',
];

export function meetingCsvHeaders({ funnel = false } = {}) {
  return funnel ? [...MEETING_BASE_HEADERS, ...FUNNEL_STEPS.map((f) => f.label)] : MEETING_BASE_HEADERS;
}

// The summary JSON nests its fields under the meeting_type key (summary.visit.*,
// summary.engagement.*, summary.call.*, summary.onboarding.*) and the names vary
// per type. Normalise to one set of columns with per-type fallbacks so no type
// exports blank cells.
export function meetingSummaryFields(s, type) {
  const sub = (s && s[type]) || s?.engagement || s?.visit || s?.call || s?.onboarding || {};
  const pick = (...keys) => {
    for (const k of keys) {
      const v = sub[k];
      if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) return v;
    }
    return '';
  };
  return {
    sentiment: pick('sentiment') || s?.score?.classification || '',
    score: s?.score?.total ?? '',
    keyTopics: pick('key_topics', 'open_feedback', 'persona_summary', 'cp_interest_signals'),
    requirements: pick('cp_requirements', 'configuration', 'size_range', 'location_priorities', 'cp_profile'),
    properties: pick('properties_discussed', 'societies_of_interest', 'societies_explored', 'most_liked_society'),
    budget: pick('budget', 'budget_range'),
    objections: pick('objections', 'objections_raised', 'frustrations'),
    commitments: pick('commitments', 'commitments_made'),
    nextAction: pick('next_action', 'sales_recommendation'),
    followUp: pick('follow_up_date', 'revisit_plan', 'closure_timeline'),
  };
}

export function meetingCsvRow(m, { funnel = false } = {}) {
  const s = m.summary || {};
  const n = meetingSummaryFields(s, m.meeting_type);
  const rollup = [
    n.keyTopics && `Topics: ${listOrString(n.keyTopics)}`,
    n.requirements && `Needs: ${listOrString(n.requirements)}`,
    n.nextAction && `Next: ${listOrString(n.nextAction)}`,
  ].filter(Boolean).join(' · ');

  const base = [
    toIsoDate(m.started_at), m.cp_code || '', m.cp_name || '', m.cp_mobile || '', m.cp_city || '',
    m.rm_name || '', m.rm_email || '', fmtDuration(m.duration_seconds || 0), m.duration_seconds || 0,
    m.meeting_type || '', m.status || '', n.sentiment, n.score,
    rollup, listOrString(n.keyTopics), listOrString(n.requirements), listOrString(n.properties),
    listOrString(n.budget), listOrString(n.objections), listOrString(n.commitments),
    listOrString(n.nextAction), listOrString(n.followUp), m.audio_url || '',
  ];
  if (!funnel) return base;
  const params = s.score?.parameters || {};
  // Funnel param values are stored as booleans (met: true/false).
  return [...base, ...FUNNEL_STEPS.map((f) => (params[f.key]?.met ? 'Yes' : 'No'))];
}

// ── Supply visits (one row per sales_visit) ─────────────────────────────────
const VISIT_HEADERS = [
  'Visit Date', 'CP Code', 'CP Name', 'CP Number', 'City', 'RM', 'Duration',
  'Duration (s)', 'Visit Type', 'Outcome', 'Engagement', 'Onboarding Stage',
  'CP Sentiment', 'Inventory Received', 'Inventory Units', 'AI Summary',
  'Key Points', 'CP Needs', 'Objections', 'Commitments', 'Competitive Intel',
  'Next Action', 'Follow-up Date', 'Audio URL',
];

export function visitCsvHeaders() {
  return VISIT_HEADERS;
}

export function visitCsvRow(v) {
  const s = v.summary || {};
  const rollup = [
    s.headline,
    s.discussion_summary,
  ].filter(Boolean).join(' · ');
  return [
    toIsoDate(v.check_in_time), v.cp_code || '', v.cp_name || '', v.cp_phone || '', v.cp_city || '',
    v.rm_name || '', fmtDuration(v.duration_seconds || 0), v.duration_seconds || 0,
    v.meeting_type || '', v.meeting_outcome || '', v.cp_engagement_level || '',
    s.onboarding_stage || '', s.cp_sentiment || '',
    v.inventory_received ? 'Yes' : 'No', v.inventory_pipeline_count ?? '',
    rollup, listOrString(s.key_points), listOrString(s.cp_needs), listOrString(s.objections),
    listOrString(s.commitments), s.competitive_intel || '',
    v.next_action_required || '', toIsoDate(v.next_followup_date), v.audio_url || '',
  ];
}
