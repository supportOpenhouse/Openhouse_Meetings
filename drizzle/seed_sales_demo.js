// Seeds realistic Sales-RM demo data so the /sales experience can be reviewed
// (and screenshotted) with content. Idempotent: it upserts a demo sales rep and
// replaces that rep's demo CPs/visits each run. Demo CPs use the SCP9xx code
// range so they never collide with real SCP001.. registrations.
//
// Run: node --env-file=.env.local drizzle/seed_sales_demo.js
import { neon } from '@neondatabase/serverless';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const DEMO_EMAIL = 'sales.demo@openhouse.in';
const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600 * 1000);
const daysAgo = (d) => new Date(now - d * 86400 * 1000);
const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);

function summary({ headline, discussion, points, needs, objections, commitments, competitive, inventory, next, sentiment, stage }) {
  return {
    headline,
    discussion_summary: discussion,
    key_points: points || [],
    cp_needs: needs || [],
    objections: objections || [],
    commitments: commitments || [],
    competitive_intel: competitive || 'Not discussed',
    inventory_discussion: inventory || 'Not discussed',
    next_steps: next || [],
    cp_sentiment: sentiment,
    onboarding_stage: stage,
    generated_at: new Date().toISOString(),
  };
}

async function run() {
  console.log('Seeding sales demo data…');

  // 1) Demo sales rep
  const [rep] = await sql`
    INSERT INTO users (email, name, role, is_active)
    VALUES (${DEMO_EMAIL}, 'Demo Sales RM', 'sales_rm', true)
    ON CONFLICT (email) DO UPDATE SET role = 'sales_rm', is_active = true, name = 'Demo Sales RM'
    RETURNING id
  `;
  const repId = rep.id;
  console.log('  rep:', repId);

  // 2) Wipe prior demo rows for a clean reseed
  await sql`DELETE FROM sales_visits WHERE sales_rm_id = ${repId}`;
  await sql`DELETE FROM sales_channel_partners WHERE cp_id LIKE 'SCP9%'`;

  // 3) Channel partners
  const cpRows = [
    {
      cp_id: 'SCP901', cp_name: 'Sharma Realtors', phone_primary: '9810012345', phone_secondary: '9810099999',
      email: 'sharma.realtors@gmail.com', primary_business: ['primary', 'resale'], team_size: 6, monthly_deal_volume: 12,
      other_platforms: ['99acres', 'MagicBricks'], office_address: 'Shop 14, Sector 57 Market, Gurgaon',
      office_lat: 28.4211, office_lng: 77.0910, office_verification_status: 'visible_signage',
      societies: [
        { society_name: 'M3M Golf Estate', micromarket: 'Sector 65', is_primary: true },
        { society_name: 'Emaar Palm Gardens', micromarket: 'Sector 83', is_primary: false },
      ],
    },
    {
      cp_id: 'SCP902', cp_name: 'Verma Properties', phone_primary: '9899023456',
      email: null, primary_business: ['resale', 'rental'], team_size: 3, monthly_deal_volume: 7,
      other_platforms: ['Housing.com'], office_address: 'B-22, South City 1, Gurgaon',
      office_lat: 28.4595, office_lng: 77.0726, office_verification_status: 'shared_office',
      societies: [{ society_name: 'Vatika City', micromarket: 'Sector 49', is_primary: true }],
    },
    {
      cp_id: 'SCP903', cp_name: 'Capital Homes', phone_primary: '9971034567', phone_secondary: null,
      email: 'hello@capitalhomes.in', primary_business: ['primary'], team_size: 11, monthly_deal_volume: 20,
      other_platforms: ['99acres', 'MagicBricks', 'Square Yards'], office_address: 'Tower B, JMD Megapolis, Sohna Road',
      office_lat: 28.4126, office_lng: 77.0382, office_verification_status: 'visible_signage',
      societies: [
        { society_name: 'Tata Primanti', micromarket: 'Sector 72', is_primary: true },
        { society_name: 'Ireo Victory Valley', micromarket: 'Sector 67', is_primary: false },
      ],
    },
    {
      cp_id: 'SCP904', cp_name: 'Gupta Estates', phone_primary: '9650045678',
      email: null, primary_business: ['resale'], team_size: 2, monthly_deal_volume: 4,
      other_platforms: [], office_address: 'Near DLF Phase 3 Metro, Gurgaon',
      office_lat: 28.4940, office_lng: 77.0920, office_verification_status: 'home_based',
      societies: [{ society_name: 'DLF Phase 3', micromarket: 'Sector 24', is_primary: true }],
    },
    {
      cp_id: 'SCP905', cp_name: 'Skyline Brokers', phone_primary: '9818056789',
      email: 'skyline.gurgaon@gmail.com', primary_business: ['primary', 'rental'], team_size: 8, monthly_deal_volume: 15,
      other_platforms: ['MagicBricks'], office_address: 'Sector 82A, Gurgaon',
      office_lat: 28.3905, office_lng: 76.9810, office_verification_status: 'no_signage',
      societies: [{ society_name: 'Vatika India Next', micromarket: 'Sector 82A', is_primary: true }],
    },
  ];

  const cpIds = {};
  for (const c of cpRows) {
    const [row] = await sql`
      INSERT INTO sales_channel_partners
        (cp_id, cp_name, phone_primary, phone_secondary, email, primary_business, team_size,
         monthly_deal_volume, other_platforms, office_address, office_lat, office_lng,
         office_verification_status, societies, created_by, is_active)
      VALUES
        (${c.cp_id}, ${c.cp_name}, ${c.phone_primary}, ${c.phone_secondary ?? null}, ${c.email},
         ${JSON.stringify(c.primary_business)}, ${c.team_size}, ${c.monthly_deal_volume},
         ${JSON.stringify(c.other_platforms)}, ${c.office_address}, ${c.office_lat}, ${c.office_lng},
         ${c.office_verification_status}, ${JSON.stringify(c.societies)}, ${repId}, true)
      RETURNING id
    `;
    cpIds[c.cp_id] = row.id;
  }
  console.log('  CPs:', Object.keys(cpIds).length);

  // 4) Visits — varied across time / engagement / outcome / status
  const visits = [
    {
      cp: 'SCP901', cp_name: 'Sharma Realtors', meeting_type: 'first_visit', checkIn: hoursAgo(2), dur: 1380,
      engagement: 'positive', outcome: 'onboarded', inv: true, invCount: 8,
      key: 'Walked through Openhouse onboarding, payout structure and live inventory access. CP keen to start with M3M Golf Estate resale leads.',
      competitive: 'Currently lists on 99acres + MagicBricks; finds lead quality inconsistent.',
      followup: daysAgo(-3), next: 'Share resale inventory deck + onboarding link',
      status: 'ready',
      summary: summary({
        headline: 'Sharma Realtors onboarded; will route M3M Golf Estate resale leads',
        discussion: 'The RM pitched Openhouse end-to-end — transparent payouts, verified buyer leads, and dashboard access. The CP was enthusiastic, compared it favourably to 99acres, and agreed to onboard on the spot.',
        points: ['Demoed the partner dashboard', 'Explained payout timelines (T+7)', 'CP toured live inventory for Sector 65'],
        needs: ['Steady buyer leads for resale', 'Faster payout cycle'],
        objections: ['Wanted clarity on exclusivity'],
        commitments: ['Will send 8 resale listings this week', 'Will onboard 2 team members'],
        competitive: 'Uses 99acres and MagicBricks; unhappy with lead quality and cost-per-lead.',
        inventory: 'Has ~8 resale units across M3M Golf Estate ready to list.',
        next: ['Send onboarding link', 'Collect RERA + listing docs', 'Schedule team training'],
        sentiment: 'positive', stage: 'onboarded',
      }),
    },
    {
      cp: 'SCP903', cp_name: 'Capital Homes', meeting_type: 'first_visit', checkIn: hoursAgo(5), dur: 960,
      engagement: 'neutral', outcome: 'follow_up_required', inv: false, invCount: null,
      key: 'Larger agency, already deep with builders. Interested but wants to see lead volume before committing.',
      competitive: 'Works directly with builder channel teams; uses Square Yards for overflow.',
      followup: dateOnly(daysAgo(0)), next: 'Send sample lead batch for Tata Primanti',
      status: 'ready',
      summary: summary({
        headline: 'Capital Homes interested but wants proof of lead volume first',
        discussion: 'A bigger, builder-focused agency. The principal was polite and engaged but non-committal — he wants to see a sample of Openhouse lead quality and volume for Sector 72 before allocating his team.',
        points: ['Discussed primary-sales focus on Tata Primanti', 'CP runs an 11-person team'],
        needs: ['Proof of lead volume', 'Primary-sales inventory in Sector 72/67'],
        objections: ['Already has strong builder relationships', 'Skeptical of new platforms'],
        commitments: ['Will review a sample lead batch'],
        competitive: 'Direct builder channel partnerships; Square Yards for overflow demand.',
        inventory: 'Primary inventory tied to builder allocations; limited resale.',
        next: ['Send 10-lead sample for Tata Primanti', 'Follow up in 3 days'],
        sentiment: 'neutral', stage: 'evaluating',
      }),
    },
    {
      cp: 'SCP902', cp_name: 'Verma Properties', meeting_type: 'repeat_visit', checkIn: hoursAgo(26), dur: 720,
      engagement: 'positive', outcome: 'follow_up_required', inv: true, invCount: 3,
      key: 'Second visit. Shared 3 Vatika City resale listings. Wants help with buyer site visits.',
      competitive: 'Housing.com only.',
      followup: dateOnly(daysAgo(1)), next: 'Coordinate buyer site visit for Vatika City B-block',
      status: 'ready',
      summary: summary({
        headline: 'Verma shared 3 Vatika City listings; needs site-visit support',
        discussion: 'A productive repeat visit. The CP has warmed up considerably and handed over three resale listings. The main ask is help coordinating buyer site visits, which he finds time-consuming.',
        points: ['Received 3 resale listings', 'CP comfortable with the dashboard now'],
        needs: ['Buyer site-visit coordination', 'Quick buyer verification'],
        objections: [],
        commitments: ['Will share 2 more listings next week'],
        competitive: 'Lists only on Housing.com currently.',
        inventory: '3 resale units in Vatika City handed over.',
        next: ['Schedule buyer site visit for B-block', 'Verify the 3 listings'],
        sentiment: 'positive', stage: 'ready_to_onboard',
      }),
    },
    {
      cp: 'SCP904', cp_name: 'Gupta Estates', meeting_type: 'first_visit', checkIn: daysAgo(2), dur: 480,
      engagement: 'disengaged', outcome: 'not_interested', inv: false, invCount: null,
      key: 'Small home-based broker. Not interested right now — works on referrals only.',
      competitive: 'No platforms; pure referral business.',
      followup: null, next: null,
      status: 'ready',
      summary: summary({
        headline: 'Gupta Estates not interested — referral-only, no platform appetite',
        discussion: 'A small home-based operator who works purely on word-of-mouth referrals. He was distracted and not interested in onboarding to any platform at this stage.',
        points: ['Referral-only business model', 'No interest in dashboards/leads'],
        needs: [],
        objections: ['Does not want platform dependency', 'Too small a team'],
        commitments: [],
        competitive: 'Uses no platforms.',
        inventory: 'Not discussed.',
        next: ['Re-approach in 2 quarters'],
        sentiment: 'disengaged', stage: 'not_interested',
      }),
    },
    {
      cp: 'SCP905', cp_name: 'Skyline Brokers', meeting_type: 'first_visit', checkIn: daysAgo(3), dur: 1140,
      engagement: 'positive', outcome: 'future_potential', inv: false, invCount: null,
      key: 'Strong rental + primary mix in Sector 82A. Interested for next quarter when new tower launches.',
      competitive: 'MagicBricks.',
      followup: daysAgo(-10), next: 'Reconnect before Vatika India Next tower launch',
      status: 'ready',
      summary: summary({
        headline: 'Skyline a strong future bet around Vatika India Next launch',
        discussion: 'An established broker with a healthy rental and primary mix. Genuinely interested but timing-dependent — they expect real momentum when the new Vatika India Next tower launches next quarter.',
        points: ['Strong in Sector 82A', 'Rental + primary mix'],
        needs: ['Primary inventory at launch', 'Co-marketing support'],
        objections: ['Timing — waiting for tower launch'],
        commitments: ['Will revisit at launch'],
        competitive: 'Lists on MagicBricks.',
        inventory: 'Will have primary inventory at the upcoming launch.',
        next: ['Calendar reminder before launch', 'Share co-marketing options'],
        sentiment: 'positive', stage: 'evaluating',
      }),
    },
    {
      cp: 'SCP901', cp_name: 'Sharma Realtors', meeting_type: 'repeat_visit', checkIn: daysAgo(6), dur: 600,
      engagement: 'positive', outcome: 'onboarded', inv: true, invCount: 5,
      key: 'Follow-up after onboarding. Collected docs, added 5 more listings.',
      competitive: null, followup: null, next: 'Activate listings on dashboard',
      status: 'ready',
      summary: summary({
        headline: 'Sharma fully activated — 5 more listings + team trained',
        discussion: 'Follow-up visit post-onboarding. Documents collected, five more listings added, and two team members trained on the dashboard.',
        points: ['Docs collected', '5 listings added', 'Team trained'],
        needs: ['Listing activation'],
        objections: [],
        commitments: ['Active weekly listing cadence'],
        competitive: 'Not discussed.',
        inventory: '5 additional resale units added.',
        next: ['Activate listings', 'Set weekly check-in'],
        sentiment: 'positive', stage: 'onboarded',
      }),
    },
    {
      cp: 'SCP902', cp_name: 'Verma Properties', meeting_type: 'first_visit', checkIn: hoursAgo(1), dur: 0,
      engagement: 'neutral', outcome: null, inv: false, invCount: null,
      key: 'Quick intro visit — recording still processing.',
      competitive: null, followup: null, next: null,
      status: 'processing', summary: null,
    },
    {
      cp: 'SCP903', cp_name: 'Capital Homes', meeting_type: 'repeat_visit', checkIn: daysAgo(4), dur: 300,
      engagement: null, outcome: null, inv: false, invCount: null,
      key: 'Audio failed to transcribe (test of failed state).',
      competitive: null, followup: null, next: null,
      status: 'failed', summary: null, error: 'Could not fetch uploaded audio: 404',
    },
  ];

  for (const v of visits) {
    await sql`
      INSERT INTO sales_visits
        (sales_rm_id, sales_cp_id, cp_code, cp_name, meeting_type, check_in_time, check_out_time,
         duration_seconds, meeting_lat, meeting_lng, location_accuracy, key_discussion_points,
         cp_engagement_level, competitive_update, inventory_received, inventory_pipeline_count,
         next_followup_date, next_action_required, meeting_outcome, audio_url, summary, status, error_message)
      VALUES
        (${repId}, ${cpIds[v.cp]}, ${v.cp}, ${v.cp_name}, ${v.meeting_type}, ${v.checkIn.toISOString()},
         ${new Date(v.checkIn.getTime() + v.dur * 1000).toISOString()}, ${v.dur},
         28.45, 77.05, 35, ${v.key}, ${v.engagement ?? null}, ${v.competitive ?? null},
         ${v.inv}, ${v.invCount ?? null}, ${v.followup ? dateOnly(v.followup) : null}, ${v.next ?? null},
         ${v.outcome ?? null}, ${'https://demo.blob.vercel-storage.com/seed-audio.webm'},
         ${v.summary ? JSON.stringify(v.summary) : null}, ${v.status}, ${v.error ?? null})
    `;
  }
  console.log('  visits:', visits.length);
  console.log('\n✓ Sales demo data seeded. Rep login email:', DEMO_EMAIL);
}

run().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
