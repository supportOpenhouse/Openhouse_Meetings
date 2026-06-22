import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { auth } from '@/auth';
import { getSalesVisitForProcessing, updateSalesVisit } from '@/lib/salesQueries';
import { transcribeWithElevenLabs } from '@/lib/elevenlabs';
import { summarizeSalesVisit } from '@/lib/salesClaude';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';
// I/O wait (ElevenLabs, Claude) doesn't bill as active CPU on Fluid Compute.
export const maxDuration = 800;

// Background job for a sales visit: fetch audio from Blob → transcribe →
// summarize → persist. Fired by the browser with keepalive immediately before
// it navigates away from the new-visit screen.
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const visit = await getSalesVisitForProcessing(id);
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 });

  // Lock against a re-fire (browser retry) double-processing.
  if (visit.status !== 'processing') {
    return NextResponse.json({ ok: true, alreadyProcessed: true, status: visit.status });
  }
  if (visit.sales_rm_id !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!visit.audio_url) {
    return NextResponse.json({ error: 'Visit has no audio_url' }, { status: 400 });
  }

  logActivity({
    userId: session.user.id,
    eventType: 'meeting.processing.started',
    cpCode: visit.cp_code,
    payload: { kind: 'sales_visit' },
    request,
  });

  try {
    const audioRes = await fetch(visit.audio_url);
    if (!audioRes.ok) throw new Error(`Could not fetch uploaded audio: ${audioRes.status}`);
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const mime = audioRes.headers.get('content-type') || 'audio/webm';

    const transcript = await transcribeWithElevenLabs(
      buf,
      mime,
      process.env.ELEVENLABS_LANGUAGE || ''
    );

    const summary = await summarizeSalesVisit(transcript.text || '', {
      rm_name: session.user.name,
      cp_code: visit.cp_code,
      cp_name: visit.cp_name,
      meeting_type: visit.meeting_type,
      key_discussion_points: visit.key_discussion_points,
      duration_seconds: visit.duration_seconds,
    });

    const updated = await updateSalesVisit(visit.id, {
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
      cpCode: visit.cp_code,
      payload: {
        kind: 'sales_visit',
        transcript_length: (transcript.text || '').length,
        cp_sentiment: summary?.cp_sentiment || null,
        onboarding_stage: summary?.onboarding_stage || null,
      },
      request,
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (e) {
    console.error('[sales/visits/process] failed', { id, message: e?.message });
    logActivity({
      userId: session.user.id,
      eventType: 'meeting.processing.failed',
      cpCode: visit.cp_code,
      payload: { kind: 'sales_visit', error: (e?.message || 'Processing failed').slice(0, 500) },
      request,
    });

    try {
      await updateSalesVisit(visit.id, {
        status: 'failed',
        error_message: (e?.message || 'Processing failed').slice(0, 500),
      });
    } catch {}

    // Best-effort orphan-blob cleanup.
    if (visit.audio_url && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(visit.audio_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {}
    }

    return NextResponse.json({ error: e?.message || 'Processing failed' }, { status: 500 });
  }
}
