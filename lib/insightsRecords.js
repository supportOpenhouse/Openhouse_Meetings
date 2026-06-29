import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// The meeting rows behind a Tier-1 insights stat. One unified query serves the
// drill-down modal (lean fields, limited) and the CSV export (rich fields, all
// rows) so they ALWAYS agree on which meetings a stat contains.
//
// opts:
//   type        — visit | engagement | onboarding | call   (ignored when ids set)
//   temp        — hot | warm | cold
//   param       — visit score parameter key (immediate_closure, society_tour …)
//   outcome     — will_join | declined | undecided  (onboarding)
//   callField/callValue — direct-call survey field + value
//   since/until — ISO timestamps;  rmId — uuid
//   ids         — explicit meeting uuids (AI insight citations); skips filters
//   limit       — number, or null for all rows
export async function fetchInsightRecords(opts = {}) {
  const {
    type = null, temp = null, param = null, outcome = null,
    callField = null, callValue = null, since = null, until = null,
    rmId = null, ids = null, limit = null,
  } = opts;

  const idArr = Array.isArray(ids) && ids.length ? ids : null;

  return sql`
    SELECT m.id, m.cp_code, m.cp_name, m.cp_mobile, m.cp_city, m.started_at, m.created_at,
           m.duration_seconds, m.meeting_type, m.language, m.status, m.audio_url, m.purpose,
           m.summary, u.name AS rm_name, u.email AS rm_email
    FROM meetings m
    LEFT JOIN users u ON u.id = m.rm_id
    WHERE m.status = 'ready' AND m.summary IS NOT NULL
      AND (${idArr}::uuid[] IS NULL OR m.id = ANY(${idArr}::uuid[]))
      AND (${idArr}::uuid[] IS NOT NULL OR (
            m.meeting_type = ${type}::text
            AND (${since}::timestamptz IS NULL OR m.started_at >= ${since}::timestamptz)
            AND (${until}::timestamptz IS NULL OR m.started_at <= ${until}::timestamptz)
            AND (${rmId}::uuid IS NULL OR m.rm_id = ${rmId}::uuid)
            AND (${temp}::text IS NULL OR CASE ${type}::text
                   WHEN 'visit'      THEN m.summary->'score'->>'classification'
                   WHEN 'engagement' THEN coalesce(m.summary->'engagement'->>'sentiment', m.summary->>'sentiment')
                   WHEN 'call'       THEN m.summary->'call'->>'sentiment'
                   ELSE NULL END = ${temp}::text)
            AND (${param}::text IS NULL
                 OR m.summary->'score'->'parameters'->${param}::text->>'met' = 'true')
            AND (${outcome}::text IS NULL OR CASE ${outcome}::text
                   WHEN 'will_join' THEN lower(coalesce(m.summary->'onboarding'->>'onboarding_status','')) ~ '(will join|joined|agreed|signed)'
                   WHEN 'declined'  THEN lower(coalesce(m.summary->'onboarding'->>'onboarding_status','')) ~ '(declin|not interest|rejected)'
                   WHEN 'undecided' THEN NOT (lower(coalesce(m.summary->'onboarding'->>'onboarding_status','')) ~ '(will join|joined|agreed|signed|declin|not interest|rejected)')
                   ELSE true END)
            AND (${callField}::text IS NULL OR ${callValue}::text IS NULL
                 OR CASE WHEN jsonb_typeof(m.summary->'call'->${callField}::text) = 'array'
                         THEN m.summary->'call'->${callField}::text @> to_jsonb(${callValue}::text)
                         ELSE m.summary->'call'->>${callField}::text = ${callValue}::text END)
      ))
    ORDER BY m.started_at DESC
    LIMIT ${limit}
  `;
}

// Lean projection for the drill-down modal (keeps the JSON response small).
export function toModalRow(m) {
  return {
    id: m.id,
    cp_code: m.cp_code,
    cp_name: m.cp_name,
    cp_mobile: m.cp_mobile,
    cp_city: m.cp_city,
    started_at: m.started_at,
    duration_seconds: m.duration_seconds,
    meeting_type: m.meeting_type,
    rm_name: m.rm_name,
  };
}
