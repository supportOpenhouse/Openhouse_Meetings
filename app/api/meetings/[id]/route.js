import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMeetingById, deleteMeeting } from '@/lib/queries';
import { del } from '@vercel/blob';
import { logActivity } from '@/lib/activityLog';

export const runtime = 'nodejs';

export async function GET(req, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const m = await getMeetingById(id);
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // RMs can only see their own meetings
  if (session.user.role !== 'admin' && m.rm_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ meeting: m });
}

export async function DELETE(req, { params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const m = await getMeetingById(id);
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session.user.role !== 'admin' && m.rm_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Best-effort blob cleanup
  if (m.audio_url && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(m.audio_url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (e) {
      console.warn('Blob delete failed:', e.message);
    }
  }

  await deleteMeeting(id);

  logActivity({
    userId: session.user.id,
    eventType: 'meeting.deleted',
    meetingId: id,
    cpCode: m.cp_code,
    payload: { owner_rm_id: m.rm_id, by_role: session.user.role },
    request: req,
  });

  return NextResponse.json({ ok: true });
}
