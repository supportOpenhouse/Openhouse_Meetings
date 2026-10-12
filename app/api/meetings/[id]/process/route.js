import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMeetingForProcessing } from '@/lib/queries';
import { processMeeting } from '@/lib/processMeeting';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
// I/O wait (ElevenLabs, Claude) doesn't count as active CPU on Fluid Compute,
// so the billing impact of holding the function open is small.
export const maxDuration = 800;

// Background job: fetch the uploaded audio from Blob → transcribe → summarize → persist.
// Triggered by the browser with `fetch(..., { keepalive: true })` immediately before
// navigation, so this runs to completion even though the user has already left the page.
// If that request never arrives, /api/meetings/process-stuck picks the row up later.
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const meeting = await getMeetingForProcessing(id);
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  // Lock so a re-fire (browser retry) doesn't double-process.
  if (meeting.status !== 'processing') {
    return NextResponse.json({ ok: true, alreadyProcessed: true, status: meeting.status });
  }
  // Authorization: the RM who owns this row, or an admin, can process it.
  if (meeting.rm_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!meeting.audio_url) {
    return NextResponse.json({ error: 'Meeting has no audio_url' }, { status: 400 });
  }

  const result = await processMeeting(meeting, {
    rmName: session.user.name,
    log: (event) => logActivity({ ...event, request }),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'ready' });
}
