import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/direct/check
// Body: { filenames: string[] }
// Returns { existing: string[] } — the filenames this RM has ALREADY uploaded,
// so the upload UI can skip them instead of re-transcribing (which costs
// ElevenLabs credits).
export async function POST(request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'direct_rm' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const filenames = Array.isArray(body?.filenames)
    ? body.filenames.filter((f) => typeof f === 'string' && f).slice(0, 200)
    : [];
  if (filenames.length === 0) return NextResponse.json({ existing: [] });

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT DISTINCT source_filename
    FROM meetings
    WHERE rm_id = ${session.user.id}
      AND source_filename = ANY(${filenames}::text[])
  `;
  return NextResponse.json({ existing: rows.map((r) => r.source_filename) });
}
