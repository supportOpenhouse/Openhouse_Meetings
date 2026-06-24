import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertSalesVisit, listSalesVisits } from '@/lib/salesQueries';
import { getInventoryCpByCode } from '@/lib/salesCp';
import { logActivity } from '@/lib/activityLog';
import { captureServer } from '@/lib/posthogServer';

export const runtime = 'nodejs';

const ENGAGEMENT = ['positive', 'neutral', 'disengaged'];
const OUTCOMES = ['onboarded', 'follow_up_required', 'not_interested', 'future_potential'];
const MEETING_TYPES = ['first_visit', 'repeat_visit'];

const nz = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const numOrNull = (v) => {
  // Number(null)/Number('') are 0 (finite) — guard so an uncaptured numeric
  // (e.g. geolocation denied) persists as NULL, not 0,0 (Gulf of Guinea).
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// GET /api/supply/visits — the signed-in rep's visits (admins may pass ?rm_id to
// scope to a specific rep, or ?cp_id for one partner's history).
export async function GET(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const isAdmin = session.user.role === 'admin';
  const cpId = sp.get('cp_id') || undefined;
  const status = sp.get('status') || undefined;

  // A rep only ever sees their own visits. Admins see everyone, optionally
  // narrowed to one rep via ?rm_id.
  const rmId = isAdmin ? sp.get('rm_id') || undefined : session.user.id;

  const visits = await listSalesVisits({ rmId, cpId, status, limit: 100 });
  return NextResponse.json({ visits });
}

// POST /api/supply/visits — log a field visit. Persists the manual form plus the
// uploaded audio URL with status='processing'; the browser then fires
// /api/supply/visits/[id]/process to transcribe + summarize.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Partners come from the external inventory now — a visit keys off the real
  // cp_code (e.g. CP05443), not a local uuid.
  const cp_code = nz(body.cp_code);
  if (!cp_code) return NextResponse.json({ error: 'cp_code required' }, { status: 400 });

  const audio_url = nz(body.audio_url);
  if (!audio_url) return NextResponse.json({ error: 'audio_url required' }, { status: 400 });

  // Same SSRF guard as the meetings pipeline — only our own Blob host.
  let hostOk = false;
  try {
    const u = new URL(audio_url);
    hostOk =
      u.protocol === 'https:' &&
      (u.hostname.endsWith('.public.blob.vercel-storage.com') ||
        u.hostname.endsWith('.blob.vercel-storage.com'));
  } catch {
    return NextResponse.json({ error: 'invalid audio_url' }, { status: 400 });
  }
  if (!hostOk) {
    return NextResponse.json({ error: 'audio_url must be a Vercel Blob URL' }, { status: 400 });
  }

  // Resolve the canonical partner name from the inventory; fall back to the
  // name the client snapshotted if the inventory DB isn't reachable.
  const cp = await getInventoryCpByCode(cp_code);
  const cpName = cp?.cp_name || nz(body.cp_name) || null;

  const meeting_type = MEETING_TYPES.includes(body.meeting_type)
    ? body.meeting_type
    : 'first_visit';
  const cp_engagement_level = ENGAGEMENT.includes(body.cp_engagement_level)
    ? body.cp_engagement_level
    : null;
  const meeting_outcome = OUTCOMES.includes(body.meeting_outcome) ? body.meeting_outcome : null;

  const checkIn = body.check_in_time ? new Date(body.check_in_time) : new Date();
  const checkOut = body.check_out_time ? new Date(body.check_out_time) : null;

  const visit = await insertSalesVisit({
    sales_rm_id: session.user.id,
    sales_cp_id: null, // partners live in the external inventory; we key on cp_code
    cp_code: cp?.cp_code || cp_code,
    cp_name: cpName,
    meeting_type,
    check_in_time: checkIn,
    check_out_time: checkOut && !isNaN(checkOut) ? checkOut : null,
    duration_seconds: parseInt(body.duration_seconds || 0, 10) || 0,
    meeting_lat: numOrNull(body.meeting_lat),
    meeting_lng: numOrNull(body.meeting_lng),
    location_accuracy: numOrNull(body.location_accuracy),
    key_discussion_points: nz(body.key_discussion_points),
    cp_engagement_level,
    competitive_update: nz(body.competitive_update),
    inventory_received: body.inventory_received === true,
    inventory_pipeline_count: numOrNull(body.inventory_pipeline_count),
    next_followup_date: nz(body.next_followup_date), // 'YYYY-MM-DD' or null
    next_action_required: nz(body.next_action_required),
    meeting_outcome,
    selfie_url: nz(body.selfie_url),
    audio_url,
    status: 'processing',
  });

  logActivity({
    userId: session.user.id,
    eventType: 'meeting.created',
    cpCode: visit.cp_code,
    payload: {
      kind: 'sales_visit',
      meeting_type,
      duration_seconds: visit.duration_seconds,
      cp_name: visit.cp_name,
    },
    request,
  });

  await captureServer(session.user.id, 'sales_visit_created', {
    cp_code: visit.cp_code,
    meeting_type,
    duration_seconds: visit.duration_seconds,
    inventory_received: visit.inventory_received === true,
    outcome: meeting_outcome,
    engagement: cp_engagement_level,
  });

  return NextResponse.json({ id: visit.id }, { status: 201 });
}
