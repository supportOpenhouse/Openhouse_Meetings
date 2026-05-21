import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/insights/meetings?ids=uuid,uuid,...
// Resolves the meeting ids an insight item cites into lightweight rows the
// dashboard can show + play (cp info, RM, audio_url). Admin only.
export async function GET(request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('ids') || '').trim();
  if (!raw) return NextResponse.json({ meetings: [] });

  // Keep only well-formed UUIDs, cap the count.
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 60);
  if (ids.length === 0) return NextResponse.json({ meetings: [] });

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT m.id, m.cp_code, m.cp_name, m.cp_mobile, m.meeting_type,
           m.started_at, m.duration_seconds, m.audio_url, u.name AS rm_name
    FROM meetings m
    LEFT JOIN users u ON u.id = m.rm_id
    WHERE m.id = ANY(${ids}::uuid[])
    ORDER BY m.started_at DESC
  `;
  return NextResponse.json({ meetings: rows });
}
