// The sales app's channel partners come from the EXTERNAL "CP inventory" DB
// (lib/cpDb.js → channel_partners + cities), the same source the demand RM
// lookup uses. We never write there. Sales visits/inventory key off the real
// `cp_code` (e.g. CP05443). External rows are mapped into the shape the existing
// sales CP screens already consume, so the UI needs minimal changes.
import { eq, or, ilike, sql } from 'drizzle-orm';
import { cpDb, channelPartners, cities, normalizePhone } from '@/lib/cpDb';
import { normalizeCpCode } from '@/lib/utils';

const SELECT_COLS = {
  cp_code: channelPartners.cp_code,
  name: channelPartners.name,
  phone: channelPartners.phone,
  company: channelPartners.company,
  email: channelPartners.email,
  micro_markets: channelPartners.micro_markets,
  is_active: channelPartners.is_active,
  city: cities.name,
};

// Adapt an external channel_partners row into the shape the sales CP cards /
// profile expect. `id` is the cp_code so links resolve to /sales/cps/<cp_code>.
function mapCp(row) {
  const micro = Array.isArray(row.micro_markets) ? row.micro_markets : [];
  return {
    id: row.cp_code,
    cp_id: row.cp_code,
    cp_code: row.cp_code,
    cp_name: row.name,
    name: row.name,
    phone_primary: row.phone,
    phone: row.phone,
    email: row.email || null,
    company: row.company || null,
    city: row.city || null,
    micro_markets: micro,
    // Reuse the "societies" UI to show micro-markets.
    societies: micro.map((m) => ({ society_name: m, micromarket: row.city || null, is_primary: false })),
    primary_business: [],
    office_address: row.company || null,
    office_verification_status: null,
    team_size: null,
    monthly_deal_volume: null,
    other_platforms: [],
    is_active: row.is_active !== false,
  };
}

export function isInventoryConfigured() {
  return !!cpDb;
}

// Search the inventory by code / name / phone. Empty query → a small active
// sample so the page isn't blank.
export async function searchInventoryCps(query, limit = 30) {
  if (!cpDb) return { configured: false, cps: [] };
  const q = (query || '').trim();

  let where;
  if (!q) {
    where = eq(channelPartners.is_active, true);
  } else {
    const code = normalizeCpCode(q); // case-insensitive, strips spaces/hyphens
    const digits = q.replace(/\D+/g, '');
    const conds = [
      ilike(channelPartners.name, `%${q}%`),
      ilike(channelPartners.company, `%${q}%`),
      sql`lower(regexp_replace(${channelPartners.cp_code}, '[\\s-]+', '', 'g')) like ${`%${code}%`}`,
    ];
    if (digits.length >= 4) {
      conds.push(
        sql`right(regexp_replace(${channelPartners.phone}, '\\D', '', 'g'), 10) like ${`%${digits.slice(-10)}%`}`
      );
    }
    where = or(...conds);
  }

  const rows = await cpDb
    .select(SELECT_COLS)
    .from(channelPartners)
    .leftJoin(cities, eq(cities.id, channelPartners.city_id))
    .where(where)
    .limit(limit);

  return { configured: true, cps: rows.map(mapCp) };
}

// One partner by exact cp_code (normalized match).
export async function getInventoryCpByCode(code) {
  if (!cpDb || !code) return null;
  const canonical = normalizeCpCode(code);
  const [row] = await cpDb
    .select(SELECT_COLS)
    .from(channelPartners)
    .leftJoin(cities, eq(cities.id, channelPartners.city_id))
    .where(sql`lower(regexp_replace(${channelPartners.cp_code}, '[\\s-]+', '', 'g')) = ${canonical}`)
    .limit(1);
  return row ? mapCp(row) : null;
}
