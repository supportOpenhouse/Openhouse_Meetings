import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// The sales_visit rows behind a supply-insights stat. One unified query serves
// the drill-down modal (lean, limited) and the CSV export (rich, all rows), so
// they always agree. Population matches supplyInsightsData: status='ready'.
//
// opts: outcome | stage | sentiment | engagement | meetingType  (stat selectors)
//       since/until (ISO), rmId (uuid), ids (explicit visit uuids), limit (or null)
export async function fetchSupplyVisits(opts = {}) {
  const {
    outcome = null, stage = null, sentiment = null, engagement = null,
    meetingType = null, since = null, until = null, rmId = null,
    ids = null, limit = null,
  } = opts;

  const idArr = Array.isArray(ids) && ids.length ? ids : null;

  return sql`
    SELECT sv.id, sv.cp_code, sv.cp_name, scp.phone_primary AS cp_phone,
           scp.societies->0->>'micromarket' AS cp_city,
           sv.check_in_time, sv.duration_seconds, sv.meeting_type, sv.meeting_outcome,
           sv.cp_engagement_level, sv.inventory_received, sv.inventory_pipeline_count,
           sv.next_followup_date, sv.next_action_required, sv.summary, sv.audio_url, sv.status,
           u.name AS rm_name
    FROM sales_visits sv
    LEFT JOIN sales_channel_partners scp ON scp.id = sv.sales_cp_id
    LEFT JOIN users u ON u.id = sv.sales_rm_id
    WHERE sv.status = 'ready'
      AND (${idArr}::uuid[] IS NULL OR sv.id = ANY(${idArr}::uuid[]))
      AND (${idArr}::uuid[] IS NOT NULL OR (
            (${since}::timestamptz IS NULL OR sv.check_in_time >= ${since}::timestamptz)
            AND (${until}::timestamptz IS NULL OR sv.check_in_time <= ${until}::timestamptz)
            AND (${rmId}::uuid IS NULL OR sv.sales_rm_id = ${rmId}::uuid)
            AND (${outcome}::text IS NULL OR sv.meeting_outcome = ${outcome}::text)
            AND (${stage}::text IS NULL OR sv.summary->>'onboarding_stage' = ${stage}::text)
            AND (${sentiment}::text IS NULL OR sv.summary->>'cp_sentiment' = ${sentiment}::text)
            AND (${engagement}::text IS NULL OR sv.cp_engagement_level = ${engagement}::text)
            AND (${meetingType}::text IS NULL OR sv.meeting_type = ${meetingType}::text)
      ))
    ORDER BY sv.check_in_time DESC
    LIMIT ${limit}
  `;
}

// Lean projection for the drill-down modal.
export function toSupplyModalRow(v) {
  return {
    id: v.id,
    cp_code: v.cp_code,
    cp_name: v.cp_name,
    cp_phone: v.cp_phone,
    check_in_time: v.check_in_time,
    duration_seconds: v.duration_seconds,
    meeting_type: v.meeting_type,
    meeting_outcome: v.meeting_outcome,
    rm_name: v.rm_name,
  };
}
