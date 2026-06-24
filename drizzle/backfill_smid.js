// Backfills users.smid (Open House Core sales_manager_id) by matching existing
// users to the sales-manager list (by name, with email-prefix fallback).
// Dry-run by default; pass --apply to add the column + write values.
//   node --env-file=.env.local drizzle/backfill_smid.js          (dry run)
//   node --env-file=.env.local drizzle/backfill_smid.js --apply   (write)
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes('--apply');

// [sales_manager_id, phone, name, city]
const MANAGERS = [
  [91, '9289972230', 'Aanchal Khatri', 'Ghaziabad'],
  [76, '8796122583', 'Aditya Bhasker', 'Ghaziabad'],
  [47, '9810826481', 'Animesh Singh', 'Ghaziabad'],
  [100, '9560324996', 'Ankush Bhati', 'Ghaziabad'],
  [93, '9560785450', 'Anuj Kumar', 'Ghaziabad'],
  [105, '9555666059', 'Ashish', 'Ghaziabad'],
  [89, '9818975130', 'Atishay Sharma', 'Ghaziabad'],
  [90, '7428500816', 'Manish Sharma', 'Ghaziabad'],
  [61, '8130733966', 'Nishant', 'Ghaziabad'],
  [60, '9289311664', 'Rachit Garg', 'Ghaziabad'],
  [56, '9217710682', 'Sahil Kumar', 'Ghaziabad'],
  [57, '9289141427', 'Saket Kumar', 'Ghaziabad'],
  [75, '7042118400', 'Saumya Behera', 'Ghaziabad'],
  [97, '8448184325', 'Varun Matrey', 'Ghaziabad'],
  [22, '8130901484', 'Adiksha Sahu', 'Gurgaon'],
  [106, '9667837340', 'Akash Raghav', 'Gurgaon'],
  [17, '9711382053', 'Akshit', 'Gurgaon'],
  [43, '9217244559', 'Aman Rawat', 'Gurgaon'],
  [102, '8796447911', 'Anant Srivastav', 'Gurgaon'],
  [71, '7428541117', 'Ankit Gupta', 'Gurgaon'],
  [103, '9560537810', 'Ankit Jangir', 'Gurgaon'],
  [4, '9205656168', 'Ankit Kumar', 'Gurgaon'],
  [77, '7303372170', 'Anurag', 'Gurgaon'],
  [86, '8800899765', 'Ayush Ojha', 'Gurgaon'],
  [95, '9599338701', 'Danish Khan', 'Gurgaon'],
  [68, '7428500192', 'Deepak Rana', 'Gurgaon'],
  [44, '9217278002', 'Joginder Singh', 'Gurgaon'],
  [78, '8796122692', 'Kanchan Jaiswal', 'Gurgaon'],
  [81, '8800899735', 'Manish Deshwal', 'Gurgaon'],
  [84, '9211599292', 'Nisha Deewan', 'Gurgaon'],
  [72, '7428500146', 'Priyesh Kumar', 'Gurgaon'],
  [7, '9289996734', 'Puran Kiraula', 'Gurgaon'],
  [54, '9217710683', 'Rahul Singh', 'Gurgaon'],
  [83, '9958075070', 'Rahul Singh', 'Gurgaon'],
  [29, '9560297049', 'Rajnish', 'Gurgaon'],
  [48, '7011959640', 'Richard', 'Gurgaon'],
  [14, '9289996738', 'Rupali Prasad', 'Gurgaon'],
  [85, '8448183231', 'Satish', 'Gurgaon'],
  [30, '9810925822', 'Saumya Behera', 'Gurgaon'],
  [34, '9311336382', 'Shubham Sharma', 'Gurgaon'],
  [70, '8088974759', 'Soumita', 'Gurgaon'],
  [50, '9311339190', 'Sushmita Roy', 'Gurgaon'],
  [10, '7042609405', 'Testing OH', 'Gurgaon'],
  [42, '9217275003', 'Vipul Suneja', 'Gurgaon'],
  [101, '7088378107', 'Vishal Goswami (AM2PM)', 'Gurgaon'],
  [69, '9761199381', 'Aaysha', 'Noida'],
  [19, '9289500951', 'Abhash Kumar', 'Noida'],
  [37, '9452441498', 'Abhishek', 'Noida'],
  [82, '8796449590', 'Abhishek', 'Noida'],
  [46, '9217710678', 'Aditya', 'Noida'],
  [12, '9289500949', 'Ajitesh Singh', 'Noida'],
  [62, '9266533475', 'Aman Dixit', 'Noida'],
  [88, '9560518701', 'Ambuj Rastogi', 'Noida'],
  [51, '9217710686', 'Ashwani Sharma', 'Noida'],
  [99, '8796771565', 'Jatin Jain', 'Noida'],
  [92, '8796122690', 'Kartik', 'Noida'],
  [63, '9311338216', 'Kavita', 'Noida'],
  [94, '8796558440', 'Kundan', 'Noida'],
  [16, '9821496633', 'Mayank Chauhan', 'Noida'],
  [64, '8130709105', 'Mukul Chhabra', 'Noida'],
  [87, '9667641401', 'Rishabh Jain', 'Noida'],
  [58, '9217275007', 'Sahil Singh', 'Noida'],
  [31, '8658840123', 'Saumya Behera', 'Noida'],
  [26, '9205658886', 'Shashank', 'Noida'],
  [49, '7048944602', 'Shubham Sharma', 'Noida'],
  [79, '8796122576', 'Subhash Chand', 'Noida'],
  [18, '9821700377', 'Sushmita Roy', 'Noida'],
  [80, '8796122426', 'Udit Gangwar', 'Noida'],
  [98, '9560380011', 'Vijay Kumar', 'Noida'],
  [96, '8800669230', 'Vikrant Sengar', 'Noida'],
  [104, '8800669230', 'Vikrant Sengar', 'Noida'],
  [21, '9289500950', 'Vinay Kumar', 'Noida'],
].map(([smid, phone, name, city]) => ({ smid, phone, name, city }));

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);
const emailName = (email) => norm((email || '').split('@')[0].replace(/[._]+/g, ' '));

function matchUser(user) {
  const un = norm(user.name);
  const en = emailName(user.email);
  const ut = new Set([...tokens(user.name), ...tokens(en)]);

  // 1) exact on name or on the email prefix
  let cands = MANAGERS.filter((m) => {
    const mn = norm(m.name);
    return mn === un || mn === en;
  });
  // 2) subset: all manager-name tokens present in the user's tokens
  if (!cands.length) {
    cands = MANAGERS.filter((m) => {
      const mt = tokens(m.name);
      return mt.length && mt.every((t) => ut.has(t));
    });
  }
  if (!cands.length) return { kind: 'none' };

  // Collapse same-person duplicates (identical phone → keep lowest smid).
  const byPhone = new Map();
  for (const c of cands) {
    if (!byPhone.has(c.phone) || c.smid < byPhone.get(c.phone).smid) byPhone.set(c.phone, c);
  }
  const uniq = [...byPhone.values()];
  if (uniq.length === 1) return { kind: 'match', mgr: uniq[0] };
  return { kind: 'ambiguous', cands: uniq };
}

async function run() {
  const users = await sql`SELECT id, name, email, role FROM users ORDER BY name`;
  const matched = [];
  const ambiguous = [];
  const none = [];

  for (const u of users) {
    const r = matchUser(u);
    if (r.kind === 'match') matched.push({ u, mgr: r.mgr });
    else if (r.kind === 'ambiguous') ambiguous.push({ u, cands: r.cands });
    else none.push(u);
  }

  console.log(`\n=== MATCHED (${matched.length}) ===`);
  for (const { u, mgr } of matched) {
    console.log(`  ${(u.name || '').padEnd(22)} → smid ${String(mgr.smid).padEnd(4)} (${mgr.name}, ${mgr.city})`);
  }
  console.log(`\n=== AMBIGUOUS — left NULL, set manually (${ambiguous.length}) ===`);
  for (const { u, cands } of ambiguous) {
    console.log(`  ${(u.name || '').padEnd(22)} (${u.email}) → ${cands.map((c) => `${c.smid}:${c.city}`).join('  |  ')}`);
  }
  console.log(`\n=== NO MATCH — left NULL (${none.length}) ===`);
  for (const u of none) console.log(`  ${(u.name || '').padEnd(22)} (${u.email}) [${u.role}]`);

  if (!APPLY) {
    console.log(`\n(dry run — pass --apply to add the column + write ${matched.length} values)`);
    return;
  }

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS smid INTEGER`;
  let written = 0;
  for (const { u, mgr } of matched) {
    await sql`UPDATE users SET smid = ${mgr.smid} WHERE id = ${u.id}`;
    written += 1;
  }
  console.log(`\n✓ Added smid column + wrote ${written} values. ${ambiguous.length} ambiguous + ${none.length} unmatched left NULL.`);
}

run().catch((e) => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
