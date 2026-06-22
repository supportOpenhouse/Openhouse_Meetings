// Seeds V2 demo data (clock session + GPS route + inventory) for the demo rep,
// so the Live Map / Performance / Inventory pages have content.
// Run: node --env-file=.env.local drizzle/seed_sales_v2.js
import { neon } from '@neondatabase/serverless';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const now = Date.now();
const mins = (m) => new Date(now - m * 60 * 1000);

async function run() {
  const [rep] = await sql`SELECT id FROM users WHERE email = 'sales.demo@openhouse.in'`;
  if (!rep) {
    console.error('demo rep not found — run seed_sales_demo.js first');
    process.exit(1);
  }
  const repId = rep.id;
  const cps = await sql`SELECT id, cp_id, cp_name FROM sales_channel_partners WHERE cp_id LIKE 'SCP9%' ORDER BY cp_id`;

  // Clean prior V2 demo rows for this rep
  await sql`DELETE FROM sales_location_pings WHERE sales_rm_id = ${repId}`;
  await sql`DELETE FROM sales_clock_sessions WHERE sales_rm_id = ${repId}`;
  await sql`DELETE FROM sales_inventory WHERE sales_rm_id = ${repId}`;

  // 1) An OPEN clock session started 3h ago
  const [session] = await sql`
    INSERT INTO sales_clock_sessions (sales_rm_id, clock_in_time, clock_in_lat, clock_in_lng, status)
    VALUES (${repId}, ${mins(180).toISOString()}, 28.4521, 77.0721, 'open')
    RETURNING id`;
  // A closed session yesterday (for performance hours)
  await sql`
    INSERT INTO sales_clock_sessions (sales_rm_id, clock_in_time, clock_out_time, clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, distance_meters, status)
    VALUES (${repId}, ${mins(1620).toISOString()}, ${mins(1180).toISOString()}, 28.46, 77.06, 28.42, 77.04, 14200, 'closed')`;

  // 2) GPS route — a walk across Gurgaon over the last 3h, tied to the open session
  const route = [
    [28.4521, 77.0721], [28.4548, 77.0739], [28.4576, 77.0758], [28.4602, 77.0741],
    [28.4631, 77.0712], [28.4659, 77.0688], [28.4677, 77.0651], [28.4695, 77.0619],
    [28.4711, 77.0583], [28.4726, 77.0547], [28.4709, 77.0512], [28.4688, 77.0489],
  ];
  let i = 0;
  for (const [lat, lng] of route) {
    const ago = 175 - i * 15;
    await sql`
      INSERT INTO sales_location_pings (sales_rm_id, clock_session_id, lat, lng, accuracy, recorded_at)
      VALUES (${repId}, ${session.id}, ${lat}, ${lng}, ${18 + (i % 4) * 6}, ${mins(ago).toISOString()})`;
    i++;
  }

  // 3) Inventory for a couple of CPs
  const cp1 = cps[0]; // SCP901 Sharma Realtors
  const cp3 = cps[2] || cps[0];
  const inv = [
    { cp: cp1, society: 'M3M Golf Estate', config: '3BHK', size: 2150, price: 32000000, facing: 'NE', status: 'vacant', floor: 14, unit: '1402', furn: 'semi', comment: 'Corner unit, golf view.', ok: true },
    { cp: cp1, society: 'M3M Golf Estate', config: '2BHK', size: 1450, price: 21500000, facing: 'E', status: 'tenant', floor: 8, unit: '0806', furn: 'full', comment: 'Tenant leaving next month.', ok: true },
    { cp: cp3, society: 'Tata Primanti', config: '4BHK', size: 3400, price: 48000000, facing: 'N', status: 'owner', floor: 22, unit: '2201', furn: 'full', comment: 'Premium, owner negotiable.', ok: false },
  ];
  for (const r of inv) {
    await sql`
      INSERT INTO sales_inventory (sales_cp_id, sales_rm_id, cp_code, cp_name, city, society_name, configuration, size_sqft, price, facing, flat_status, floor, unit_number, furnishing, comments, ok_to_visit)
      VALUES (${r.cp.id}, ${repId}, ${r.cp.cp_id}, ${r.cp.cp_name}, 'Gurgaon', ${r.society}, ${r.config}, ${r.size}, ${r.price}, ${r.facing}, ${r.status}, ${r.floor}, ${r.unit}, ${r.furn}, ${r.comment}, ${r.ok})`;
  }

  console.log('✓ V2 demo seeded:', route.length, 'pings, 2 sessions,', inv.length, 'inventory rows');
}

run().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
