// Supply-side analytics — pure SQL aggregations over sales_visits + their AI
// `summary` JSON (the field-visit equivalent of lib/analytics.js for demand).
// Free, instant, no Claude. Powers the Supply Insights tier-1 tabs.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

function sinceISO(periodDays) {
  if (!periodDays || periodDays <= 0) return null;
  return new Date(Date.now() - periodDays * 86400000).toISOString();
}

function filters(periodDays, opts = {}) {
  let since = null;
  if (opts.since) since = new Date(opts.since).toISOString();
  else if (periodDays > 0) since = sinceISO(periodDays);
  const until = opts.until ? new Date(opts.until).toISOString() : null;
  const rmId = opts.rmId || null;
  return { since, until, rmId };
}

// Distribution of one summary string field (e.g. cp_sentiment, onboarding_stage).
async function arrayThemes(key, since, until, rmId) {
  const rows = await sql`
    SELECT val AS label, count(*)::int AS n
    FROM sales_visits
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(summary->${key}) = 'array' THEN summary->${key} ELSE '[]'::jsonb END
    ) AS val
    WHERE status = 'ready' AND summary IS NOT NULL
      AND (${since}::timestamptz IS NULL OR check_in_time >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR check_in_time <= ${until}::timestamptz)
      AND (${rmId}::uuid IS NULL OR sales_rm_id = ${rmId}::uuid)
    GROUP BY val ORDER BY n DESC LIMIT 12
  `;
  return rows.map((r) => ({ label: r.label, n: r.n }));
}

export async function supplyInsightsData(periodDays = 90, opts = {}) {
  const { since, until, rmId } = filters(periodDays, opts);

  const [agg] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE meeting_outcome = 'onboarded')::int AS onboarded,
      count(*) FILTER (WHERE meeting_outcome = 'follow_up_required')::int AS follow_up,
      count(*) FILTER (WHERE meeting_outcome = 'not_interested')::int AS not_interested,
      count(*) FILTER (WHERE meeting_outcome = 'future_potential')::int AS future_potential,
      count(*) FILTER (WHERE meeting_type = 'first_visit')::int AS first_visits,
      count(*) FILTER (WHERE meeting_type = 'repeat_visit')::int AS repeat_visits,
      count(*) FILTER (WHERE inventory_received = true)::int AS inventory_received,
      coalesce(sum(inventory_pipeline_count), 0)::int AS inventory_units,
      count(DISTINCT cp_code)::int AS partners,
      count(DISTINCT sales_rm_id)::int AS active_reps,
      round(avg(NULLIF(duration_seconds, 0)))::int AS avg_duration,
      count(*) FILTER (WHERE cp_engagement_level = 'positive')::int AS eng_positive,
      count(*) FILTER (WHERE cp_engagement_level = 'neutral')::int AS eng_neutral,
      count(*) FILTER (WHERE cp_engagement_level = 'disengaged')::int AS eng_disengaged,
      count(*) FILTER (WHERE summary->>'cp_sentiment' = 'positive')::int AS sent_positive,
      count(*) FILTER (WHERE summary->>'cp_sentiment' = 'neutral')::int AS sent_neutral,
      count(*) FILTER (WHERE summary->>'cp_sentiment' = 'disengaged')::int AS sent_disengaged,
      count(*) FILTER (WHERE summary->>'onboarding_stage' = 'not_interested')::int AS stage_not_interested,
      count(*) FILTER (WHERE summary->>'onboarding_stage' = 'evaluating')::int AS stage_evaluating,
      count(*) FILTER (WHERE summary->>'onboarding_stage' = 'ready_to_onboard')::int AS stage_ready,
      count(*) FILTER (WHERE summary->>'onboarding_stage' = 'onboarded')::int AS stage_onboarded
    FROM sales_visits
    WHERE status = 'ready'
      AND (${since}::timestamptz IS NULL OR check_in_time >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR check_in_time <= ${until}::timestamptz)
      AND (${rmId}::uuid IS NULL OR sales_rm_id = ${rmId}::uuid)
  `;

  const volumeByWeek = await sql`
    SELECT to_char(date_trunc('week', check_in_time), 'YYYY-MM-DD') AS week, count(*)::int AS n
    FROM sales_visits
    WHERE status = 'ready'
      AND (${since}::timestamptz IS NULL OR check_in_time >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR check_in_time <= ${until}::timestamptz)
      AND (${rmId}::uuid IS NULL OR sales_rm_id = ${rmId}::uuid)
    GROUP BY 1 ORDER BY 1
  `;

  const leaderboard = await sql`
    SELECT u.id, u.name, u.email, u.image,
           count(*)::int AS visits,
           count(*) FILTER (WHERE v.meeting_outcome = 'onboarded')::int AS onboarded,
           count(DISTINCT v.cp_code)::int AS partners
    FROM sales_visits v JOIN users u ON u.id = v.sales_rm_id
    WHERE v.status = 'ready'
      AND (${since}::timestamptz IS NULL OR v.check_in_time >= ${since}::timestamptz)
      AND (${until}::timestamptz IS NULL OR v.check_in_time <= ${until}::timestamptz)
    GROUP BY u.id, u.name, u.email, u.image
    ORDER BY visits DESC LIMIT 15
  `;

  const [objections, needs, competitive] = await Promise.all([
    arrayThemes('objections', since, until, rmId),
    arrayThemes('cp_needs', since, until, rmId),
    arrayThemes('commitments', since, until, rmId),
  ]);

  return {
    agg: agg || {},
    volumeByWeek,
    leaderboard,
    themes: { objections, needs, commitments: competitive },
  };
}
