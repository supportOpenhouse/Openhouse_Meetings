import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertMeeting } from '@/lib/queries';

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
  } = body;

  if (!audio_url) return NextResponse.json({ error: 'audio_url required' }, { status: 400 });
  if (!cp_code || !cp_mobile) {
    return NextResponse.json({ error: 'cp_code and cp_mobile required' }, { status: 400 });
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

  const meeting = await insertMeeting({
    rm_id: session.user.id,
    cp_code: cp_code.trim(),
    cp_mobile: cp_mobile.trim(),
    cp_name: cp_name?.trim() || null,
    cp_city: cp_city?.trim() || null,
    purpose: purpose?.trim() || null,
    started_at: started_at ? new Date(started_at) : new Date(),
    duration_seconds: parseInt(duration_seconds || 0, 10),
    audio_url,
    status: 'processing',
  });

  return NextResponse.json({ id: meeting.id });
}
