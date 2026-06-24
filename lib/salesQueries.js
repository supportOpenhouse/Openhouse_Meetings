import { db } from '@/lib/db';
import { salesChannelPartners, salesVisits, salesInventory, users } from '@/drizzle/schema';
import { eq, and, desc, or, ilike, gte, lte, sql, inArray } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Channel partners (the sales CP registry — shared across sales reps)
// ─────────────────────────────────────────────────────────────────────────────

// Next human-readable CP code: SCP001, SCP002, … Computed from the max numeric
// suffix already in the table. The unique index on cp_id is the real guard; a
// rare race just retries server-side.
export async function nextCpId() {
  const [row] = await db
    .select({
      maxNum: sql`coalesce(max(nullif(regexp_replace(${salesChannelPartners.cp_id}, '\\D', '', 'g'), '')::int), 0)`.mapWith(
        Number
      ),
    })
    .from(salesChannelPartners);
  const n = (row?.maxNum || 0) + 1;
  return `SCP${String(n).padStart(3, '0')}`;
}

// List view — lean projection plus visit count / last-visit per CP. Never ships
// the heavy jsonb we don't need in a list.
export async function listSalesCps({ search } = {}) {
  const conds = [eq(salesChannelPartners.is_active, true)];
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    conds.push(
      or(
        ilike(salesChannelPartners.cp_name, s),
        ilike(salesChannelPartners.phone_primary, s),
        ilike(salesChannelPartners.cp_id, s)
      )
    );
  }

  return db
    .select({
      id: salesChannelPartners.id,
      cp_id: salesChannelPartners.cp_id,
      cp_name: salesChannelPartners.cp_name,
      phone_primary: salesChannelPartners.phone_primary,
      primary_business: salesChannelPartners.primary_business,
      societies: salesChannelPartners.societies,
      office_address: salesChannelPartners.office_address,
      created_at: salesChannelPartners.created_at,
      visit_count:
        sql`(select count(*) from sales_visits sv where sv.sales_cp_id = sales_channel_partners.id)`.mapWith(
          Number
        ),
      last_visit_at: sql`(select max(sv.check_in_time) from sales_visits sv where sv.sales_cp_id = sales_channel_partners.id)`,
    })
    .from(salesChannelPartners)
    .where(and(...conds))
    .orderBy(desc(salesChannelPartners.created_at));
}

export async function getSalesCpById(id) {
  const [cp] = await db
    .select()
    .from(salesChannelPartners)
    .where(eq(salesChannelPartners.id, id));
  return cp;
}

export async function getSalesCpByCode(code) {
  const [cp] = await db
    .select()
    .from(salesChannelPartners)
    .where(eq(salesChannelPartners.cp_id, code));
  return cp;
}

export async function insertSalesCp(data) {
  const [cp] = await db.insert(salesChannelPartners).values(data).returning();
  return cp;
}

export async function updateSalesCp(id, patch) {
  const [cp] = await db
    .update(salesChannelPartners)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(salesChannelPartners.id, id))
    .returning();
  return cp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Visits (the on-site visit log + audio pipeline)
// ─────────────────────────────────────────────────────────────────────────────

// Lean projection for list/card views — deliberately excludes transcript_text
// and transcript_words (which can be large). summary jsonb is small enough to
// keep so cards can show a headline.
const VISIT_LIST_COLUMNS = {
  id: salesVisits.id,
  sales_rm_id: salesVisits.sales_rm_id,
  sales_cp_id: salesVisits.sales_cp_id,
  cp_code: salesVisits.cp_code,
  cp_name: salesVisits.cp_name,
  meeting_type: salesVisits.meeting_type,
  check_in_time: salesVisits.check_in_time,
  duration_seconds: salesVisits.duration_seconds,
  cp_engagement_level: salesVisits.cp_engagement_level,
  meeting_outcome: salesVisits.meeting_outcome,
  inventory_received: salesVisits.inventory_received,
  next_followup_date: salesVisits.next_followup_date,
  next_action_required: salesVisits.next_action_required,
  status: salesVisits.status,
  error_message: salesVisits.error_message,
  summary: salesVisits.summary,
  created_at: salesVisits.created_at,
};

export async function listSalesVisits({ rmId, cpId, status, since, until, limit } = {}) {
  const conds = [];
  if (rmId) conds.push(eq(salesVisits.sales_rm_id, rmId));
  if (cpId) conds.push(eq(salesVisits.sales_cp_id, cpId));
  if (status) conds.push(eq(salesVisits.status, status));
  if (since) conds.push(gte(salesVisits.check_in_time, since));
  if (until) conds.push(lte(salesVisits.check_in_time, until));

  let q = db
    .select(VISIT_LIST_COLUMNS)
    .from(salesVisits)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(salesVisits.check_in_time));
  if (limit) q = q.limit(limit);
  return q;
}

export async function getSalesVisitById(id) {
  const [v] = await db.select().from(salesVisits).where(eq(salesVisits.id, id));
  return v;
}

// Minimal projection for the background processor.
export async function getSalesVisitForProcessing(id) {
  const [v] = await db
    .select({
      id: salesVisits.id,
      sales_rm_id: salesVisits.sales_rm_id,
      cp_code: salesVisits.cp_code,
      cp_name: salesVisits.cp_name,
      meeting_type: salesVisits.meeting_type,
      key_discussion_points: salesVisits.key_discussion_points,
      audio_url: salesVisits.audio_url,
      status: salesVisits.status,
      duration_seconds: salesVisits.duration_seconds,
    })
    .from(salesVisits)
    .where(eq(salesVisits.id, id));
  return v;
}

export async function insertSalesVisit(data) {
  const [v] = await db.insert(salesVisits).values(data).returning();
  return v;
}

export async function updateSalesVisit(id, patch) {
  const [v] = await db
    .update(salesVisits)
    .set(patch)
    .where(eq(salesVisits.id, id))
    .returning();
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard rollup for a single sales rep
// ─────────────────────────────────────────────────────────────────────────────

export async function salesDashboardData(rmId) {
  // Day boundaries are computed in IST (Asia/Kolkata, UTC+5:30, no DST): the
  // field-sales team operates in India, so a UTC midnight boundary would put
  // the day rollover at 05:30 IST and make "today" wrong for ~5.5h each day.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const ist = new Date(nowMs + IST_OFFSET_MS);
  const istY = ist.getUTCFullYear();
  const istM = ist.getUTCMonth();
  const istD = ist.getUTCDate();
  // IST local midnight, expressed as the equivalent UTC instant.
  const startOfDay = new Date(Date.UTC(istY, istM, istD) - IST_OFFSET_MS);
  const weekAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${istY}-${pad(istM + 1)}-${pad(istD)}`;

  const [counts] = await db
    .select({
      today_count: sql`count(*) filter (where ${salesVisits.check_in_time} >= ${startOfDay.toISOString()}::timestamptz)::int`,
      week_count: sql`count(*) filter (where ${salesVisits.check_in_time} >= ${weekAgo.toISOString()}::timestamptz)::int`,
      total_count: sql`count(*)::int`,
    })
    .from(salesVisits)
    .where(eq(salesVisits.sales_rm_id, rmId));

  const [cpCount] = await db
    .select({ n: sql`count(*)::int` })
    .from(salesChannelPartners)
    .where(eq(salesChannelPartners.is_active, true));

  // Visits this rep logged that are due for a follow-up today or earlier and
  // were flagged as needing one. Most recent due date first.
  const followups = await db
    .select({
      id: salesVisits.id,
      sales_cp_id: salesVisits.sales_cp_id,
      cp_code: salesVisits.cp_code,
      cp_name: salesVisits.cp_name,
      next_followup_date: salesVisits.next_followup_date,
      next_action_required: salesVisits.next_action_required,
    })
    .from(salesVisits)
    .where(
      and(
        eq(salesVisits.sales_rm_id, rmId),
        sql`${salesVisits.next_followup_date} is not null`,
        lte(salesVisits.next_followup_date, todayStr)
      )
    )
    .orderBy(desc(salesVisits.next_followup_date))
    .limit(25);

  const today = await listSalesVisits({ rmId, since: startOfDay, limit: 20 });

  return {
    stats: {
      today: counts?.today_count || 0,
      week: counts?.week_count || 0,
      total: counts?.total_count || 0,
      cps: cpCount?.n || 0,
    },
    today,
    followups,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin oversight (read-only aggregates across all reps)
// ─────────────────────────────────────────────────────────────────────────────

// Per-rep performance roll-up. Visit/onboarded/CP counts come from correlated
// subqueries so this stays a single round-trip.
export async function listSalesReps() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      is_active: users.is_active,
      visit_count:
        sql`(select count(*) from sales_visits sv where sv.sales_rm_id = users.id)`.mapWith(Number),
      onboarded_count:
        sql`(select count(*) from sales_visits sv where sv.sales_rm_id = users.id and sv.meeting_outcome = 'onboarded')`.mapWith(
          Number
        ),
      cps_registered:
        sql`(select count(*) from sales_channel_partners cp where cp.created_by = users.id)`.mapWith(
          Number
        ),
      last_visit_at: sql`(select max(sv.check_in_time) from sales_visits sv where sv.sales_rm_id = users.id)`,
    })
    .from(users)
    .where(eq(users.role, 'sales_rm'))
    .orderBy(desc(sql`(select count(*) from sales_visits sv where sv.sales_rm_id = users.id)`));
}

// All sales visits across every rep, with the rep's name joined on. Lean
// projection (no transcript) — admin table + client-side filtering.
export async function listAllSalesVisits({ rmId, status, outcome, since, until, limit = 500 } = {}) {
  const conds = [];
  if (rmId && rmId !== 'all') conds.push(eq(salesVisits.sales_rm_id, rmId));
  if (status && status !== 'all') conds.push(eq(salesVisits.status, status));
  if (outcome && outcome !== 'all') conds.push(eq(salesVisits.meeting_outcome, outcome));
  if (since) conds.push(gte(salesVisits.check_in_time, since));
  if (until) conds.push(lte(salesVisits.check_in_time, until));

  return db
    .select({
      ...VISIT_LIST_COLUMNS,
      rm_name: users.name,
      rm_email: users.email,
    })
    .from(salesVisits)
    .leftJoin(users, eq(users.id, salesVisits.sales_rm_id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(salesVisits.check_in_time))
    .limit(limit);
}

// Top-line numbers for the admin sales overview.
export async function salesAdminOverview() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const ist = new Date(nowMs + IST_OFFSET_MS);
  const startOfDay = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  );
  const weekAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);

  const [v] = await db
    .select({
      total: sql`count(*)::int`,
      today: sql`count(*) filter (where ${salesVisits.check_in_time} >= ${startOfDay.toISOString()}::timestamptz)::int`,
      week: sql`count(*) filter (where ${salesVisits.check_in_time} >= ${weekAgo.toISOString()}::timestamptz)::int`,
      onboarded: sql`count(*) filter (where ${salesVisits.meeting_outcome} = 'onboarded')::int`,
      processing: sql`count(*) filter (where ${salesVisits.status} = 'processing')::int`,
    })
    .from(salesVisits);

  const [reps] = await db
    .select({ n: sql`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'sales_rm'));

  const [cps] = await db
    .select({ n: sql`count(*)::int` })
    .from(salesChannelPartners)
    .where(eq(salesChannelPartners.is_active, true));

  const recent = await listAllSalesVisits({ limit: 12 });

  return {
    stats: {
      reps: reps?.n || 0,
      cps: cps?.n || 0,
      visitsToday: v?.today || 0,
      visitsWeek: v?.week || 0,
      visitsTotal: v?.total || 0,
      onboarded: v?.onboarded || 0,
      processing: v?.processing || 0,
    },
    recent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// External-CP keyed helpers — sales data joins on the real cp_code (CP05443…),
// since channel partners now come from the external inventory DB (lib/salesCp).
// ─────────────────────────────────────────────────────────────────────────────

export async function listSalesVisitsByCpCode(cpCode, limit = 50) {
  if (!cpCode) return [];
  return db
    .select(VISIT_LIST_COLUMNS)
    .from(salesVisits)
    .where(eq(salesVisits.cp_code, cpCode))
    .orderBy(desc(salesVisits.check_in_time))
    .limit(limit);
}

// Visit count + last-visit per cp_code, for merging into inventory search results.
export async function cpCodeVisitStats(codes) {
  if (!codes || codes.length === 0) return {};
  const rows = await db
    .select({
      cp_code: salesVisits.cp_code,
      visit_count: sql`count(*)::int`,
      last_visit_at: sql`max(${salesVisits.check_in_time})`,
    })
    .from(salesVisits)
    .where(inArray(salesVisits.cp_code, codes))
    .groupBy(salesVisits.cp_code);
  const map = {};
  for (const r of rows) {
    map[r.cp_code] = { visit_count: r.visit_count, last_visit_at: r.last_visit_at };
  }
  return map;
}

// Partners this rep has logged visits with — the default "recent" list on the
// Partners page (cheap distinct over their own visits).
export async function recentVisitedCpCodes(rmId, limit = 12) {
  return db
    .select({
      cp_code: salesVisits.cp_code,
      cp_name: sql`max(${salesVisits.cp_name})`,
      visit_count: sql`count(*)::int`,
      last_visit_at: sql`max(${salesVisits.check_in_time})`,
    })
    .from(salesVisits)
    .where(and(eq(salesVisits.sales_rm_id, rmId), sql`${salesVisits.cp_code} is not null`))
    .groupBy(salesVisits.cp_code)
    .orderBy(desc(sql`max(${salesVisits.check_in_time})`))
    .limit(limit);
}

export async function listInventoryByCpCode(cpCode, limit = 50) {
  if (!cpCode) return [];
  return db
    .select()
    .from(salesInventory)
    .where(eq(salesInventory.cp_code, cpCode))
    .orderBy(desc(salesInventory.created_at))
    .limit(limit);
}
