// Tier 1 analytics — pure SQL aggregations over the structured `summary` JSON.
// Free, instant, runs anytime. No Claude, no ElevenLabs. Covers the cleanly
// typed fields: lead score + classification, the 12 score parameters (visit
// funnel), sentiment, meeting volume, RM leaderboards.
//
// The messy free-text dimensions (societies, budgets, objection themes) are
// handled by the Claude tier in lib/insightsClaude.js.

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// periodDays === 0 → all time. Otherwise a rolling window ending now.
function sinceClause(periodDays) {
  if (!periodDays || periodDays <= 0) return null;
  return new Date(Date.now() - periodDays * 86400000).toISOString();
}

// The 12 score parameters, in funnel display order — keys match lib/scoring.js.
const SCORE_PARAMS = [
  ['time_15_plus', 'Spent 15+ minutes'],
  ['shared_requirement', 'Shared exact requirement'],
  ['deep_buying_questions', 'Asked deep buying questions'],
  ['society_tour', 'Society tour taken'],
  ['clubhouse_tour', 'Clubhouse tour taken'],
  ['positive_unit_feedback', 'Positive unit feedback'],
  ['compared_societies', 'Compared other societies'],
  ['family_involvement', 'Family involvement'],
  ['loan_payment_discussion', 'Loan / payment discussed'],
  ['revisit_mention', 'Revisit mentioned'],
  ['negotiation', 'Negotiation discussed'],
  ['immediate_closure', 'Immediate closure intent'],
];

export async function getVisitMetrics(periodDays = 90) {
  const since = sinceClause(periodDays);
  // One combined pass: headline counts + score + all 12 funnel parameters.
  const [r] = since
    ? await sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE summary->'score'->>'classification' = 'hot')::int AS hot,
          count(*) FILTER (WHERE summary->'score'->>'classification' = 'warm')::int AS warm,
          count(*) FILTER (WHERE summary->'score'->>'classification' = 'cold')::int AS cold,
          round(avg((summary->'score'->>'total')::numeric), 1) AS avg_score,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'time_15_plus'->>'met' = 'true')::int AS p_time_15_plus,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'shared_requirement'->>'met' = 'true')::int AS p_shared_requirement,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'deep_buying_questions'->>'met' = 'true')::int AS p_deep_buying_questions,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'society_tour'->>'met' = 'true')::int AS p_society_tour,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'clubhouse_tour'->>'met' = 'true')::int AS p_clubhouse_tour,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'positive_unit_feedback'->>'met' = 'true')::int AS p_positive_unit_feedback,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'compared_societies'->>'met' = 'true')::int AS p_compared_societies,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'family_involvement'->>'met' = 'true')::int AS p_family_involvement,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'loan_payment_discussion'->>'met' = 'true')::int AS p_loan_payment_discussion,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'revisit_mention'->>'met' = 'true')::int AS p_revisit_mention,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'negotiation'->>'met' = 'true')::int AS p_negotiation,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'immediate_closure'->>'met' = 'true')::int AS p_immediate_closure
        FROM meetings
        WHERE meeting_type = 'visit' AND status = 'ready' AND summary IS NOT NULL AND started_at >= ${since}`
    : await sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE summary->'score'->>'classification' = 'hot')::int AS hot,
          count(*) FILTER (WHERE summary->'score'->>'classification' = 'warm')::int AS warm,
          count(*) FILTER (WHERE summary->'score'->>'classification' = 'cold')::int AS cold,
          round(avg((summary->'score'->>'total')::numeric), 1) AS avg_score,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'time_15_plus'->>'met' = 'true')::int AS p_time_15_plus,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'shared_requirement'->>'met' = 'true')::int AS p_shared_requirement,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'deep_buying_questions'->>'met' = 'true')::int AS p_deep_buying_questions,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'society_tour'->>'met' = 'true')::int AS p_society_tour,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'clubhouse_tour'->>'met' = 'true')::int AS p_clubhouse_tour,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'positive_unit_feedback'->>'met' = 'true')::int AS p_positive_unit_feedback,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'compared_societies'->>'met' = 'true')::int AS p_compared_societies,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'family_involvement'->>'met' = 'true')::int AS p_family_involvement,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'loan_payment_discussion'->>'met' = 'true')::int AS p_loan_payment_discussion,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'revisit_mention'->>'met' = 'true')::int AS p_revisit_mention,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'negotiation'->>'met' = 'true')::int AS p_negotiation,
          count(*) FILTER (WHERE summary->'score'->'parameters'->'immediate_closure'->>'met' = 'true')::int AS p_immediate_closure
        FROM meetings
        WHERE meeting_type = 'visit' AND status = 'ready' AND summary IS NOT NULL`;

  const funnel = SCORE_PARAMS.map(([key, label]) => {
    const met = r[`p_${key}`] || 0;
    return { key, label, met, total: r.total, pct: r.total ? Math.round((met / r.total) * 100) : 0 };
  });

  return {
    total: r.total,
    byClassification: { hot: r.hot, warm: r.warm, cold: r.cold },
    avgScore: r.avg_score != null ? Number(r.avg_score) : null,
    immediateBuyers: r.p_immediate_closure,
    funnel,
    volumeByWeek: await weeklyVolume('visit', periodDays),
    topRms: await topRmsByScore(periodDays),
  };
}

export async function getEngagementMetrics(periodDays = 90) {
  const since = sinceClause(periodDays);
  const [agg] = since
    ? await sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE coalesce(summary->'engagement'->>'sentiment', summary->>'sentiment') = 'hot')::int AS hot,
          count(*) FILTER (WHERE coalesce(summary->'engagement'->>'sentiment', summary->>'sentiment') = 'warm')::int AS warm,
          count(*) FILTER (WHERE coalesce(summary->'engagement'->>'sentiment', summary->>'sentiment') = 'cold')::int AS cold
        FROM meetings
        WHERE meeting_type = 'engagement' AND status = 'ready' AND summary IS NOT NULL AND started_at >= ${since}`
    : await sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE coalesce(summary->'engagement'->>'sentiment', summary->>'sentiment') = 'hot')::int AS hot,
          count(*) FILTER (WHERE coalesce(summary->'engagement'->>'sentiment', summary->>'sentiment') = 'warm')::int AS warm,
          count(*) FILTER (WHERE coalesce(summary->'engagement'->>'sentiment', summary->>'sentiment') = 'cold')::int AS cold
        FROM meetings
        WHERE meeting_type = 'engagement' AND status = 'ready' AND summary IS NOT NULL`;

  return {
    total: agg.total,
    bySentiment: { hot: agg.hot, warm: agg.warm, cold: agg.cold },
    volumeByWeek: await weeklyVolume('engagement', periodDays),
    topRms: await topRmsByVolume('engagement', periodDays),
  };
}

export async function getOnboardingMetrics(periodDays = 90) {
  const since = sinceClause(periodDays);
  const [agg] = since
    ? await sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE lower(coalesce(summary->'onboarding'->>'onboarding_status','')) ~ '(will join|joined|agreed|signed)')::int AS will_join,
          count(*) FILTER (WHERE lower(coalesce(summary->'onboarding'->>'onboarding_status','')) ~ '(declin|not interest|rejected)')::int AS declined
        FROM meetings
        WHERE meeting_type = 'onboarding' AND status = 'ready' AND summary IS NOT NULL AND started_at >= ${since}`
    : await sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE lower(coalesce(summary->'onboarding'->>'onboarding_status','')) ~ '(will join|joined|agreed|signed)')::int AS will_join,
          count(*) FILTER (WHERE lower(coalesce(summary->'onboarding'->>'onboarding_status','')) ~ '(declin|not interest|rejected)')::int AS declined
        FROM meetings
        WHERE meeting_type = 'onboarding' AND status = 'ready' AND summary IS NOT NULL`;

  const undecided = Math.max(0, agg.total - agg.will_join - agg.declined);
  return {
    total: agg.total,
    outcomeFunnel: { willJoin: agg.will_join, undecided, declined: agg.declined },
    conversionPct: agg.total ? Math.round((agg.will_join / agg.total) * 100) : 0,
    volumeByWeek: await weeklyVolume('onboarding', periodDays),
  };
}

// Ranked CPs that need attention — recorded visits dropped month-on-month.
// Joins cp_visits (gsheet counts) with cp_assignments for the RM name.
// rmId !== null → scope to only that RM's assigned CPs.
export async function getCpFocusList(limit = 15, rmId = null) {
  const rows = rmId
    ? await sql`
        WITH visit_counts AS (
          SELECT cp_code,
                 count(*) FILTER (WHERE visited_at >= now() - interval '30 days')::int AS last_30,
                 count(*) FILTER (WHERE visited_at >= now() - interval '60 days'
                                  AND visited_at < now() - interval '30 days')::int AS prev_30
          FROM cp_visits GROUP BY cp_code
        )
        SELECT a.cp_code, u.name AS rm_name,
               coalesce(vc.last_30, 0) AS last_30,
               coalesce(vc.prev_30, 0) AS prev_30
        FROM cp_assignments a
        LEFT JOIN users u ON u.id = a.rm_id
        LEFT JOIN visit_counts vc ON vc.cp_code = a.cp_code
        WHERE coalesce(vc.prev_30, 0) > 0 AND a.rm_id = ${rmId}
        ORDER BY (coalesce(vc.prev_30,0) - coalesce(vc.last_30,0)) DESC
        LIMIT ${limit}`
    : await sql`
        WITH visit_counts AS (
          SELECT cp_code,
                 count(*) FILTER (WHERE visited_at >= now() - interval '30 days')::int AS last_30,
                 count(*) FILTER (WHERE visited_at >= now() - interval '60 days'
                                  AND visited_at < now() - interval '30 days')::int AS prev_30
          FROM cp_visits GROUP BY cp_code
        )
        SELECT a.cp_code, u.name AS rm_name,
               coalesce(vc.last_30, 0) AS last_30,
               coalesce(vc.prev_30, 0) AS prev_30
        FROM cp_assignments a
        LEFT JOIN users u ON u.id = a.rm_id
        LEFT JOIN visit_counts vc ON vc.cp_code = a.cp_code
        WHERE coalesce(vc.prev_30, 0) > 0
        ORDER BY (coalesce(vc.prev_30,0) - coalesce(vc.last_30,0)) DESC
        LIMIT ${limit}`;
  return rows
    .map((r) => ({
      cp_code: r.cp_code,
      rm_name: r.rm_name,
      last_30: r.last_30,
      prev_30: r.prev_30,
      drop: r.prev_30 - r.last_30,
      reason:
        r.last_30 === 0
          ? `Went silent — ${r.prev_30} visits the prior month, 0 now`
          : `Visits fell ${r.prev_30}→${r.last_30} month-on-month`,
    }))
    .filter((r) => r.drop > 0);
}

async function weeklyVolume(meetingType, periodDays) {
  const since = sinceClause(periodDays) || sinceClause(84); // default last 12 weeks
  return sql`
    SELECT to_char(date_trunc('week', started_at), 'YYYY-MM-DD') AS week,
           count(*)::int AS n
    FROM meetings
    WHERE meeting_type = ${meetingType} AND status = 'ready' AND started_at >= ${since}
    GROUP BY 1 ORDER BY 1
  `;
}

async function topRmsByScore(periodDays) {
  const since = sinceClause(periodDays);
  return since
    ? sql`
        SELECT u.name AS rm_name,
               count(*)::int AS visits,
               round(avg((m.summary->'score'->>'total')::numeric), 1) AS avg_score
        FROM meetings m JOIN users u ON u.id = m.rm_id
        WHERE m.meeting_type = 'visit' AND m.status = 'ready' AND m.summary IS NOT NULL
          AND m.started_at >= ${since}
        GROUP BY u.name ORDER BY visits DESC LIMIT 10`
    : sql`
        SELECT u.name AS rm_name,
               count(*)::int AS visits,
               round(avg((m.summary->'score'->>'total')::numeric), 1) AS avg_score
        FROM meetings m JOIN users u ON u.id = m.rm_id
        WHERE m.meeting_type = 'visit' AND m.status = 'ready' AND m.summary IS NOT NULL
        GROUP BY u.name ORDER BY visits DESC LIMIT 10`;
}

async function topRmsByVolume(meetingType, periodDays) {
  const since = sinceClause(periodDays);
  return since
    ? sql`
        SELECT u.name AS rm_name, count(*)::int AS meetings
        FROM meetings m JOIN users u ON u.id = m.rm_id
        WHERE m.meeting_type = ${meetingType} AND m.status = 'ready' AND m.started_at >= ${since}
        GROUP BY u.name ORDER BY meetings DESC LIMIT 10`
    : sql`
        SELECT u.name AS rm_name, count(*)::int AS meetings
        FROM meetings m JOIN users u ON u.id = m.rm_id
        WHERE m.meeting_type = ${meetingType} AND m.status = 'ready'
        GROUP BY u.name ORDER BY meetings DESC LIMIT 10`;
}
