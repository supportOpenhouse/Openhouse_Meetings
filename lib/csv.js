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

export function meetingCsvRow(m, { funnel = false } = {}) {
  const s = m.summary || {};
  const sentiment =
    s.score?.classification || s.engagement?.sentiment || s.call?.sentiment ||
    s.sentiment || s.onboarding?.onboarding_status || '';
  const rollup = [
    s.key_topics && `Topics: ${s.key_topics}`,
    s.cp_requirements && `Needs: ${s.cp_requirements}`,
    s.next_action && `Next: ${s.next_action}`,
  ].filter(Boolean).join(' · ');

  const base = [
    toIsoDate(m.started_at), m.cp_code || '', m.cp_name || '', m.cp_mobile || '', m.cp_city || '',
    m.rm_name || '', m.rm_email || '', fmtDuration(m.duration_seconds || 0), m.duration_seconds || 0,
    m.meeting_type || '', m.status || '', sentiment, s.score?.total ?? '',
    rollup, s.key_topics || '', s.cp_requirements || '', s.properties_discussed || '', s.budget || '',
    listOrString(s.objections), listOrString(s.commitments), s.next_action || '', s.follow_up_date || '',
    m.audio_url || '',
  ];
  if (!funnel) return base;
  const params = s.score?.parameters || {};
  return [...base, ...FUNNEL_STEPS.map((f) => (params[f.key]?.met === 'true' ? 'Yes' : 'No'))];
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
