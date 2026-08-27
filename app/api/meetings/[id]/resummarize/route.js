import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMeetingForProcessing, updateMeeting } from '@/lib/queries';
import { summarizeWithClaude } from '@/lib/claude';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const maxDuration = 120;

// POST /api/meetings/[id]/resummarize
// Body: { meeting_type?: 'engagement' | 'visit' }
// Re-runs Claude against the EXISTING transcript_text. If meeting_type is
// passed it overrides what's on the row (and the meeting is reclassified).
// Owner-or-admin only.
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const meeting = await getMeetingForProcessing(id);
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  if (meeting.rm_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!meeting.transcript_text || meeting.transcript_text.trim() === '') {
    return NextResponse.json(
      { error: 'Meeting has no transcript yet. Wait for initial processing to finish.' },
      { status: 409 }
    );
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const requested = body?.meeting_type;
  const ALLOWED_TYPES = ['engagement', 'visit', 'onboarding', 'call', 'negotiation'];
  const newType = ALLOWED_TYPES.includes(requested) ? requested : meeting.meeting_type || 'engagement';

  try {
    const summary = await summarizeWithClaude(
      meeting.transcript_text,
      {
        rm_name: session.user.name,
        cp_code: meeting.cp_code,
        cp_mobile: meeting.cp_mobile,
        purpose: meeting.purpose,
        duration_seconds: meeting.duration_seconds,
      },
      newType
    );

    const updated = await updateMeeting(meeting.id, {
      summary,
      meeting_type: newType,
      status: 'ready',
      error_message: null,
    });

    logActivity({
      userId: session.user.id,
      eventType: 'meeting.resummarized',
      meetingId: meeting.id,
      cpCode: meeting.cp_code,
      payload: {
        from_type: meeting.meeting_type || 'engagement',
        to_type: newType,
        score: summary?.score?.total ?? null,
        classification: summary?.score?.classification || summary?.engagement?.sentiment || null,
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      meeting_type: updated.meeting_type,
      summary: updated.summary,
    });
  } catch (e) {
    logActivity({
      userId: session.user.id,
      eventType: 'error',
      meetingId: meeting.id,
      cpCode: meeting.cp_code,
      payload: { where: 'resummarize', error: (e?.message || '').slice(0, 500) },
      request,
    });
    return NextResponse.json(
      { error: e?.message || 'Re-summarize failed' },
      { status: 500 }
    );
  }
}
