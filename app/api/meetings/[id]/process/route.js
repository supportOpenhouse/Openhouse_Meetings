import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { auth } from '@/auth';
import { getMeetingForProcessing, updateMeeting } from '@/lib/queries';
import { transcribeWithElevenLabs } from '@/lib/elevenlabs';
import { summarizeWithClaude } from '@/lib/claude';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
// I/O wait (ElevenLabs, Claude) doesn't count as active CPU on Fluid Compute,
// so the billing impact of holding the function open is small.
export const maxDuration = 800;

// Background job: fetch the uploaded audio from Blob → transcribe → summarize → persist.
// Triggered by the browser with `fetch(..., { keepalive: true })` immediately before
// navigation, so this runs to completion even though the user has already left the page.
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

  logActivity({
    userId: session.user.id,
    eventType: 'meeting.processing.started',
    meetingId: meeting.id,
    cpCode: meeting.cp_code,
    payload: { meeting_type: meeting.meeting_type || 'engagement' },
    request,
  });

  try {
    const audioRes = await fetch(meeting.audio_url);
    if (!audioRes.ok) throw new Error(`Could not fetch uploaded audio: ${audioRes.status}`);
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const mime = audioRes.headers.get('content-type') || 'audio/webm';

    const transcript = await transcribeWithElevenLabs(
      buf,
      mime,
      process.env.ELEVENLABS_LANGUAGE || ''
    );

    // Phone call recordings (direct-RM uploads) are transcript-only for now —
    // the smart-summary question set for calls is still TBD.
    const summary =
      meeting.meeting_type === 'call'
        ? null
        : await summarizeWithClaude(
            transcript.text || '',
            {
              rm_name: session.user.name,
              cp_code: meeting.cp_code,
              cp_mobile: meeting.cp_mobile,
              purpose: meeting.purpose,
              duration_seconds: meeting.duration_seconds,
            },
            meeting.meeting_type || 'engagement'
          );

    const updated = await updateMeeting(meeting.id, {
      language: transcript.language_code || null,
      transcript_text: transcript.text || '',
      transcript_words: transcript.words || [],
      summary,
      status: 'ready',
      error_message: null,
    });

    logActivity({
      userId: session.user.id,
      eventType: 'meeting.processing.succeeded',
      meetingId: meeting.id,
      cpCode: meeting.cp_code,
      payload: {
        meeting_type: meeting.meeting_type || 'engagement',
        transcript_length: (transcript.text || '').length,
        score: summary?.score?.total ?? null,
        classification: summary?.score?.classification || summary?.engagement?.sentiment || null,
      },
      request,
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (e) {
    console.error('[meetings/process] failed', { id, message: e?.message });
    logActivity({
      userId: session.user.id,
      eventType: 'meeting.processing.failed',
      meetingId: meeting.id,
      cpCode: meeting.cp_code,
      payload: { error: (e?.message || 'Processing failed').slice(0, 500) },
      request,
    });

    // Mark the row failed so the UI can surface it (and admins can retry/clean up).
    try {
      await updateMeeting(meeting.id, {
        status: 'failed',
        error_message: (e?.message || 'Processing failed').slice(0, 500),
      });
    } catch {}

    // Best-effort: clean up the orphan blob so the bucket doesn't grow unboundedly.
    if (meeting.audio_url && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(meeting.audio_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {}
    }

    return NextResponse.json({ error: e?.message || 'Processing failed' }, { status: 500 });
  }
}
