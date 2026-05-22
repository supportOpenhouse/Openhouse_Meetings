import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import { like } from 'drizzle-orm';
import { auth } from '@/auth';
import { insertMeeting } from '@/lib/queries';
import { parseCallFilename } from '@/lib/callRecording';
import { cpDb, isCpDbConfigured, channelPartners, normalizePhone } from '@/lib/cpDb';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';

// POST /api/rm/upload
// Body: { audio_url, filename, last_modified, duration_seconds, meeting_type }
// The RM "Upload recording" screen. Like the direct-RM upload, but: the phone
// number parsed from the filename is matched against the CP inventory to fill
// cp_code + cp_name, and meeting_type is engagement|onboarding so the recording
// gets a real smart summary (the /process route summarizes those types).
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'rm' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { audio_url, filename, last_modified, duration_seconds, meeting_type } = body;
  if (!audio_url) return NextResponse.json({ error: 'audio_url required' }, { status: 400 });

  const type = meeting_type === 'onboarding' ? 'onboarding' : 'engagement';

  // SSRF guard — our own Blob host only.
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

  // Dedupe on (rm_id, source_filename).
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

  // Look the phone number up in the CP inventory to fill cp_code + name.
  let cp_code = null;
  let cp_name = parsed.cp_name;
  const phone = normalizePhone(parsed.cp_mobile);
  if (phone && isCpDbConfigured()) {
    try {
      const rows = await cpDb
        .select({
          cp_code: channelPartners.cp_code,
          name: channelPartners.name,
        })
        .from(channelPartners)
        .where(like(channelPartners.phone, `%${phone}`))
        .limit(1);
      if (rows[0]) {
        cp_code = rows[0].cp_code || null;
        if (rows[0].name) cp_name = rows[0].name;
      }
    } catch (e) {
      console.warn('[rm/upload] CP lookup failed', e?.message || e);
    }
  }

  const meeting = await insertMeeting({
    rm_id: session.user.id,
    cp_code,
    cp_mobile: parsed.cp_mobile,
    cp_name,
    cp_city: null,
    purpose: null,
    meeting_type: type,
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
    cpCode: cp_code,
    payload: {
      meeting_type: type,
      via: 'rm_call_upload',
      matched_cp: !!cp_code,
      source_filename: cleanFilename,
    },
    request,
  });

  return NextResponse.json({ id: meeting.id, matched_cp: !!cp_code });
}
