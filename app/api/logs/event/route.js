import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { logActivity, CLIENT_LOGGABLE_EVENTS } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/logs/event
// Body: { event_type, meeting_id?, cp_code?, payload? }
// Records a client-side activity event (recording lifecycle, upload state,
// generic errors). The event_type must be on the CLIENT_LOGGABLE_EVENTS
// allowlist — anything authoritative is server-only.
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { event_type, meeting_id, cp_code, payload } = body || {};

  if (!event_type || !CLIENT_LOGGABLE_EVENTS.has(event_type)) {
    return NextResponse.json(
      { ok: false, error: 'unknown or non-client event_type' },
      { status: 400 }
    );
  }

  await logActivity({
    userId: session.user.id,
    eventType: event_type,
    meetingId: meeting_id || null,
    cpCode: cp_code || null,
    payload: payload || null,
    request,
  });

  return NextResponse.json({ ok: true });
}
