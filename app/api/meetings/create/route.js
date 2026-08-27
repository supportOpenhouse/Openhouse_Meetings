import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertMeeting } from '@/lib/queries';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';

// Fast endpoint: persists a meeting row with status='processing' and returns its id.
// The browser then fires-and-forgets /api/meetings/[id]/process with keepalive,
// and navigates away. Transcription + summarization happen server-side, the row
// flips to 'ready' (or 'failed') when done.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    audio_url,
    cp_code,
    cp_mobile,
    cp_name,
    cp_city,
    purpose,
    duration_seconds,
    started_at,
    meeting_type,
    location_lat,
    location_lng,
    location_accuracy,
    cp_visit_id,
    cp_visit_meta,
  } = body;

  if (!audio_url) return NextResponse.json({ error: 'audio_url required' }, { status: 400 });

  if (
    meeting_type !== 'engagement' &&
    meeting_type !== 'visit' &&
    meeting_type !== 'onboarding' &&
    meeting_type !== 'negotiation'
  ) {
    return NextResponse.json(
      { error: "meeting_type must be 'engagement', 'visit', 'negotiation', or 'onboarding'" },
      { status: 400 }
    );
  }
  // Onboarding meetings legitimately have no cp_code (the CP isn't onboarded
  // yet) and phone is optional. They DO require a name.
  if (meeting_type === 'onboarding') {
    if (!cp_name || !String(cp_name).trim()) {
      return NextResponse.json(
        { error: 'cp_name required for onboarding meetings' },
        { status: 400 }
      );
    }
  } else if (!cp_mobile) {
    // Engagement meetings normally have a cp_code too — the new-meeting form
    // enforces it at the UI level. Visit meetings (including direct-RM site
    // visits) only need the buyer's phone, so cp_code is optional here.
    return NextResponse.json({ error: 'cp_mobile required' }, { status: 400 });
  }

  // Same SSRF guard the old endpoint had — only accept our own Blob host.
  let hostOk = false;
  try {
    const u = new URL(audio_url);
    hostOk =
      u.hostname.endsWith('.public.blob.vercel-storage.com') ||
      u.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return NextResponse.json({ error: 'invalid audio_url' }, { status: 400 });
  }
  if (!hostOk) {
    return NextResponse.json({ error: 'audio_url must be a Vercel Blob URL' }, { status: 400 });
  }

  // Geolocation is best-effort — only persist finite numbers.
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  const meeting = await insertMeeting({
    rm_id: session.user.id,
    cp_code: cp_code ? String(cp_code).trim() : null,
    cp_mobile: cp_mobile ? String(cp_mobile).trim() : null,
    cp_name: cp_name?.trim() || null,
    cp_city: cp_city?.trim() || null,
    purpose: purpose?.trim() || null,
    started_at: started_at ? new Date(started_at) : new Date(),
    duration_seconds: parseInt(duration_seconds || 0, 10),
    audio_url,
    status: 'processing',
    meeting_type,
    location_lat: num(location_lat),
    location_lng: num(location_lng),
    location_accuracy: num(location_accuracy),
    cp_visit_id: cp_visit_id ? String(cp_visit_id).trim() : null,
    cp_visit_meta: cp_visit_meta && typeof cp_visit_meta === 'object' ? cp_visit_meta : null,
  });

  logActivity({
    userId: session.user.id,
    eventType: 'meeting.created',
    meetingId: meeting.id,
    cpCode: meeting.cp_code,
    payload: {
      meeting_type,
      duration_seconds: meeting.duration_seconds,
      cp_name: meeting.cp_name,
    },
    request,
  });

  return NextResponse.json({ id: meeting.id });
}
