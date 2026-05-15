import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { del } from '@vercel/blob';
import { transcribeWithElevenLabs } from '@/lib/elevenlabs';
import { summarizeWithClaude } from '@/lib/claude';
import { insertMeeting } from '@/lib/queries';

export const runtime = 'nodejs';
// Vercel Pro w/ Fluid Compute allows up to 800s. I/O wait (ElevenLabs, Claude)
// doesn't count as active CPU time so the billing impact is small.
export const maxDuration = 800;

export async function POST(req) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
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
  } = body;

  if (!audio_url) {
    return NextResponse.json({ error: 'audio_url required' }, { status: 400 });
  }
  if (!cp_code || !cp_mobile) {
    return NextResponse.json({ error: 'cp_code and cp_mobile required' }, { status: 400 });
  }

  // Lock down audio_url to our own Blob host so this endpoint isn't an SSRF gadget
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
    return NextResponse.json(
      { error: 'audio_url must be a Vercel Blob URL' },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch the audio bytes back from Blob (cheap — Vercel internal network)
    const audioRes = await fetch(audio_url);
    if (!audioRes.ok) {
      throw new Error(`Could not fetch uploaded audio: ${audioRes.status}`);
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const mime = audioRes.headers.get('content-type') || 'audio/webm';

    // 2. Transcribe (Scribe v2 takes up to 3 GB so a 60-min file is fine)
    const transcript = await transcribeWithElevenLabs(
      buf,
      mime,
      process.env.ELEVENLABS_LANGUAGE || ''
    );

    // 3. Summarise
    const summary = await summarizeWithClaude(transcript.text || '', {
      rm_name: session.user.name,
      cp_code,
      cp_mobile,
      purpose,
    });

    // 4. Persist
    const meeting = await insertMeeting({
      rm_id: session.user.id,
      cp_code: cp_code.trim(),
      cp_mobile: cp_mobile.trim(),
      cp_name: cp_name?.trim() || null,
      cp_city: cp_city?.trim() || null,
      purpose: purpose?.trim() || null,
      started_at: started_at ? new Date(started_at) : new Date(),
      duration_seconds: parseInt(duration_seconds || 0, 10),
      language: transcript.language_code || null,
      audio_url,
      transcript_text: transcript.text || '',
      transcript_words: transcript.words || [],
      summary,
    });

    return NextResponse.json({ meeting });
  } catch (e) {
    console.error('process-meeting error:', e);

    // Best-effort cleanup so abandoned blobs don't pile up
    if (audio_url && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(audio_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch {}
    }

    return NextResponse.json(
      { error: e.message || 'Processing failed' },
      { status: 500 }
    );
  }
}
