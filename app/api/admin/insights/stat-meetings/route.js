import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/insights/stat-meetings
// Returns the actual recording rows behind a Tier-1 stat in the admin
// Insights dashboard, so clicking a number opens the meetings that produced
// it. Same global filters (since/until/rm) the toolbar applies elsewhere.
//
// Required: type ∈ visit | engagement | onboarding | call
// Optional, picks one (or combine) of:
//   temp        — hot | warm | cold (sentiment/classification filter)
//   param       — visit score parameter key (e.g. immediate_closure, society_tour)
//   outcome     — will_join | declined | undecided (onboarding only)
//   call_field  — survey field name (journey_stage, budget, frustrations …)
//   call_value  — the option string to match for the above field
//   limit       — max rows (default 50, max 200)
export async function GET(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const temp = searchParams.get('temp');
  const param = searchParams.get('param');
  const outcome = searchParams.get('outcome');
  const callField = searchParams.get('call_field');
  const callValue = searchParams.get('call_value');
  const since = searchParams.get('since') || null;
  const until = searchParams.get('until') || null;
  const rm = searchParams.get('rm');
  const rmId = rm && rm !== 'all' ? rm : null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

  if (!['visit', 'engagement', 'onboarding', 'call'].includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL);

  // Each meeting type gets its own query — the temperature/outcome paths into
  // the `summary` JSON differ enough that one generic query would be uglier
  // than four targeted ones. All four share the global filter NULL-guards.
  let rows;
  if (type === 'visit') {
    rows = await sql`
      SELECT m.id, m.cp_code, m.cp_name, m.cp_mobile, m.cp_city, m.started_at,
             m.duration_seconds, m.meeting_type, u.name AS rm_name
      FROM meetings m LEFT JOIN users u ON u.id = m.rm_id
      WHERE m.meeting_type = 'visit' AND m.status = 'ready' AND m.summary IS NOT NULL
        AND (${since}::timestamptz IS NULL OR m.started_at >= ${since}::timestamptz)
        AND (${until}::timestamptz IS NULL OR m.started_at <= ${until}::timestamptz)
        AND (${rmId}::uuid IS NULL OR m.rm_id = ${rmId}::uuid)
        AND (${temp}::text IS NULL OR m.summary->'score'->>'classification' = ${temp}::text)
        AND (${param}::text IS NULL
             OR m.summary->'score'->'parameters'->${param}::text->>'met' = 'true')
      ORDER BY m.started_at DESC LIMIT ${limit}
    `;
  } else if (type === 'engagement') {
    rows = await sql`
      SELECT m.id, m.cp_code, m.cp_name, m.cp_mobile, m.cp_city, m.started_at,
             m.duration_seconds, m.meeting_type, u.name AS rm_name
      FROM meetings m LEFT JOIN users u ON u.id = m.rm_id
      WHERE m.meeting_type = 'engagement' AND m.status = 'ready' AND m.summary IS NOT NULL
        AND (${since}::timestamptz IS NULL OR m.started_at >= ${since}::timestamptz)
        AND (${until}::timestamptz IS NULL OR m.started_at <= ${until}::timestamptz)
        AND (${rmId}::uuid IS NULL OR m.rm_id = ${rmId}::uuid)
        AND (${temp}::text IS NULL
             OR coalesce(m.summary->'engagement'->>'sentiment', m.summary->>'sentiment') = ${temp}::text)
      ORDER BY m.started_at DESC LIMIT ${limit}
    `;
  } else if (type === 'onboarding') {
    rows = await sql`
      SELECT m.id, m.cp_code, m.cp_name, m.cp_mobile, m.cp_city, m.started_at,
             m.duration_seconds, m.meeting_type, u.name AS rm_name
      FROM meetings m LEFT JOIN users u ON u.id = m.rm_id
      WHERE m.meeting_type = 'onboarding' AND m.status = 'ready' AND m.summary IS NOT NULL
        AND (${since}::timestamptz IS NULL OR m.started_at >= ${since}::timestamptz)
        AND (${until}::timestamptz IS NULL OR m.started_at <= ${until}::timestamptz)
        AND (${rmId}::uuid IS NULL OR m.rm_id = ${rmId}::uuid)
        AND (${outcome}::text IS NULL OR
             CASE ${outcome}::text
               WHEN 'will_join' THEN lower(coalesce(m.summary->'onboarding'->>'onboarding_status','')) ~ '(will join|joined|agreed|signed)'
               WHEN 'declined'  THEN lower(coalesce(m.summary->'onboarding'->>'onboarding_status','')) ~ '(declin|not interest|rejected)'
               WHEN 'undecided' THEN NOT (lower(coalesce(m.summary->'onboarding'->>'onboarding_status','')) ~ '(will join|joined|agreed|signed|declin|not interest|rejected)')
               ELSE true
             END)
      ORDER BY m.started_at DESC LIMIT ${limit}
    `;
  } else {
    // type === 'call' (direct-RM buyer-survey)
    rows = await sql`
      SELECT m.id, m.cp_code, m.cp_name, m.cp_mobile, m.cp_city, m.started_at,
             m.duration_seconds, m.meeting_type, u.name AS rm_name
      FROM meetings m LEFT JOIN users u ON u.id = m.rm_id
      WHERE m.meeting_type = 'call' AND m.status = 'ready' AND m.summary IS NOT NULL
        AND (${since}::timestamptz IS NULL OR m.started_at >= ${since}::timestamptz)
        AND (${until}::timestamptz IS NULL OR m.started_at <= ${until}::timestamptz)
        AND (${rmId}::uuid IS NULL OR m.rm_id = ${rmId}::uuid)
        AND (${temp}::text IS NULL OR m.summary->'call'->>'sentiment' = ${temp}::text)
        AND (${callField}::text IS NULL OR ${callValue}::text IS NULL
             OR CASE WHEN jsonb_typeof(m.summary->'call'->${callField}::text) = 'array'
                     THEN m.summary->'call'->${callField}::text @> to_jsonb(${callValue}::text)
                     ELSE m.summary->'call'->>${callField}::text = ${callValue}::text END)
      ORDER BY m.started_at DESC LIMIT ${limit}
    `;
  }

  return NextResponse.json({ meetings: rows });
}
