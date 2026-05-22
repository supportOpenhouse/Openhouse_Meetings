import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import { auth } from '@/auth';
import { insertMeeting } from '@/lib/queries';
import { parseCallFilename } from '@/lib/callRecording';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';

// POST /api/direct/upload
// Body: { audio_url, filename, last_modified, duration_seconds }
// Used by the direct-RM "Upload recordings" screen. The audio (an MP3 the RM
// pulled off their phone) is already in Vercel Blob; here we parse the phone
// number / contact name out of the filename, create a meeting row of
// meeting_type 'call', and return its id so the client can fire processing.
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'direct_rm' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { audio_url, filename, last_modified, duration_seconds } = body;
  if (!audio_url) return NextResponse.json({ error: 'audio_url required' }, { status: 400 });

  // SSRF guard — only our own Blob host.
  try {
    const u = new URL(audio_url);
    const ok =
      u.hostname.endsWith('.public.blob.vercel-storage.com') ||
      u.hostname.endsWith('.blob.vercel-storage.com');
    if (!ok) return NextResponse.json({ error: 'audio_url must be a Vercel Blob URL' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'invalid audio_url' }, { status: 400 });
  }

  const cleanFilename = String(filename || '').trim();
  const parsed = parseCallFilename(cleanFilename, last_modified);

  // Dedupe: this RM already uploaded a file with this exact name → skip
  // re-creating + re-transcribing (transcription costs ElevenLabs credits).
  // Best-effort delete of the just-uploaded duplicate blob to keep storage tidy.
  if (cleanFilename) {
    const sql = neon(process.env.DATABASE_URL);
    const dup = await sql`
      SELECT id FROM meetings
      WHERE rm_id = ${session.user.id} AND source_filename = ${cleanFilename}
      LIMIT 1
    `;
    if (dup[0]) {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try { await del(audio_url, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch {}
      }
      return NextResponse.json({ duplicate: true, id: dup[0].id });
    }
  }

  const meeting = await insertMeeting({
    rm_id: session.user.id,
    cp_code: null,
    cp_mobile: parsed.cp_mobile,
    cp_name: parsed.cp_name,
    cp_city: null,
    purpose: null,
    meeting_type: 'call',
    started_at: parsed.started_at,
    duration_seconds: parseInt(duration_seconds || 0, 10) || 0,
    audio_url,
    status: 'processing',
    source_filename: cleanFilename || null,
  });

  logActivity({
    userId: session.user.id,
    eventType: 'meeting.created',
    meetingId: meeting.id,
    payload: { meeting_type: 'call', label: parsed.cp_name, source_filename: filename },
    request,
  });

  return NextResponse.json({ id: meeting.id, label: parsed.cp_name });
}
