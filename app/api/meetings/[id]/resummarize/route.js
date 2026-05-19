import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMeetingForProcessing, updateMeeting } from '@/lib/queries';
import { summarizeWithClaude } from '@/lib/claude';

export const runtime = 'nodejs';
// Summarization-only re-run uses the existing transcript_text. No fresh
// transcription is needed, so this is much faster than /process.
export const maxDuration = 120;

// POST /api/meetings/[id]/resummarize
// Re-runs Claude against the EXISTING transcript_text and rebuilds the
// combined { engagement, visit, signals, score } summary. Owner or admin only.
export async function POST(_request, { params }) {
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

  try {
    const summary = await summarizeWithClaude(meeting.transcript_text, {
      rm_name: session.user.name,
      cp_code: meeting.cp_code,
      cp_mobile: meeting.cp_mobile,
      purpose: meeting.purpose,
      duration_seconds: meeting.duration_seconds,
    });

    const updated = await updateMeeting(meeting.id, {
      summary,
      status: 'ready',
      error_message: null,
    });

    return NextResponse.json({ ok: true, summary: updated.summary });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Re-summarize failed' },
      { status: 500 }
    );
  }
}
